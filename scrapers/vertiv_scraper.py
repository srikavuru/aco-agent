"""
Vertiv Oracle HCM Job Posting Scraper

Scrapes structured job data from Oracle HCM candidate experience pages.
Uses Playwright for client-side rendered SPA content.

Usage:
    python scrapers/vertiv_scraper.py
    python scrapers/vertiv_scraper.py --urls URL1 URL2 ...

Output: scrapers/output/postings.json
"""

import asyncio
import json
import re
import sys
from pathlib import Path
from playwright.async_api import async_playwright

OUTPUT_DIR = Path(__file__).parent / "output"
OUTPUT_FILE = OUTPUT_DIR / "postings.json"

DEFAULT_URLS = [
    "https://egup.fa.us2.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX/job/20265195",
    "https://egup.fa.us2.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX/job/20260838",
    "https://egup.fa.us2.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX/job/20275155",
    "https://egup.fa.us2.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX/job/20259279",
    "https://egup.fa.us2.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX/job/20264981",
]


async def scrape_posting(page, url: str) -> dict:
    """Scrape a single Oracle HCM job posting page."""
    print(f"  Scraping: {url}")
    await page.goto(url, wait_until="networkidle", timeout=60000)
    await page.wait_for_selector("h1.job-details__title", timeout=15000)

    data = await page.evaluate("""() => {
        const result = {
            title: '',
            req_number: '',
            location: '',
            job_description: '',
            job_family: '',
        };

        // Title
        const titleEl = document.querySelector('h1.job-details__title');
        if (titleEl) result.title = titleEl.innerText.trim();

        // Job description — strip HTML, keep text
        const descEl = document.querySelector('.job-details__description-content');
        if (descEl) result.job_description = descEl.innerText.trim();

        // Location
        const locEl = document.querySelector('.job-meta__locations');
        if (locEl) result.location = locEl.innerText.trim();

        // Job info metadata (req number, category, etc.)
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
    }""")

    data["source_url"] = url
    return data


def clean_text(text: str) -> str:
    """Normalize whitespace and remove non-breaking spaces."""
    text = text.replace("\xa0", " ")
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


async def main(urls: list[str]):
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    print(f"Scraping {len(urls)} Vertiv job postings...")
    results = []

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()

        for url in urls:
            try:
                posting = await scrape_posting(page, url)
                posting["job_description"] = clean_text(posting["job_description"])
                results.append(posting)
                print(f"    OK: {posting['title']} | {posting['req_number']} | {posting['location']}")
            except Exception as e:
                print(f"    FAILED: {url} — {e}")
                results.append({"source_url": url, "error": str(e)})

        await browser.close()

    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2, ensure_ascii=False)

    print(f"\nWrote {len(results)} postings to {OUTPUT_FILE}")


if __name__ == "__main__":
    urls = sys.argv[1:] if len(sys.argv) > 1 else DEFAULT_URLS
    asyncio.run(main(urls))
