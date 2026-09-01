"""
ACO Agent — JD Lookup
Azure Function: jd_lookup
Trigger: HTTP POST
Route:   /api/jd-lookup

Takes a requisition number, finds the matching Vertiv posting, and returns
the job description as a screening-ready Markdown document the recruiter
saves next to the resumes they are screening.

Input:
  { "req_number": "20265195", "generated_by": "user@vertiv.com" }

Output:
  {
    "req_number": "...", "title": "...", "location": "...",
    "job_family": "...", "source_url": "...", "matched_by": "direct|search",
    "filename": "JD-20265195-senior-electrical-engineer.md",
    "markdown": "---\nreq_number: ...",
    "char_count": 4210
  }

This endpoint retrieves and formats a posting. It does not audit, score,
or evaluate anyone.
"""

import json
import logging
import time

import azure.functions as func
import requests

from shared.req_lookup import lookup_req, normalize_req, ReqNotFoundError
from shared.jd_markdown import build_jd_markdown, build_filename

logger = logging.getLogger(__name__)


def main(req: func.HttpRequest) -> func.HttpResponse:
    start = time.time()

    try:
        body = req.get_json()
    except ValueError:
        return _error("Request body must be valid JSON.", 400)

    raw_req = body.get("req_number") or body.get("reqNumber") or ""
    generated_by = (body.get("generated_by") or body.get("submitted_by") or "").strip()

    try:
        req_number = normalize_req(raw_req)
    except ValueError as e:
        return _error(str(e), 400)

    logger.info("jd_lookup requested for req %s", req_number)

    try:
        posting = lookup_req(req_number)
    except ReqNotFoundError as e:
        return _error(str(e), 404)
    except requests.RequestException as e:
        logger.error("Oracle HCM unreachable: %s", e, exc_info=True)
        return _error(f"Could not reach the careers site: {e}", 502)
    except Exception as e:
        logger.error("jd_lookup failed for %s: %s", req_number, e, exc_info=True)
        return _error(f"Lookup failed: {e}", 500)

    markdown = build_jd_markdown(posting, generated_by=generated_by)

    response = {
        "req_number": posting["req_number"],
        "job_id": posting["job_id"],
        "title": posting["title"],
        "location": posting["location"],
        "job_family": posting["job_family"],
        "posted_date": posting["posted_date"],
        "source_url": posting["source_url"],
        "matched_by": posting["matched_by"],
        "filename": build_filename(posting),
        "markdown": markdown,
        "char_count": len(posting["job_description"]),
        "elapsed_seconds": round(time.time() - start, 2),
    }

    logger.info(
        "jd_lookup resolved %s via %s in %.2fs",
        req_number, posting["matched_by"], response["elapsed_seconds"],
    )

    return func.HttpResponse(
        json.dumps(response, ensure_ascii=False),
        status_code=200,
        mimetype="application/json",
    )


def _error(msg: str, status: int) -> func.HttpResponse:
    return func.HttpResponse(
        json.dumps({"error": msg}),
        status_code=status,
        mimetype="application/json",
    )
