"""
Audit Certificate Builder

Produces the canonical Audit Certificate JSON — the legal record of every
ACO evaluation. This is the artifact that gets:
  1. Returned to the caller (recruiter UI / ORC integration)
  2. Saved to CosmosDB (via cosmos_writer.py)
  3. Potentially exported as a PDF for legal hold

Schema is versioned. Breaking changes require AUDIT_CERT_VERSION bump
and a migration plan for existing CosmosDB records.
"""

from datetime import datetime, timezone
from typing import Any

AUDIT_CERT_VERSION = "1.0.0"

# Severity counts → overall status mapping
def _compute_overall_status(counts: dict[str, int]) -> str:
    """
    Decision support output — tells the recruiter what action is recommended.
    ACO never blocks autonomously. This is a recommendation signal only.
    """
    if counts.get("CRITICAL", 0) > 0:
        return "BLOCKED"           # Strong recommendation: do not publish
    elif counts.get("HIGH", 0) > 0:
        return "REVIEW_REQUIRED"   # Publish only after human sign-off
    elif counts.get("MEDIUM", 0) > 0:
        return "ADVISORY"          # Can publish; review flagged items
    elif counts.get("LOW", 0) > 0:
        return "INFO"              # Minor style notes; publishable
    else:
        return "APPROVED"          # All checks passed


def build_certificate(
    audit_id: str,
    posting_title: str,
    submitted_by: str,
    region: str,
    role_type: str,
    job_description_hash: str,
    findings: list[dict[str, Any]],
    rules_schema_version: str,
    req_number: str = "",
) -> dict[str, Any]:
    """
    Builds the full Audit Certificate from audit metadata + engine findings.
    This is the single source of truth for a completed audit.
    """
    now_utc = datetime.now(timezone.utc)

    # Severity counts
    counts: dict[str, int] = {"CRITICAL": 0, "HIGH": 0, "MEDIUM": 0, "LOW": 0}
    for finding in findings:
        sev = finding.get("severity", "LOW")
        if sev in counts:
            counts[sev] += 1

    overall_status = _compute_overall_status(counts)

    # Pull out CRITICAL findings for the summary block (executive attention)
    critical_findings = [f for f in findings if f.get("severity") == "CRITICAL"]
    high_findings = [f for f in findings if f.get("severity") == "HIGH"]

    # Escalation contacts from escalation_matrix would be injected here in prod
    action_required = overall_status in ("BLOCKED", "REVIEW_REQUIRED")

    certificate = {
        # ── Identity ───────────────────────────────────────────────────────
        "audit_id": audit_id,
        "certificate_version": AUDIT_CERT_VERSION,
        "rules_schema_version": rules_schema_version,

        # ── Timestamps ─────────────────────────────────────────────────────
        "audited_at": now_utc.isoformat(),                    # ISO 8601 UTC
        "audited_at_epoch": int(now_utc.timestamp()),         # CosmosDB TTL-compatible
        "ttl": None,                                           # Set in CosmosDB writer (e.g., 7 years in seconds)

        # ── Posting metadata ───────────────────────────────────────────────
        "posting": {
            "title": posting_title,
            "req_number": req_number,
            "region": region,
            "role_type": role_type,
            "job_description_fingerprint": job_description_hash,
            "submitted_by": submitted_by
        },

        # ── Audit result summary ───────────────────────────────────────────
        "audit_result": {
            "overall_status": overall_status,
            "action_required": action_required,
            "counts": counts,
            "total_findings": len(findings),
            "publish_recommendation": _publish_recommendation(overall_status),
            "escalation_note": _escalation_note(overall_status, critical_findings)
        },

        # ── Executive summary (for UI display) ────────────────────────────
        "executive_summary": {
            "critical_issues": [
                {
                    "rule_id": f["rule_id"],
                    "rule_name": f["rule_name"],
                    "failure_message": f["failure_message"],
                    "legal_citation": f.get("legal_citation")
                }
                for f in critical_findings
            ],
            "high_priority_issues": [
                {
                    "rule_id": f["rule_id"],
                    "rule_name": f["rule_name"],
                    "failure_message": f["failure_message"]
                }
                for f in high_findings
            ]
        },

        # ── Full findings detail ───────────────────────────────────────────
        # Complete record — every rule that fired, with all diagnostic data.
        # Sorted by severity (CRITICAL first) by the RuleEngine before arrival here.
        "findings": findings,

        # ── Legal record metadata ──────────────────────────────────────────
        # This block is for compliance record-keeping, not recruiter UI display.
        "legal_record": {
            "decision_authority": "HUMAN_RECRUITER",  # Never autonomous
            "tool_type": "DECISION_SUPPORT",
            "audit_engine": "ACO v1.0",
            "model_used_for_semantic": "all-MiniLM-L6-v2",
            "disclaimer": (
                "This audit is a decision support tool only. All publish/hold decisions "
                "are the responsibility of the submitting recruiter and their manager. "
                "This certificate does not constitute legal advice."
            )
        }
    }

    return certificate


def _publish_recommendation(status: str) -> str:
    recommendations = {
        "APPROVED": "This posting passed all compliance checks. Approved for distribution.",
        "INFO": "Minor style notes flagged. Posting is publishable — review LOW items at your discretion.",
        "ADVISORY": "MEDIUM-severity items flagged. Posting is publishable but review recommended before distribution.",
        "REVIEW_REQUIRED": "HIGH-severity issues detected. Obtain hiring manager and/or Legal sign-off before publishing.",
        "BLOCKED": "CRITICAL compliance violations detected. Do NOT publish this posting until all CRITICAL items are resolved. Contact Legal if needed."
    }
    return recommendations.get(status, "Status unknown — manual review required.")


def _escalation_note(status: str, critical_findings: list[dict]) -> str:
    if not critical_findings:
        return ""
    rule_ids = ", ".join(f["rule_id"] for f in critical_findings)
    return (
        f"Escalation required for: {rule_ids}. "
        "Notify recruiter and legal_counsel per escalation_matrix. SLA: 24 hours."
    )
