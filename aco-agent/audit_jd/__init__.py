"""
ACO Agent — Automated Compliance Auditor
Azure Function: audit_jd
Trigger: HTTP POST
Input:  { "job_description": "...", "region": "OH", "role_type": "engineer" }
Output: Structured Audit Certificate (JSON)

Architecture: Decision Support only — flags issues for human recruiter review.
No autonomous publish/block capability. All final decisions are human-owned.
"""

import json
import logging
import uuid
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

import azure.functions as func

from shared.rule_engine import RuleEngine
from shared.semantic_matcher import SemanticMatcher
from shared.audit_certificate import build_certificate

logger = logging.getLogger(__name__)

# Load rules once at cold start — avoids re-read on every invocation
RULES_PATH = Path(__file__).parent.parent / "data" / "rules" / "rules.json"
with open(RULES_PATH, "r", encoding="utf-8") as f:
    RULES = json.load(f)


def main(req: func.HttpRequest) -> func.HttpResponse:
    """
    Entry point. Validates input, runs audit, returns Audit Certificate JSON.
    """
    logger.info("ACO audit_jd triggered")

    # ── 1. Parse and validate request ──────────────────────────────────────
    try:
        body = req.get_json()
    except ValueError:
        return func.HttpResponse(
            json.dumps({"error": "Request body must be valid JSON."}),
            status_code=400,
            mimetype="application/json"
        )

    job_description: str = body.get("job_description", "").strip()
    region: str = body.get("region", "UNKNOWN").upper()
    role_type: str = body.get("role_type", "general").lower()
    submitted_by: str = body.get("submitted_by", "unknown_recruiter")
    posting_title: str = body.get("posting_title", "Untitled Posting")
    req_number: str = body.get("req_number", "").strip()

    if not job_description:
        return func.HttpResponse(
            json.dumps({"error": "job_description is required and cannot be empty."}),
            status_code=400,
            mimetype="application/json"
        )

    if len(job_description) < 50:
        return func.HttpResponse(
            json.dumps({"error": "job_description too short to audit meaningfully (< 50 chars)."}),
            status_code=400,
            mimetype="application/json"
        )

    # ── 2. Run the audit ────────────────────────────────────────────────────
    audit_id = f"ACO-{datetime.now(timezone.utc).strftime('%Y%m%d')}-{str(uuid.uuid4())[:8].upper()}"
    engine = RuleEngine(rules=RULES, region=region, role_type=role_type)
    findings = engine.run(job_description)

    # ── 3. Build and return Audit Certificate ───────────────────────────────
    certificate = build_certificate(
        audit_id=audit_id,
        posting_title=posting_title,
        submitted_by=submitted_by,
        region=region,
        role_type=role_type,
        job_description_hash=_sha256_truncated(job_description),
        findings=findings,
        rules_schema_version=RULES.get("schema_version", "unknown"),
        req_number=req_number,
    )

    status_code = 200
    if certificate["audit_result"]["overall_status"] in ("BLOCKED", "REVIEW_REQUIRED"):
        status_code = 200  # Still 200 — the blocking decision is human-owned, not the API's

    logger.info(
        "Audit complete: %s | Status: %s | Critical: %d | High: %d",
        audit_id,
        certificate["audit_result"]["overall_status"],
        certificate["audit_result"]["counts"]["CRITICAL"],
        certificate["audit_result"]["counts"]["HIGH"]
    )

    return func.HttpResponse(
        json.dumps(certificate, indent=2, ensure_ascii=False),
        status_code=status_code,
        mimetype="application/json"
    )


def _sha256_truncated(text: str, length: int = 16) -> str:
    """Non-reversible fingerprint of the audited text for the audit trail."""
    import hashlib
    return hashlib.sha256(text.encode("utf-8")).hexdigest()[:length]
