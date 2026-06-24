"""
ACO Agent — Autonomous Pipeline Demo

Crawls the Vertiv careers site for 10 live job postings, audits each
against the Azure Function, prints a formatted summary table, and
saves full results to demo_results.json.

Usage:
    python scrapers/demo_run.py
    python scrapers/demo_run.py --count 20
    python scrapers/demo_run.py --endpoint http://localhost:7071/api/audit
"""

import asyncio
import json
import re
import sys
import time
from datetime import datetime
from pathlib import Path

import requests
from playwright.async_api import async_playwright

CAREERS_URL = "https://egup.fa.us2.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX/requisitions"
DEFAULT_ENDPOINT = "https://aco-agent-func.azurewebsites.net/api/audit"
OUTPUT_DIR = Path(__file__).parent / "output"

# -- Location / job family mappers -----------------------------------------

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

_EXTRACT_JS = """() => {
    const r = { title: '', req_number: '', location: '', job_description: '', job_family: '' };
    const t = document.querySelector('h1.job-details__title');
    if (t) r.title = t.innerText.trim();
    const d = document.querySelector('.job-details__description-content');
    if (d) r.job_description = d.innerText.trim();
    const l = document.querySelector('.job-meta__locations');
    if (l) r.location = l.innerText.trim();
    for (const item of document.querySelectorAll('.job-meta__item')) {
        const label = item.querySelector('.job-meta__title');
        const value = item.querySelector('.job-meta__subitem');
        if (!label || !value) continue;
        const lt = label.innerText.trim().toLowerCase();
        const vt = value.innerText.trim();
        if (lt.includes('identification') || lt.includes('requisition')) r.req_number = vt;
        else if (lt.includes('category') || lt.includes('family')) r.job_family = vt;
    }
    return r;
}"""


def map_location(loc):
    m = re.search(r",\s*([A-Z]{2})\b", loc)
    if m and m.group(1) in _STATE_CODES:
        return m.group(1)
    return "UNKNOWN"


def map_job_family(jf):
    jf_lower = (jf or "").lower()
    for kw, role in _JOB_FAMILY_KEYWORDS.items():
        if kw in jf_lower:
            return role
    return "general"


# -- Step 1: Crawl careers site for job URLs -------------------------------

