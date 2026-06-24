"""
ACO Agent — Automated Compliance Auditor
Azure Function: audit_jd
Trigger: HTTP POST
Input:  { "job_description": "..." } or { "url": "https://..." }
Output: Structured Audit Certificate (JSON)

Supports two input modes:
  1. Direct text: pass "job_description" with the full JD text
  2. URL mode: pass "url" with an Oracle HCM job posting URL —
     the function scrapes the page via Playwright and extracts
     title, req_number, location, job_family, and job_description.
     Scraped fields auto-populate the certificate; explicit fields
     in the request body override scraped values.
"""

import json
import logging
import uuid
from datetime import datetime, timezone
from pathlib import Path

import azure.functions as func

from shared.rule_engine import RuleEngine
from shared.audit_certificate import build_certificate

logger = logging.getLogger(__name__)

RULES_PATH = Path(__file__).parent.parent / "data" / "rules" / "rules.json"
with open(RULES_PATH, "r", encoding="utf-8") as f:
    RULES = json.load(f)

# Location string → state code (same map as orc_webhook)
_US_STATES = {
    "Alabama": "AL", "Alaska": "AK", "Arizona": "AZ", "Arkansas": "AR",
    "California": "CA", "Colorado": "CO", "Connecticut": "CT", "Delaware": "DE",
    "Florida": "FL", "Georgia": "GA", "Hawaii": "HI", "Idaho": "ID",
    "Illinois": "IL", "Indiana": "IN", "Iowa": "IA", "Kansas": "KS",
    "Kentucky": "KY", "Louisiana": "LA", "Maine": "ME", "Maryland": "MD",
    "Massachusetts": "MA", "Michigan": "MI", "Minnesota": "MN", "Mississippi": "MS",
    "Missouri": "MO", "Montana": "MT", "Nebraska": "NE", "Nevada": "NV",
    "New Hampshire": "NH", "New Jersey": "NJ", "New Mexico": "NM", "New York": "NY",
    "North Carolina": "NC", "North Dakota": "ND", "Ohio": "OH", "Oklahoma": "OK",
    "Oregon": "OR", "Pennsylvania": "PA", "Rhode Island": "RI", "South Carolina": "SC",
    "South Dakota": "SD", "Tennessee": "TN", "Texas": "TX", "Utah": "UT",
    "Vermont": "VT", "Virginia": "VA", "Washington": "WA", "West Virginia": "WV",
    "Wisconsin": "WI", "Wyoming": "WY",
}
_STATE_CODES = set(_US_STATES.values())

_JOB_FAMILY_MAP = {
    "engineering": "engineer", "electrical": "engineer", "mechanical": "engineer",
    "software": "engineer", "systems": "engineer", "firmware": "engineer",
    "manufacturing": "manufacturing", "production": "manufacturing",
    "research": "research", "r&d": "research",
    "sales": "sales", "business development": "sales",
}


def main(req: func.HttpRequest) -> func.HttpResponse:
    logger.info("ACO audit_jd triggered")

    try:
        body = req.get_json()
    except ValueError:
        return _error("Request body must be valid JSON.", 400)

    url = body.get("url", "").strip()
    job_description = body.get("job_description", "").strip()
    scraped = None

    # ── URL mode: fetch via Oracle HCM REST API ─────────────────────────
    if url and not job_description:
        try:
            from shared.url_fetcher import fetch_posting
            scraped = fetch_posting(url)
            job_description = scraped["job_description"]
        except Exception as e:
            logger.error("URL fetch failed: %s", e, exc_info=True)
            return _error(f"Failed to fetch job posting from URL: {e}", 422)

    if not job_description:
        return _error("job_description or url is required.", 400)

    if len(job_description) < 50:
        return _error("job_description too short to audit meaningfully (< 50 chars).", 400)

    # ── Resolve fields: explicit body values override scraped values ──────
    posting_title = body.get("posting_title", "").strip()
    req_number = body.get("req_number", "").strip()
    region = body.get("region", "").strip().upper()
    role_type = body.get("role_type", "").strip().lower()
    submitted_by = body.get("submitted_by", "unknown_recruiter")

    if scraped:
        if not posting_title:
            posting_title = scraped.get("title", "")
        if not req_number:
            req_number = scraped.get("req_number", "")
        if not region:
            region = _map_location(scraped.get("location", ""))
        if not role_type:
            role_type = _map_job_family(scraped.get("job_family", ""))

    posting_title = posting_title or "Untitled Posting"
    region = region or "UNKNOWN"
    role_type = role_type or "general"

    # ── Run the audit ─────────────────────────────────────────────────────
    audit_id = f"ACO-{datetime.now(timezone.utc).strftime('%Y%m%d')}-{str(uuid.uuid4())[:8].upper()}"
    engine = RuleEngine(rules=RULES, region=region, role_type=role_type)
    findings = engine.run(job_description)

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
        rules_evaluated=engine.rules_evaluated,
    )

    # Attach scraped metadata so the UI can auto-populate fields
    if scraped:
        certificate["_scraped"] = {
            "title": scraped.get("title", ""),
            "req_number": scraped.get("req_number", ""),
            "location": scraped.get("location", ""),
            "job_family": scraped.get("job_family", ""),
            "source_url": scraped.get("source_url", ""),
            "job_description_length": len(job_description),
        }

    logger.info(
        "Audit complete: %s | Status: %s | Critical: %d | High: %d%s",
        audit_id,
        certificate["audit_result"]["overall_status"],
        certificate["audit_result"]["counts"]["CRITICAL"],
        certificate["audit_result"]["counts"]["HIGH"],
        f" | URL: {url}" if url else "",
    )

    return func.HttpResponse(
        json.dumps(certificate, indent=2, ensure_ascii=False),
        status_code=200,
        mimetype="application/json",
    )


import re

def _map_location(location: str) -> str:
    if not location:
        return "UNKNOWN"
    match = re.search(r",\s*([A-Z]{2})\b", location)
    if match and match.group(1) in _STATE_CODES:
        return match.group(1)
    for name, code in _US_STATES.items():
        if name.lower() in location.lower():
            return code
    return "UNKNOWN"


def _map_job_family(job_family: str) -> str:
    if not job_family:
        return "general"
    jf_lower = job_family.lower()
    for keyword, role in _JOB_FAMILY_MAP.items():
        if keyword in jf_lower:
            return role
    return "general"


def _sha256_truncated(text: str, length: int = 16) -> str:
    import hashlib
    return hashlib.sha256(text.encode("utf-8")).hexdigest()[:length]


def _error(msg: str, status: int) -> func.HttpResponse:
    return func.HttpResponse(
        json.dumps({"error": msg}),
        status_code=status,
        mimetype="application/json",
    )
