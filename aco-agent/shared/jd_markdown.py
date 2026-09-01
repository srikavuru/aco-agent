"""
JD Markdown — Renders a job posting as a screening-ready Markdown file.

The output is meant to be dropped into a local folder alongside downloaded
resumes, so an assistant reading that folder has the full, verbatim req to
screen against.

Two rules govern what goes in this file:

1. The job description is reproduced verbatim. No summarizing, no rewriting,
   no inferred requirements — the screener needs the actual posted text, and
   the posted text is the legally relevant artifact.
2. Nothing in this file scores, ranks, or decides. It carries the req and a
   usage note; every screening judgment stays with the recruiter.
"""

import html as html_lib
import re
from datetime import datetime, timezone

JD_DOC_VERSION = "1.0"

USAGE_NOTE = """\
This file is the source of truth for screening against this req. The job
description below is reproduced verbatim from the live posting.

When screening resumes in this folder against this req:

- Cite evidence from the resume for every requirement you mark as met.
- Treat anything not stated on the resume as unknown, not as absent.
- Produce a recommendation with reasoning, never a numeric ranking that
  stands in for a hiring decision.
- The recruiter makes every advance/reject call.

This document is decision support only. It is a reference copy of a job
posting, not an evaluation of anyone.
"""


def build_jd_markdown(posting: dict, generated_by: str = "") -> str:
    """
    Render a posting dict (from shared.req_lookup.lookup_req) as Markdown.
    """
    req = posting.get("req_number", "") or posting.get("job_id", "")
    title = posting.get("title", "") or "Untitled Requisition"
    generated_at = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")

    front_matter = [
        "---",
        f'req_number: "{req}"',
        f'title: "{_yaml_escape(title)}"',
        f'location: "{_yaml_escape(posting.get("location", ""))}"',
        f'job_family: "{_yaml_escape(posting.get("job_family", ""))}"',
        f'posted_date: "{posting.get("posted_date", "")}"',
        f'source_url: "{posting.get("source_url", "")}"',
        f'retrieved_at: "{generated_at}"',
        f'doc_version: "{JD_DOC_VERSION}"',
        'document_type: "job_description"',
        'usage: "screening_reference"',
        "---",
    ]

    body = [
        "",
        f"# {title}",
        "",
        f"**Req {req}**"
        + (f" · {posting['location']}" if posting.get("location") else "")
        + (f" · {posting['job_family']}" if posting.get("job_family") else ""),
        "",
        f"[View live posting]({posting.get('source_url', '')})",
        "",
        "## How to use this file",
        "",
        USAGE_NOTE,
        "## Job description (verbatim)",
        "",
        _render_description(posting),
        "",
        "---",
        "",
        f"_Retrieved {generated_at} by ACO Agent"
        + (f" for {generated_by}" if generated_by else "")
        + ". Verbatim copy of the live posting — not a rewrite._",
        "",
    ]

    return "\n".join(front_matter + body)


def build_filename(posting: dict) -> str:
    """
    Build a stable, filesystem-safe filename: JD-<req>-<slug-title>.md
    """
    req = _slugify(posting.get("req_number", "") or posting.get("job_id", "") or "unknown")
    slug = _slugify(posting.get("title", "")) or "requisition"
    return f"JD-{req}-{slug}.md"


# ── Helpers ───────────────────────────────────────────────────────────────────

def _render_description(posting: dict) -> str:
    """
    Prefer the source HTML so lists and headings survive as Markdown; fall
    back to the pre-stripped plain text when no HTML was captured.
    """
    raw_html = posting.get("job_description_html", "")
    if raw_html:
        rendered = html_to_markdown(raw_html)
        if rendered:
            return rendered

    return _normalize_body(posting.get("job_description", ""))


def html_to_markdown(raw: str) -> str:
    """
    Convert Oracle's posting HTML to Markdown, preserving structure.

    Deliberately narrow: postings use a small, predictable tag vocabulary
    (p, br, ul/ol/li, h1-h6, b/strong, i/em). Anything else is dropped to
    text so no markup leaks into the file.
    """
    if not raw:
        return ""

    text = raw

    # Inline emphasis first, before block tags become newlines.
    # The boundary lookahead keeps <br> and <img> out of the b/i alternations.
    text = re.sub(r"</?(b|strong)(?=[\s/>])[^>]*>", "**", text, flags=re.IGNORECASE)
    text = re.sub(r"</?(i|em)(?=[\s/>])[^>]*>", "*", text, flags=re.IGNORECASE)

    # Headings -> level-3 so they nest under the document's h2 sections.
    text = re.sub(r"<h[1-6][^>]*>", "\n\n### ", text, flags=re.IGNORECASE)
    text = re.sub(r"</h[1-6]>", "\n\n", text, flags=re.IGNORECASE)

    # List items -> bullets.
    text = re.sub(r"<li[^>]*>", "\n- ", text, flags=re.IGNORECASE)
    text = re.sub(r"</li>", "\n", text, flags=re.IGNORECASE)
    text = re.sub(r"</?(ul|ol)[^>]*>", "\n\n", text, flags=re.IGNORECASE)

    # Block breaks.
    text = re.sub(r"<br\s*/?>", "\n", text, flags=re.IGNORECASE)
    text = re.sub(r"</?(p|div|tr)[^>]*>", "\n\n", text, flags=re.IGNORECASE)
    text = re.sub(r"</?(td|th)[^>]*>", " ", text, flags=re.IGNORECASE)

    # Drop everything else.
    text = re.sub(r"<[^>]+>", "", text)
    text = html_lib.unescape(text)
    text = text.replace("\xa0", " ")

    # Emphasis wrappers that ended up empty after their content was stripped.
    text = re.sub(r"\*\*[ \t]*\*\*", "", text)

    lines = [line.rstrip() for line in text.split("\n")]
    lines = [re.sub(r"^-\s+$", "", line) for line in lines]
    lines = [line if line.startswith("- ") else line.strip() for line in lines]

    out = "\n".join(lines)
    out = re.sub(r"[ \t]{2,}", " ", out)
    out = re.sub(r"\n{3,}", "\n\n", out)
    # Keep list items tight so they read as one list, not spaced paragraphs.
    out = re.sub(r"(?m)^(- .*)\n\n(?=- )", r"\1\n", out)
    out = re.sub(r"(?m)^(- .*)\n\n(?=- )", r"\1\n", out)
    return out.strip()


def _normalize_body(text: str) -> str:
    """
    Keep the posting text verbatim, but make it render as Markdown:
    collapse runs of blank lines and convert bullet glyphs to list markers.
    """
    if not text:
        return "_No description text was returned for this requisition._"

    lines = []
    for line in text.split("\n"):
        stripped = line.strip()
        stripped = re.sub(r"^[•●▪·‣⁃]\s*", "- ", stripped)
        lines.append(stripped)

    joined = "\n".join(lines)
    return re.sub(r"\n{3,}", "\n\n", joined).strip()


def _slugify(text: str) -> str:
    slug = re.sub(r"[^A-Za-z0-9]+", "-", str(text)).strip("-").lower()
    return slug[:60].strip("-")


def _yaml_escape(text: str) -> str:
    return str(text).replace("\\", "\\\\").replace('"', '\\"')
