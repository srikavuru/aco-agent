"""
RuleEngine — Deterministic compliance evaluation against rules.json.

Design intent:
- No black-box generation. Every finding maps to an explicit rule_id.
- Semantic matching uses sentence-transformers cosine similarity with
  configurable per-rule thresholds (not GPT "vibes").
- Keyword/regex checks are always deterministic.
- The engine does NOT make publish/reject decisions — it surfaces findings
  for human review only.
"""

import re
import logging
from dataclasses import dataclass, field
from typing import Any, Optional

from .semantic_matcher import SemanticMatcher

logger = logging.getLogger(__name__)


@dataclass
class Finding:
    rule_id: str
    rule_name: str
    severity: str          # CRITICAL | HIGH | MEDIUM | LOW
    category: str
    status: str            # FAIL | WARN | PASS
    match_type: str        # semantic | keyword_list | regex | computed
    failure_message: str
    matched_terms: list[str] = field(default_factory=list)
    semantic_score: Optional[float] = None
    semantic_threshold: Optional[float] = None
    legal_citation: Optional[str] = None
    remediation_template: Optional[str] = None
    region_applicable: bool = True


class RuleEngine:
    def __init__(self, rules: dict[str, Any], region: str, role_type: str):
        self.rules = rules
        self.region = region.upper()
        self.role_type = role_type.lower()
        self.semantic = SemanticMatcher()
        self._findings: list[Finding] = []

    def run(self, job_description: str) -> list[dict]:
        """
        Execute all rule categories against the job_description.
        Returns a list of Finding dicts sorted by severity.
        """
        jd_lower = job_description.lower()
        self._findings = []

        for category_key, category_data in self.rules.get("rule_categories", {}).items():
            for rule in category_data.get("rules", []):
                finding = self._evaluate_rule(rule, job_description, jd_lower, category_key)
                if finding:
                    self._findings.append(finding)

        # Sort: CRITICAL → HIGH → MEDIUM → LOW
        severity_order = {"CRITICAL": 0, "HIGH": 1, "MEDIUM": 2, "LOW": 3}
        self._findings.sort(key=lambda f: severity_order.get(f.severity, 9))

        return [self._finding_to_dict(f) for f in self._findings]

    # ── Rule dispatchers ──────────────────────────────────────────────────

    def _evaluate_rule(
        self,
        rule: dict,
        jd_raw: str,
        jd_lower: str,
        category: str
    ) -> Optional[Finding]:
        """Route each rule to its evaluation strategy."""

        rule_id = rule.get("rule_id", "UNKNOWN")
        match_type = rule.get("match_type", "keyword_list")

        # ── Region applicability check ──
        required_regions = rule.get("required_in_regions")
        if required_regions and self.region not in required_regions:
            return None  # This rule doesn't apply to the posting's region

        applicable_regions = rule.get("applicable_regions")
        region_applicable = True
        if applicable_regions and self.region not in applicable_regions:
            region_applicable = False  # Flag as info — not required in this region

        # ── Role type applicability check ──
        required_for_roles = rule.get("required_for_roles")
        if required_for_roles:
            if not any(r in self.role_type for r in required_for_roles):
                return None  # Rule scoped to roles that don't match

        try:
            if match_type == "semantic":
                return self._eval_semantic(rule, jd_raw, category, region_applicable)
            elif match_type == "keyword_list":
                return self._eval_keyword_list(rule, jd_lower, category, region_applicable)
            elif match_type == "keyword":
                return self._eval_keyword(rule, jd_lower, category, region_applicable)
            elif match_type == "regex":
                return self._eval_regex(rule, jd_raw, category, region_applicable)
            elif match_type == "computed":
                return self._eval_computed(rule, jd_raw, category, region_applicable)
            else:
                logger.warning("Unknown match_type '%s' for rule %s — skipping.", match_type, rule_id)
                return None
        except Exception as exc:
            logger.error("Error evaluating rule %s: %s", rule_id, exc, exc_info=True)
            return None

    # ── Evaluation strategies ─────────────────────────────────────────────

    def _eval_semantic(self, rule: dict, jd_raw: str, category: str, region_applicable: bool) -> Optional[Finding]:
        """
        Phase 2 Core: Semantic similarity check.
        
        If the cosine similarity between the JD and canonical_text (or any
        allowed_variant) falls BELOW the threshold, the rule fails.
        
        This is how we detect a "missing EEO statement" without requiring
        exact string matching — legal language varies, but semantic meaning
        must be present.
        """
        canonical = rule.get("canonical_text", "")
        threshold = rule.get("semantic_threshold", 0.75)
        variants = rule.get("allowed_variants", [])

        # Check canonical + all variants — pass if ANY clears the threshold
        candidates = [canonical] + variants
        best_score = 0.0

        for candidate in candidates:
            if not candidate:
                continue
            score = self.semantic.similarity(jd_raw, candidate)
            if score > best_score:
                best_score = score

        # Also check if any variant appears as a direct keyword substring (fast path)
        jd_lower = jd_raw.lower()
        direct_hit = any(v.lower() in jd_lower for v in variants if len(v) > 4)

        if direct_hit or best_score >= threshold:
            return None  # PASS — semantic match found

        # FAIL — required statement not detected
        severity = rule.get("severity", "HIGH")
        if not region_applicable:
            severity = "LOW"  # Downgrade if not required in this region

        return Finding(
            rule_id=rule["rule_id"],
            rule_name=rule.get("name", ""),
            severity=severity,
            category=category,
            status="FAIL",
            match_type="semantic",
            failure_message=rule.get("failure_message", "Semantic check failed."),
            semantic_score=round(best_score, 4),
            semantic_threshold=threshold,
            legal_citation=rule.get("legal_citation"),
            remediation_template=rule.get("remediation_template"),
            region_applicable=region_applicable
        )

    def _eval_keyword_list(self, rule: dict, jd_lower: str, category: str, region_applicable: bool) -> Optional[Finding]:
        """
        Check for presence of prohibited terms.
        Any match = FAIL. Returns all matched terms for transparency.
        """
        terms = rule.get("terms", [])
        matched = [t for t in terms if t.lower() in jd_lower]

        if not matched:
            return None  # PASS

        severity = rule.get("severity", "MEDIUM")
        if not region_applicable:
            severity = "LOW"

        return Finding(
            rule_id=rule["rule_id"],
            rule_name=rule.get("name", ""),
            severity=severity,
            category=category,
            status="FAIL",
            match_type="keyword_list",
            failure_message=rule.get("failure_message", "Prohibited term detected."),
            matched_terms=matched,
            legal_citation=rule.get("legal_citation"),
            region_applicable=region_applicable
        )

    def _eval_keyword(self, rule: dict, jd_lower: str, category: str, region_applicable: bool) -> Optional[Finding]:
        """
        Check that at least one keyword from the list IS present (required keyword).
        Missing = FAIL.
        """
        keywords = rule.get("keywords", [])
        found = [k for k in keywords if k.lower() in jd_lower]

        if found:
            return None  # PASS

        severity = rule.get("severity", "MEDIUM")
        if not region_applicable:
            severity = "LOW"

        return Finding(
            rule_id=rule["rule_id"],
            rule_name=rule.get("name", ""),
            severity=severity,
            category=category,
            status="FAIL",
            match_type="keyword",
            failure_message=rule.get("failure_message", "Required keyword not found."),
            matched_terms=[],  # Empty — nothing was found
            legal_citation=rule.get("legal_citation"),
            region_applicable=region_applicable
        )

    def _eval_regex(self, rule: dict, jd_raw: str, category: str, region_applicable: bool) -> Optional[Finding]:
        """
        Regex match for structured patterns like salary ranges ($X - $Y).
        """
        patterns = rule.get("patterns", [])
        matched_patterns = []

        for pattern in patterns:
            if re.search(pattern, jd_raw, re.IGNORECASE):
                matched_patterns.append(pattern)

        if matched_patterns:
            return None  # PASS — at least one pattern matched

        severity = rule.get("severity", "HIGH")
        if not region_applicable:
            severity = "LOW"

        return Finding(
            rule_id=rule["rule_id"],
            rule_name=rule.get("name", ""),
            severity=severity,
            category=category,
            status="FAIL",
            match_type="regex",
            failure_message=rule.get("failure_message", "Required pattern not found."),
            legal_citation=rule.get("legal_citation"),
            region_applicable=region_applicable
        )

    def _eval_computed(self, rule: dict, jd_raw: str, category: str, region_applicable: bool) -> Optional[Finding]:
        """
        Length and computed checks (char count, word count, etc.).
        """
        char_count = len(jd_raw.strip())

        min_chars = rule.get("minimum_chars")
        max_chars = rule.get("maximum_chars")

        if min_chars and char_count < min_chars:
            return Finding(
                rule_id=rule["rule_id"],
                rule_name=rule.get("name", ""),
                severity=rule.get("severity", "MEDIUM"),
                category=category,
                status="FAIL",
                match_type="computed",
                failure_message=f"{rule.get('failure_message', '')} (Current: {char_count} chars, Minimum: {min_chars})",
                region_applicable=region_applicable
            )

        if max_chars and char_count > max_chars:
            return Finding(
                rule_id=rule["rule_id"],
                rule_name=rule.get("name", ""),
                severity=rule.get("severity", "LOW"),
                category=category,
                status="FAIL",
                match_type="computed",
                failure_message=f"{rule.get('failure_message', '')} (Current: {char_count} chars, Maximum: {max_chars})",
                region_applicable=region_applicable
            )

        return None  # PASS

    # ── Serialization ─────────────────────────────────────────────────────

    @staticmethod
    def _finding_to_dict(f: Finding) -> dict:
        d = {
            "rule_id": f.rule_id,
            "rule_name": f.rule_name,
            "category": f.category,
            "severity": f.severity,
            "status": f.status,
            "match_type": f.match_type,
            "failure_message": f.failure_message,
            "region_applicable": f.region_applicable
        }
        if f.matched_terms:
            d["matched_terms"] = f.matched_terms
        if f.semantic_score is not None:
            d["semantic_score"] = f.semantic_score
            d["semantic_threshold"] = f.semantic_threshold
        if f.legal_citation:
            d["legal_citation"] = f.legal_citation
        if f.remediation_template:
            d["remediation_template"] = f.remediation_template
        return d
