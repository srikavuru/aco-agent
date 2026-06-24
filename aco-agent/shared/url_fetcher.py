"""
URL Fetcher — Extracts job posting data from Oracle HCM career URLs.

Uses the Oracle HCM REST API directly (no browser needed).
Parses the job URL to extract the job ID and site code, then
calls the recruitingCEJobRequisitionDetails endpoint.

Works on Azure Functions Consumption plan — no Playwright required.
"""

import logging
import re

import requests

logger = logging.getLogger(__name__)


def fetch_posting(url: str) -> dict:
    """
    Fetch structured data from an Oracle HCM job posting URL.

    Returns dict with: title, req_number, location, job_description,
    job_family, source_url.
    """
    host, job_id, site = _parse_url(url)
    api_url = (
        f"https://{host}/hcmRestApi/resources/latest/recruitingCEJobRequisitionDetails"
        f"?expand=all&onlyData=true&finder=ById;Id=%22{job_id}%22,siteNumber={site}"
    )

    logger.info("Fetching job %s from %s", job_id, host)

    resp = requests.get(api_url, headers={"Accept": "application/json"}, timeout=30)
    resp.raise_for_status()
    data = resp.json()

    items = data.get("items", [])
    if not items:
        raise ValueError(f"No job found for ID {job_id} on site {site}")

    item = items[0]

    job_description = _strip_html(item.get("ExternalDescriptionStr", ""))
    if not job_description:
        job_description = _strip_html(item.get("ShortDescriptionStr", ""))

    result = {
        "title": item.get("Title", ""),
        "req_number": str(item.get("Id", "")),
        "location": item.get("PrimaryLocation", ""),
        "job_description": _clean_text(job_description),
        "job_family": item.get("Category", "") or item.get("JobFunction", ""),
        "source_url": url,
    }

    if not result["job_description"] or len(result["job_description"]) < 50:
        raise ValueError(
            f"Job description too short ({len(result['job_description'])} chars) for {url}"
        )

    logger.info(
        "Fetched: %s | %s | %s | %d chars",
        result["title"], result["req_number"],
        result["location"], len(result["job_description"]),
    )

    return result


def _parse_url(url: str) -> tuple[str, str, str]:
    """Extract host, job ID, and site code from an Oracle HCM URL."""
    # Pattern: https://{host}/hcmUI/CandidateExperience/{lang}/sites/{site}/job/{id}
    match = re.search(
        r"https?://([^/]+)/hcmUI/CandidateExperience/\w+/sites/(\w+)/job/(\d+)",
        url,
    )
    if match:
        return match.group(1), match.group(3), match.group(2)

    # Fallback: try to extract just the job ID
    id_match = re.search(r"/job/(\d+)", url)
    host_match = re.search(r"https?://([^/]+)", url)
    if id_match and host_match:
        return host_match.group(1), id_match.group(1), "CX"

    raise ValueError(f"Cannot parse Oracle HCM job URL: {url}")


def _strip_html(html: str) -> str:
    if not html:
        return ""
    text = re.sub(r"<br\s*/?>", "\n", html, flags=re.IGNORECASE)
    text = re.sub(r"</?(p|div|li|ul|ol|h[1-6])[^>]*>", "\n", text, flags=re.IGNORECASE)
    text = re.sub(r"<[^>]+>", "", text)
    text = re.sub(r"&nbsp;", " ", text)
    text = re.sub(r"&amp;", "&", text)
    text = re.sub(r"&lt;", "<", text)
    text = re.sub(r"&gt;", ">", text)
    text = re.sub(r"&ndash;", "-", text)
    text = re.sub(r"&mdash;", "-", text)
    text = re.sub(r"&#\d+;", "", text)
    return text.strip()


def _clean_text(text: str) -> str:
    text = text.replace("\xa0", " ")
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()
