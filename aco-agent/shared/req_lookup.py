"""
Req Lookup — Resolves a requisition number to a structured job posting.

Recruiters know a req by its number, not by its Oracle HCM URL. This module
takes whatever the recruiter types and finds the matching posting on the
Vertiv Oracle HCM candidate experience site.

Two strategies, tried in order:

1. Direct fetch — the candidate-experience Id is the number that appears in
   the posting URL (.../CX/job/20265195). If the recruiter typed that, one
   API call resolves it.
2. Keyword search — if the direct fetch misses, page through the public
   requisition list searching for the number in the Id, requisition number,
   and title fields. Handles the case where the internal req number differs
   from the CX Id.

No browser required — plain REST, same as shared/url_fetcher.py.
"""

import logging
import re

import requests

from shared.url_fetcher import _strip_html, _clean_text

logger = logging.getLogger(__name__)

ORC_HOST = "egup.fa.us2.oraclecloud.com"
SITE = "CX"

# How many list pages to walk before giving up on the keyword search.
SEARCH_PAGE_SIZE = 50
SEARCH_MAX_PAGES = 6

# Fields on a requisition-list item that may carry a req number.
_ID_FIELDS = ("Id", "RequisitionNumber", "RequisitionId", "ReqNumber", "JobId")


class ReqNotFoundError(Exception):
    """Raised when no posting matches the supplied requisition number."""


def normalize_req(raw: str) -> str:
    """
    Strip decoration recruiters add to req numbers.

    'REQ-20265195', 'req 20265195', '#20265195' all normalize to '20265195'.
    Alphanumeric req schemes are preserved as-is (uppercased, trimmed).
    """
    if raw is None:
        raise ValueError("Requisition number is required")

    cleaned = str(raw).strip().upper()
    cleaned = re.sub(r"^(REQUISITION|REQ|JOB)[\s\-_#:.]*", "", cleaned)
    cleaned = cleaned.lstrip("#").strip()

    if not cleaned:
        raise ValueError("Requisition number is required")

    return cleaned


def lookup_req(req_number: str, host: str = ORC_HOST, site: str = SITE) -> dict:
    """
    Resolve a requisition number to a posting dict.

    Returns the same shape as shared.url_fetcher.fetch_posting:
      title, req_number, location, job_description, job_family, source_url
    plus posted_date and matched_by (how it was resolved).

    Raises ReqNotFoundError if nothing matches.
    """
    req = normalize_req(req_number)

    detail = _fetch_detail(req, host, site)
    if detail:
        posting = _to_posting(detail, req, host, site)
        posting["matched_by"] = "direct"
        return posting

    logger.info("Direct lookup missed for %s — falling back to keyword search", req)

    match = _search_list(req, host, site)
    if not match:
        raise ReqNotFoundError(
            f"No posting found for requisition {req}. "
            "Check the number, or confirm the req is still posted externally."
        )

    detail = _fetch_detail(str(match.get("Id", "")), host, site)
    if not detail:
        raise ReqNotFoundError(
            f"Requisition {req} appears in the job list but its detail page "
            "could not be loaded."
        )

    posting = _to_posting(detail, req, host, site)
    posting["matched_by"] = "search"
    return posting


# ── Oracle HCM REST calls ─────────────────────────────────────────────────────

def _fetch_detail(job_id: str, host: str, site: str) -> dict | None:
    """Fetch one requisition's detail record. Returns None if not found."""
    if not job_id:
        return None

    url = (
        f"https://{host}/hcmRestApi/resources/latest/recruitingCEJobRequisitionDetails"
        f"?expand=all&onlyData=true&finder=ById;Id=%22{job_id}%22,siteNumber={site}"
    )
    try:
        resp = requests.get(url, headers={"Accept": "application/json"}, timeout=30)
        resp.raise_for_status()
    except requests.RequestException as e:
        logger.warning("Detail fetch failed for %s: %s", job_id, e)
        return None

    items = resp.json().get("items", [])
    return items[0] if items else None


def _search_list(req: str, host: str, site: str) -> dict | None:
    """Page through the public requisition list looking for the req number."""
    for page in range(SEARCH_MAX_PAGES):
        offset = page * SEARCH_PAGE_SIZE
        try:
            jobs, total = _list_jobs(req, SEARCH_PAGE_SIZE, offset, host, site)
        except requests.RequestException as e:
            logger.warning("Job list page %d failed: %s", page, e)
            return None

        for job in jobs:
            if _matches(job, req):
                return job

        if not jobs or offset + SEARCH_PAGE_SIZE >= total:
            return None

    return None


def _list_jobs(keyword: str, limit: int, offset: int, host: str, site: str):
    """Query the candidate-experience requisition list, filtered by keyword."""
    url = (
        f"https://{host}/hcmRestApi/resources/latest/recruitingCEJobRequisitions"
        f"?onlyData=true&expand=requisitionList&limit={limit}&offset={offset}"
        f"&finder=findReqs;siteNumber={site},keyword=%22{keyword}%22"
        f",facetsList=POSTING_DATES"
    )
    resp = requests.get(url, headers={"Accept": "application/json"}, timeout=30)
    resp.raise_for_status()

    items = resp.json().get("items", [])
    if not items:
        return [], 0

    top = items[0]
    return top.get("requisitionList", []), top.get("TotalJobsCount", 0)


def _matches(job: dict, req: str) -> bool:
    """True if any identifier field on the list item equals the req number."""
    for field in _ID_FIELDS:
        value = job.get(field)
        if value and normalize_req(str(value)) == req:
            return True

    # Some tenants embed the req number in the title, e.g. "Sr EE (20265195)".
    title = str(job.get("Title", ""))
    return bool(re.search(rf"\b{re.escape(req)}\b", title))


# ── Shaping ───────────────────────────────────────────────────────────────────

def _to_posting(item: dict, req: str, host: str, site: str) -> dict:
    """Normalize an Oracle detail record into the standard posting dict."""
    description = _strip_html(item.get("ExternalDescriptionStr", ""))
    if not description:
        description = _strip_html(item.get("ShortDescriptionStr", ""))

    raw_html = item.get("ExternalDescriptionStr", "") or item.get(
        "ShortDescriptionStr", ""
    )
    job_id = str(item.get("Id", "")) or req

    posting = {
        "title": item.get("Title", "") or "Untitled Requisition",
        "req_number": str(item.get("RequisitionNumber", "") or req),
        "job_id": job_id,
        "location": item.get("PrimaryLocation", "") or "",
        "job_description": _clean_text(description),
        "job_description_html": raw_html,
        "job_family": item.get("Category", "") or item.get("JobFunction", "") or "",
        "posted_date": item.get("PostedDate", "") or "",
        "source_url": (
            f"https://{host}/hcmUI/CandidateExperience/en/sites/{site}/job/{job_id}"
        ),
    }

    if len(posting["job_description"]) < 50:
        raise ReqNotFoundError(
            f"Requisition {req} was found but its description is empty or too "
            f"short ({len(posting['job_description'])} chars) to screen against."
        )

    return posting
