"""
URL Fetcher — Scrapes job posting data from Oracle HCM career pages.

Uses Playwright (sync API) to render the client-side SPA and extract
structured data. Same extraction logic as scrapers/vertiv_scraper.py.

Requires: pip install playwright && python -m playwright install chromium

Note: Playwright requires a Chromium binary (~150MB). This works for
local dev and Premium plan Functions. On Consumption plan, callers
should paste the JD text directly instead.
"""

import logging
import re

logger = logging.getLogger(__name__)

# JS extraction script — shared with scrapers/vertiv_scraper.py
_EXTRACT_JS = """() => {
    const result = {
        title: '',
        req_number: '',
        location: '',
        job_description: '',
        job_family: '',
    };

    const titleEl = document.querySelector('h1.job-details__title');
    if (titleEl) result.title = titleEl.innerText.trim();

    const descEl = document.querySelector('.job-details__description-content');
    if (descEl) result.job_description = descEl.innerText.trim();

    const locEl = document.querySelector('.job-meta__locations');
    if (locEl) result.location = locEl.innerText.trim();

    const metaItems = document.querySelectorAll('.job-meta__item');
    for (const item of metaItems) {
        const label = item.querySelector('.job-meta__title');
        const value = item.querySelector('.job-meta__subitem');
        if (!label || !value) continue;

        const labelText = label.innerText.trim().toLowerCase();
        const valueText = value.innerText.trim();

        if (labelText.includes('identification') || labelText.includes('requisition')) {
            result.req_number = valueText;
        } else if (labelText.includes('category') || labelText.includes('family')) {
            result.job_family = valueText;
        } else if (labelText.includes('location') && !result.location) {
            result.location = valueText;
        }
    }

    return result;
}"""


def fetch_posting(url: str) -> dict:
    """
    Fetch and extract structured data from an Oracle HCM job posting URL.

    Returns dict with keys: title, req_number, location, job_description,
    job_family, source_url. Raises on failure.
    """
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        raise RuntimeError(
            "Playwright is not installed. URL mode requires: "
            "pip install playwright && python -m playwright install chromium. "
            "Paste the job description text directly as an alternative."
        )

    logger.info("Fetching posting from URL: %s", url)

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        try:
            page = browser.new_page()
            page.goto(url, wait_until="networkidle", timeout=60000)
            page.wait_for_selector("h1.job-details__title", timeout=15000)

            data = page.evaluate(_EXTRACT_JS)
        finally:
            browser.close()

    data["job_description"] = _clean_text(data.get("job_description", ""))
    data["source_url"] = url

    if not data["job_description"] or len(data["job_description"]) < 50:
        raise ValueError(
            f"Could not extract a valid job description from {url}. "
            f"Got {len(data.get('job_description', ''))} chars."
        )

    logger.info(
        "Fetched: %s | %s | %s | %d chars",
        data.get("title", "?"),
        data.get("req_number", "?"),
        data.get("location", "?"),
        len(data["job_description"]),
    )

    return data


def _clean_text(text: str) -> str:
    text = text.replace("\xa0", " ")
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()