async def crawl_job_urls(count):
    print(f"\n{'='*70}")
    print(f"  ACO AGENT — AUTONOMOUS PIPELINE DEMO")
    print(f"  {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"{'='*70}")
    print(f"\n[1/3] Crawling Vertiv careers site for {count} postings...")

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()
        await page.goto(CAREERS_URL, wait_until="networkidle", timeout=60000)
        await page.wait_for_timeout(3000)

        urls = await page.evaluate("""(count) => {
            const links = document.querySelectorAll('a[href*="/job/"]');
            return [...links].slice(0, count).map(a => a.href);
        }""", count)

        await browser.close()

    print(f"       Found {len(urls)} job URLs")
    return urls


# -- Step 2: Scrape each posting -------------------------------------------

async def scrape_postings(urls):
    print(f"\n[2/3] Scraping {len(urls)} postings...")
    postings = []

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()

        for i, url in enumerate(urls, 1):
            try:
                await page.goto(url, wait_until="networkidle", timeout=60000)
                await page.wait_for_selector("h1.job-details__title", timeout=15000)
                data = await page.evaluate(_EXTRACT_JS)
                data["job_description"] = data["job_description"].replace("\xa0", " ").strip()
                data["source_url"] = url
                postings.append(data)
                title = (data["title"] or "?")[:45]
                print(f"       [{i:>2}/{len(urls)}] {title:<45} {data['req_number']}")
            except Exception as e:
                print(f"       [{i:>2}/{len(urls)}] FAILED: {url[-20:]} — {e}")
                postings.append({"source_url": url, "error": str(e)})

        await browser.close()

    valid = [p for p in postings if "error" not in p and len(p.get("job_description", "")) >= 50]
    print(f"       Scraped {len(valid)} valid postings ({len(postings) - len(valid)} failed/empty)")
    return postings, valid


# -- Step 3: Audit each posting --------------------------------------------

def audit_postings(postings, endpoint):
    print(f"\n[3/3] Auditing {len(postings)} postings against {endpoint}...")
    results = []

    for i, p in enumerate(postings, 1):
        title = (p.get("title") or "?")[:40]
        req = p.get("req_number", "?")
        print(f"       [{i:>2}/{len(postings)}] {title:<40} ", end="", flush=True)

        region = map_location(p.get("location", ""))
        role_type = map_job_family(p.get("job_family", ""))

        try:
            resp = requests.post(endpoint, json={
                "job_description": p["job_description"],
                "region": region,
                "role_type": role_type,
                "req_number": p.get("req_number", ""),
                "posting_title": p.get("title", "Untitled"),
                "submitted_by": "demo_pipeline",
            }, timeout=120)
            resp.raise_for_status()
            cert = resp.json()
            cert["_source_url"] = p.get("source_url", "")

            status = cert["audit_result"]["overall_status"]
            c = cert["audit_result"]["counts"]
            total = cert["audit_result"]["total_findings"]
            print(f"{status:<18} C:{c['CRITICAL']} H:{c['HIGH']} M:{c['MEDIUM']} L:{c['LOW']}")
            results.append(cert)
        except Exception as e:
            print(f"ERROR: {e}")
            results.append({
                "error": str(e),
                "_source_url": p.get("source_url", ""),
                "posting_title": title,
            })

    return results


# -- Summary table ---------------------------------------------------------

def print_summary(results):
    valid = [r for r in results if "audit_result" in r]
    if not valid:
        print("\n  No valid results to summarize.")
        return

    print(f"\n{'='*70}")
    print(f"  AUDIT RESULTS SUMMARY")
    print(f"{'='*70}")
    print()

    # Header
    hdr = f"  {'REQ':<12} {'TITLE':<30} {'REGION':<6} {'STATUS':<18} {'SCORE':>5}  {'C':>2} {'H':>2} {'M':>2} {'L':>2}"
    print(hdr)
    print(f"  {'-'*12} {'-'*30} {'-'*6} {'-'*18} {'-'*5}  {'-'*2} {'-'*2} {'-'*2} {'-'*2}")

    for r in valid:
        p = r["posting"]
        ar = r["audit_result"]
        c = ar["counts"]
        evaluated = ar.get("rules_evaluated", 0)
        passed = evaluated - ar["total_findings"]
        score = f"{round(passed / evaluated * 100)}%" if evaluated > 0 else "—"

        req = (p.get("req_number") or "—")[:12]
        title = (p.get("title") or "Untitled")[:30]
        region = (p.get("region") or "—")[:6]
        status = ar["overall_status"][:18]

        print(f"  {req:<12} {title:<30} {region:<6} {status:<18} {score:>5}  {c['CRITICAL']:>2} {c['HIGH']:>2} {c['MEDIUM']:>2} {c['LOW']:>2}")

    # Status breakdown
    status_counts = {}
    total_findings = 0
    for r in valid:
        s = r["audit_result"]["overall_status"]
        status_counts[s] = status_counts.get(s, 0) + 1
        total_findings += r["audit_result"]["total_findings"]

    print(f"\n  {'-'*70}")
    print(f"  Postings audited: {len(valid)}")
    print(f"  Total findings:   {total_findings}")
    parts = [f"{count} {status}" for status, count in sorted(status_counts.items())]
    print(f"  Status breakdown: {', '.join(parts)}")
    print(f"{'='*70}\n")


# -- Main ------------------------------------------------------------------

def main():
    count = 10
    endpoint = DEFAULT_ENDPOINT

    for i, arg in enumerate(sys.argv[1:], 1):
        if arg == "--count" and i < len(sys.argv) - 1:
            count = int(sys.argv[i + 1])
        elif arg == "--endpoint" and i < len(sys.argv) - 1:
            endpoint = sys.argv[i + 1]

    start = time.time()

    urls = asyncio.run(crawl_job_urls(count))
    if not urls:
        print("ERROR: No job URLs found. Check the careers site.")
        sys.exit(1)

    all_postings, valid_postings = asyncio.run(scrape_postings(urls))
    if not valid_postings:
        print("ERROR: No valid postings scraped.")
        sys.exit(1)

    results = audit_postings(valid_postings, endpoint)

    print_summary(results)

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    output_file = OUTPUT_DIR / "demo_results.json"
    with open(output_file, "w", encoding="utf-8") as f:
        json.dump({
            "run_timestamp": datetime.now().isoformat(),
            "endpoint": endpoint,
            "postings_crawled": len(urls),
            "postings_scraped": len(valid_postings),
            "postings_audited": len([r for r in results if "audit_result" in r]),
            "elapsed_seconds": round(time.time() - start, 1),
            "certificates": results,
        }, f, indent=2, ensure_ascii=False)

    elapsed = round(time.time() - start, 1)
    print(f"  Saved to {output_file}")
    print(f"  Total time: {elapsed}s\n")


if __name__ == "__main__":
    main()
