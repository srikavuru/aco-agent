"""
ACO Agent — Batch Audit All
Azure Function: audit_all
Trigger: HTTP POST
Route:   /api/audit-all

Crawls the Vertiv Oracle HCM careers site via REST API, fetches job
details for each posting, runs the compliance audit, and returns
a batch report with all certificates.

Input (all optional):
  { "limit": 25, "offset": 0 }

Output:
  { "total_jobs": 2271, "audited": 25, "results": [...], "summary": {...} }
"""

import json
import logging
import re
import uuid
import time
from datetime import datetime, timezone
from pathlib import Path

import azure.functions as func
import requests

from shared.rule_engine import RuleEngine
from shared.audit_certificate import build_certificate
from shared.url_fetcher import _strip_html, _clean_text

logger = logging.getLogger(__name__)

RULES_PATH = Path(__file__).parent.parent / "data" / "rules" / "rules.json"
with open(RULES_PATH, "r", encoding="utf-8") as f:
    RULES = json.load(f)

ORC_HOST = "egup.fa.us2.oraclecloud.com"
SITE = "CX"

_STATE_CODES = {
    "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA",
    "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD",
    "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ",
    "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC",
    "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY",
}

_JOB_FAMILY_KEYWORDS = {
    "engineer": "engineer", "firmware": "engineer", "software": "engineer",
    "electrical": "engineer", "mechanical": "engineer", "systems": "engineer",
    "manufactur": "manufacturing", "production": "manufacturing",
    "research": "research", "r&d": "research",
    "sales": "sales", "business development": "sales",
}


def main(req: func.HttpRequest) -> func.HttpResponse:
    start = time.time()
    logger.info("ACO audit_all triggered")

    try:
        body = req.get_json()
    except ValueError:
        body = {}

    limit = min(int(body.get("limit", 25)), 50)
    offset = int(body.get("offset", 0))

    # ── 1. List jobs from Oracle HCM ──────────────────────────────────────
    try:
        job_list, total_jobs = _list_jobs(limit, offset)
    except Exception as e:
        logger.error("Failed to list jobs: %s", e, exc_info=True)
        return _error(f"Failed to fetch job listings: {e}", 502)

    if not job_list:
        return func.HttpResponse(
            json.dumps({"total_jobs": total_jobs, "audited": 0, "results": [], "summary": {}}),
            status_code=200,
            mimetype="application/json",
        )

    # ── 2. Fetch details + audit each ─────────────────────────────────────
    results = []
    for job in job_list:
        job_id = str(job.get("Id", ""))
        title = job.get("Title", "Untitled")

        try:
            detail = _fetch_detail(job_id)
            jd = _clean_text(_strip_html(detail.get("ExternalDescriptionStr", "")))

            if len(jd) < 50:
                results.append({"job_id": job_id, "title": title, "error": "JD too short", "status": "SKIPPED"})
                continue

            location = detail.get("PrimaryLocation", "")
            category = detail.get("Category", "") or detail.get("JobFunction", "")
            region = _map_location(location)
            role_type = _map_job_family(category)

            audit_id = f"ACO-{datetime.now(timezone.utc).strftime('%Y%m%d')}-{str(uuid.uuid4())[:8].upper()}"
            engine = RuleEngine(rules=RULES, region=region, role_type=role_type)
            findings = engine.run(jd)

            cert = build_certificate(
                audit_id=audit_id,
                posting_title=title,
                submitted_by="audit_all_pipeline",
                region=region,
                role_type=role_type,
                job_description_hash=_sha256(jd),
                findings=findings,
                rules_schema_version=RULES.get("schema_version", "unknown"),
                req_number=job_id,
                rules_evaluated=engine.rules_evaluated,
            )
            results.append(cert)

        except Exception as e:
            logger.warning("Failed to audit job %s: %s", job_id, e)
            results.append({"job_id": job_id, "title": title, "error": str(e), "status": "ERROR"})

    # ── 3. Build summary ──────────────────────────────────────────────────
    audited = [r for r in results if "audit_result" in r]
    status_counts = {}
    total_findings = 0
    for r in audited:
        s = r["audit_result"]["overall_status"]
        status_counts[s] = status_counts.get(s, 0) + 1
        total_findings += r["audit_result"]["total_findings"]

    elapsed = round(time.time() - start, 1)

    response = {
        "total_jobs": total_jobs,
        "audited": len(audited),
        "skipped": len([r for r in results if r.get("status") == "SKIPPED"]),
        "errors": len([r for r in results if r.get("status") == "ERROR"]),
        "elapsed_seconds": elapsed,
        "summary": {
            "status_breakdown": status_counts,
            "total_findings": total_findings,
        },
        "results": results,
    }

    logger.info("audit_all complete: %d audited in %.1fs", len(audited), elapsed)

    return func.HttpResponse(
        json.dumps(response, indent=2, ensure_ascii=False),
        status_code=200,
        mimetype="application/json",
    )


def _list_jobs(limit, offset):
    url = (
        f"https://{ORC_HOST}/hcmRestApi/resources/latest/recruitingCEJobRequisitions"
        f"?onlyData=true&expand=requisitionList&limit={limit}&offset={offset}"
        f"&finder=findReqs;siteNumber={SITE},facetsList=POSTING_DATES"
    )
    resp = requests.get(url, headers={"Accept": "application/json"}, timeout=30)
    resp.raise_for_status()
    data = resp.json()
    top = data.get("items", [{}])[0]
    total = top.get("TotalJobsCount", 0)
    jobs = top.get("requisitionList", [])
    return jobs, total


def _fetch_detail(job_id):
    url = (
        f"https://{ORC_HOST}/hcmRestApi/resources/latest/recruitingCEJobRequisitionDetails"
        f"?expand=all&onlyData=true&finder=ById;Id=%22{job_id}%22,siteNumber={SITE}"
    )
    resp = requests.get(url, headers={"Accept": "application/json"}, timeout=30)
    resp.raise_for_status()
    items = resp.json().get("items", [])
    if not items:
        raise ValueError(f"No detail found for job {job_id}")
    return items[0]


def _map_location(loc):
    if not loc:
        return "UNKNOWN"
    m = re.search(r",\s*([A-Z]{2})\b", loc)
    if m and m.group(1) in _STATE_CODES:
        return m.group(1)
    return "UNKNOWN"


def _map_job_family(jf):
    jf_lower = (jf or "").lower()
    for kw, role in _JOB_FAMILY_KEYWORDS.items():
        if kw in jf_lower:
            return role
    return "general"


def _sha256(text, length=16):
    import hashlib
    return hashlib.sha256(text.encode("utf-8")).hexdigest()[:length]


def _error(msg, status):
    return func.HttpResponse(
        json.dumps({"error": msg}),
        status_code=status,
        mimetype="application/json",
    )
