"""
Batch Audit Runner

Reads scraped postings from postings.json, sends each to the local
ACO audit endpoint, and writes all certificates to audit_results.json.

Usage:
    python scrapers/run_audit_batch.py
    python scrapers/run_audit_batch.py --endpoint https://aco-agent-func.azurewebsites.net/api/audit

Requires: func start running on localhost:7071 (or pass --endpoint)
"""

import json
import re
import sys
from pathlib import Path
import requests

POSTINGS_FILE = Path(__file__).parent / "output" / "postings.json"
OUTPUT_FILE = Path(__file__).parent / "output" / "audit_results.json"
DEFAULT_ENDPOINT = "http://localhost:7071/api/audit"

# Location string → two-letter state code
_STATE_CODES = {
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
_CODES = set(_STATE_CODES.values())

_JOB_FAMILY_MAP = {
    "engineering": "engineer",
    "electrical": "engineer",
    "mechanical": "engineer",
    "software": "engineer",
    "systems": "engineer",
    "manufacturing": "manufacturing",
    "production": "manufacturing",
    "research": "research",
    "r&d": "research",
    "sales": "sales",
    "business development": "sales",
}


def map_location(location: str) -> str:
    if not location:
        return "UNKNOWN"
    match = re.search(r",\s*([A-Z]{2})\b", location)
    if match and match.group(1) in _CODES:
        return match.group(1)
    for name, code in _STATE_CODES.items():
        if name.lower() in location.lower():
            return code
    return "UNKNOWN"


def map_job_family(job_family: str) -> str:
    if not job_family:
        return "general"
    jf_lower = job_family.lower()
    for keyword, role in _JOB_FAMILY_MAP.items():
        if keyword in jf_lower:
            return role
    return "general"


def run_audit(posting: dict, endpoint: str) -> dict:
    """Send a single posting to the audit endpoint."""
    region = map_location(posting.get("location", ""))
    role_type = map_job_family(posting.get("job_family", ""))

    payload = {
        "job_description": posting["job_description"],
        "region": region,
        "role_type": role_type,
        "req_number": posting.get("req_number", ""),
        "posting_title": posting.get("title", "Untitled"),
        "submitted_by": "batch_auditor",
    }

    resp = requests.post(endpoint, json=payload, timeout=120)
    resp.raise_for_status()
    cert = resp.json()
    cert["_source_url"] = posting.get("source_url", "")
    return cert


def main():
    endpoint = DEFAULT_ENDPOINT
    if "--endpoint" in sys.argv:
        idx = sys.argv.index("--endpoint")
        endpoint = sys.argv[idx + 1]

    if not POSTINGS_FILE.exists():
        print(f"ERROR: {POSTINGS_FILE} not found. Run vertiv_scraper.py first.")
        sys.exit(1)

    with open(POSTINGS_FILE, "r", encoding="utf-8") as f:
        postings = json.load(f)

    valid = [p for p in postings if "error" not in p and p.get("job_description")]
    print(f"Auditing {len(valid)} postings against {endpoint}...")

    results = []
    for i, posting in enumerate(valid, 1):
        title = posting.get("title", "?")
        req = posting.get("req_number", "?")
        print(f"  [{i}/{len(valid)}] {title} ({req})...", end=" ")

        try:
            cert = run_audit(posting, endpoint)
            status = cert["audit_result"]["overall_status"]
            counts = cert["audit_result"]["counts"]
            print(f"{status} (C:{counts['CRITICAL']} H:{counts['HIGH']} M:{counts['MEDIUM']} L:{counts['LOW']})")
            results.append(cert)
        except Exception as e:
            print(f"FAILED — {e}")
            results.append({
                "error": str(e),
                "_source_url": posting.get("source_url", ""),
                "posting_title": title,
            })

    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2, ensure_ascii=False)

    print(f"\nWrote {len(results)} audit certificates to {OUTPUT_FILE}")

    # Summary
    statuses = {}
    for r in results:
        s = r.get("audit_result", {}).get("overall_status", "ERROR")
        statuses[s] = statuses.get(s, 0) + 1
    print("\nSummary:")
    for s, count in sorted(statuses.items()):
        print(f"  {s}: {count}")


if __name__ == "__main__":
    main()
