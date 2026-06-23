"""
ACO Agent — ORC Webhook
Azure Function: orc_webhook
Trigger: HTTP POST from Oracle Recruiting Cloud
Route:   /api/orc-webhook

Accepts an ORC "requisition draft saved" event payload, maps it to the
ACO audit input schema, runs the compliance audit, and returns the
Audit Certificate.

ORC integration pattern:
  ORC fires a webhook when a recruiter saves a draft requisition.
  The payload contains the req number, JD HTML, location, and job family.
  We strip HTML, map location → region code, map job family → role_type,
  then delegate to the same RuleEngine used by /api/audit.
"""

import json
import logging
import re
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

# ORC location string → two-letter state code
# ORC sends "City, ST" or "City, ST, US" — we extract the state abbreviation.
# Fallback: UNKNOWN (all rules with required_in_regions will be skipped).
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

# ORC job family → ACO role_type
_JOB_FAMILY_MAP = {
    "Engineering": "engineer",
    "Electrical Engineering": "engineer",
    "Mechanical Engineering": "engineer",
    "Software Engineering": "engineer",
    "Manufacturing": "manufacturing",
    "Manufacturing Operations": "manufacturing",
    "Research": "research",
    "Research & Development": "research",
    "Development": "research",
    "Systems Engineering": "engineer",
    "Sales": "sales",
    "Business Development": "sales",
    "Marketing": "general",
    "Human Resources": "general",
    "Finance": "general",
    "IT": "general",
    "Supply Chain": "general",
}


def main(req: func.HttpRequest) -> func.HttpResponse:
    logger.info("ACO orc_webhook triggered")

    try:
        body = req.get_json()
    except ValueError:
        return _error("Request body must be valid JSON.", 400)

    # ORC nests the requisition data under different keys depending on event type.
    # We support both the top-level object and the nested "requisition" key.
    requisition = body.get("requisition", body)

    req_number = requisition.get("requisitionNumber", "")
    title = requisition.get("title", "Untitled Posting")
    jd_html = requisition.get("jobDescription", "")
    location = requisition.get("primaryLocation", "")
    job_family = requisition.get("jobFamily", "")
    submitted_by = requisition.get("recruiterEmail", "orc-webhook")

    if not jd_html:
        return _error("jobDescription is required in the ORC payload.", 400)

    job_description = _strip_html(jd_html)

    if len(job_description) < 50:
        return _error(
            f"jobDescription too short after HTML stripping ({len(job_description)} chars).",
            400,
        )

    region = _map_location(location)
    role_type = _map_job_family(job_family)

    audit_id = f"ACO-{datetime.now(timezone.utc).strftime('%Y%m%d')}-{str(uuid.uuid4())[:8].upper()}"
    engine = RuleEngine(rules=RULES, region=region, role_type=role_type)
    findings = engine.run(job_description)

    certificate = build_certificate(
        audit_id=audit_id,
        posting_title=title,
        submitted_by=submitted_by,
        region=region,
        role_type=role_type,
        job_description_hash=_sha256_truncated(job_description),
        findings=findings,
        rules_schema_version=RULES.get("schema_version", "unknown"),
        req_number=req_number,
        rules_evaluated=engine.rules_evaluated,
    )

    logger.info(
        "ORC audit complete: %s | Req: %s | Status: %s",
        audit_id,
        req_number,
        certificate["audit_result"]["overall_status"],
    )

    return func.HttpResponse(
        json.dumps(certificate, indent=2, ensure_ascii=False),
        status_code=200,
        mimetype="application/json",
    )


def _strip_html(html: str) -> str:
    text = re.sub(r"<br\s*/?>", "\n", html, flags=re.IGNORECASE)
    text = re.sub(r"</?(p|div|li|ul|ol|h[1-6])[^>]*>", "\n", text, flags=re.IGNORECASE)
    text = re.sub(r"<[^>]+>", "", text)
    text = re.sub(r"&nbsp;", " ", text)
    text = re.sub(r"&amp;", "&", text)
    text = re.sub(r"&lt;", "<", text)
    text = re.sub(r"&gt;", ">", text)
    text = re.sub(r"&#\d+;", "", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def _map_location(location: str) -> str:
    if not location:
        return "UNKNOWN"
    # Try "City, ST" or "City, ST, US" pattern
    match = re.search(r",\s*([A-Z]{2})\b", location)
    if match and match.group(1) in _STATE_CODES:
        return match.group(1)
    # Try full state name
    for name, code in _US_STATES.items():
        if name.lower() in location.lower():
            return code
    return "UNKNOWN"


def _map_job_family(job_family: str) -> str:
    if not job_family:
        return "general"
    mapped = _JOB_FAMILY_MAP.get(job_family)
    if mapped:
        return mapped
    jf_lower = job_family.lower()
    if "engineer" in jf_lower:
        return "engineer"
    if "manufactur" in jf_lower:
        return "manufacturing"
    if "research" in jf_lower or "r&d" in jf_lower:
        return "research"
    if "sales" in jf_lower:
        return "sales"
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
