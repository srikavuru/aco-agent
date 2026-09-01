"""
Fetch a job description by requisition number and write it as Markdown.

Drop the resulting file into the folder where you keep the resumes for that
req, so an assistant reading the folder screens against the actual posting.

Usage:
    python scrapers/fetch_jd.py 20265195
    python scrapers/fetch_jd.py 20265195 --out ~/screening/req-20265195
    python scrapers/fetch_jd.py 20265195 20260838 --out ./jds
    python scrapers/fetch_jd.py 20265195 --stdout

Runs against the Oracle HCM public REST API — no browser, no credentials.
"""

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent / "aco-agent"))

from shared.req_lookup import lookup_req, normalize_req, ReqNotFoundError  # noqa: E402
from shared.jd_markdown import build_jd_markdown, build_filename  # noqa: E402


def fetch_one(raw_req: str, out_dir: Path, to_stdout: bool, generated_by: str) -> bool:
    try:
        req = normalize_req(raw_req)
    except ValueError as e:
        print(f"  SKIP {raw_req!r}: {e}")
        return False

    print(f"  Looking up req {req}...")

    try:
        posting = lookup_req(req)
    except ReqNotFoundError as e:
        print(f"  NOT FOUND: {e}")
        return False
    except Exception as e:
        print(f"  FAILED: {e}")
        return False

    markdown = build_jd_markdown(posting, generated_by=generated_by)

    if to_stdout:
        print(markdown)
        return True

    out_dir.mkdir(parents=True, exist_ok=True)
    path = out_dir / build_filename(posting)
    path.write_text(markdown, encoding="utf-8")

    print(
        f"  OK  {posting['title']} | {posting['location'] or 'no location'} "
        f"| matched by {posting['matched_by']}"
    )
    print(f"      -> {path}")
    return True


def main():
    parser = argparse.ArgumentParser(
        description="Fetch job descriptions by requisition number as Markdown."
    )
    parser.add_argument("req_numbers", nargs="+", help="One or more requisition numbers")
    parser.add_argument(
        "--out", default=".",
        help="Directory to write the .md files into (default: current directory)",
    )
    parser.add_argument(
        "--stdout", action="store_true",
        help="Print the Markdown instead of writing a file",
    )
    parser.add_argument(
        "--by", default="",
        help="Optional attribution recorded in the file footer",
    )
    args = parser.parse_args()

    out_dir = Path(args.out).expanduser().resolve()

    if not args.stdout:
        print(f"Writing to {out_dir}")

    ok = sum(
        fetch_one(r, out_dir, args.stdout, args.by) for r in args.req_numbers
    )

    if not args.stdout:
        print(f"\n{ok} of {len(args.req_numbers)} requisitions retrieved.")

    return 0 if ok == len(args.req_numbers) else 1


if __name__ == "__main__":
    sys.exit(main())
