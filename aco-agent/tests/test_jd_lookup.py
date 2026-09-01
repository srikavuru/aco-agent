"""
JD Lookup tests — no network, no Azure.

Covers req-number normalization, list-item matching, and Markdown rendering.
Network calls are exercised through injected fakes.

Run: pytest tests/ -v
"""

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parent.parent))

from shared import req_lookup
from shared.req_lookup import (
    ReqNotFoundError,
    _matches,
    _to_posting,
    lookup_req,
    normalize_req,
)
from shared.jd_markdown import build_filename, build_jd_markdown, html_to_markdown


LONG_DESC = (
    "<p>Vertiv is hiring a Senior Electrical Engineer for critical power "
    "systems in Columbus, OH.</p><ul><li>Own UPS design validation</li>"
    "<li>BSEE required, PE preferred</li></ul>"
)

DETAIL = {
    "Id": "20265195",
    "RequisitionNumber": "20265195",
    "Title": "Senior Electrical Engineer",
    "PrimaryLocation": "Columbus, OH, United States",
    "Category": "Engineering",
    "PostedDate": "2026-08-14",
    "ExternalDescriptionStr": LONG_DESC,
}


# ── normalize_req ─────────────────────────────────────────────────────────────

@pytest.mark.parametrize("raw,expected", [
    ("20265195", "20265195"),
    ("  20265195  ", "20265195"),
    ("REQ-20265195", "20265195"),
    ("req 20265195", "20265195"),
    ("#20265195", "20265195"),
    ("Requisition: 20265195", "20265195"),
    ("job-20265195", "20265195"),
    ("ABC-123", "ABC-123"),
])
def test_normalize_req(raw, expected):
    assert normalize_req(raw) == expected


@pytest.mark.parametrize("raw", ["", "   ", "REQ-", None])
def test_normalize_req_rejects_empty(raw):
    with pytest.raises(ValueError):
        normalize_req(raw)


# ── list matching ─────────────────────────────────────────────────────────────

def test_matches_on_id():
    assert _matches({"Id": "20265195", "Title": "Sr EE"}, "20265195")


def test_matches_on_requisition_number():
    assert _matches({"Id": "999", "RequisitionNumber": "REQ-20265195"}, "20265195")


def test_matches_on_title_embedded_number():
    assert _matches({"Id": "999", "Title": "Sr EE (20265195)"}, "20265195")


def test_does_not_match_partial_number():
    assert not _matches({"Id": "202651950", "Title": "Sr EE"}, "20265195")


# ── posting shaping ───────────────────────────────────────────────────────────

def test_to_posting_strips_html_and_builds_url():
    posting = _to_posting(DETAIL, "20265195", req_lookup.ORC_HOST, "CX")

    assert posting["title"] == "Senior Electrical Engineer"
    assert posting["req_number"] == "20265195"
    assert "<p>" not in posting["job_description"]
    assert "Senior Electrical Engineer" in posting["job_description"]
    assert posting["source_url"].endswith("/CX/job/20265195")


def test_to_posting_rejects_empty_description():
    thin = dict(DETAIL, ExternalDescriptionStr="<p>Apply now.</p>", ShortDescriptionStr="")
    with pytest.raises(ReqNotFoundError):
        _to_posting(thin, "20265195", req_lookup.ORC_HOST, "CX")


# ── lookup_req resolution paths ───────────────────────────────────────────────

def test_lookup_req_direct_hit(monkeypatch):
    monkeypatch.setattr(req_lookup, "_fetch_detail", lambda *a, **k: DETAIL)
    posting = lookup_req("REQ-20265195")
    assert posting["matched_by"] == "direct"
    assert posting["req_number"] == "20265195"


def test_lookup_req_falls_back_to_search(monkeypatch):
    calls = []

    def fake_detail(job_id, host, site):
        calls.append(job_id)
        return DETAIL if len(calls) > 1 else None

    monkeypatch.setattr(req_lookup, "_fetch_detail", fake_detail)
    monkeypatch.setattr(
        req_lookup, "_list_jobs",
        lambda kw, limit, offset, host, site: (
            [{"Id": "20265195", "RequisitionNumber": "20265195", "Title": "Sr EE"}], 1
        ),
    )

    posting = lookup_req("20265195")
    assert posting["matched_by"] == "search"


def test_lookup_req_not_found(monkeypatch):
    monkeypatch.setattr(req_lookup, "_fetch_detail", lambda *a, **k: None)
    monkeypatch.setattr(req_lookup, "_list_jobs", lambda *a, **k: ([], 0))

    with pytest.raises(ReqNotFoundError):
        lookup_req("00000000")


# ── Markdown rendering ────────────────────────────────────────────────────────

def _posting():
    return _to_posting(DETAIL, "20265195", req_lookup.ORC_HOST, "CX")


def test_markdown_has_front_matter_and_verbatim_body():
    md = build_jd_markdown(_posting(), generated_by="user@vertiv.com")

    assert md.startswith("---\n")
    assert 'req_number: "20265195"' in md
    assert 'document_type: "job_description"' in md
    assert "# Senior Electrical Engineer" in md
    assert "## Job description (verbatim)" in md
    assert "BSEE required" in md
    assert "user@vertiv.com" in md


def test_markdown_states_decision_support_only():
    md = build_jd_markdown(_posting())
    assert "decision support only" in md.lower()
    assert "recruiter makes every advance/reject call" in md.lower()


def test_markdown_escapes_quotes_in_front_matter():
    posting = dict(_posting(), title='Engineer "Power" Team')
    md = build_jd_markdown(posting)
    assert 'title: "Engineer \\"Power\\" Team"' in md


def test_filename_is_filesystem_safe():
    posting = dict(_posting(), title="Sr. Engineer / Power & Cooling")
    name = build_filename(posting)

    assert name == "JD-20265195-sr-engineer-power-cooling.md"
    assert not set(name) & set('/\\:*?"<>| ')


# ── HTML to Markdown ──────────────────────────────────────────────────────────

def test_html_to_markdown_preserves_lists():
    md = html_to_markdown("<ul><li>First</li><li>Second</li></ul>")
    assert md == "- First\n- Second"


def test_html_to_markdown_preserves_bold_and_headings():
    md = html_to_markdown("<h3>Requirements</h3><p>Needs <b>BSEE</b></p>")
    assert "### Requirements" in md
    assert "**BSEE**" in md


def test_html_to_markdown_unescapes_entities():
    md = html_to_markdown("<p>Power &amp; Cooling&nbsp;team &lt;critical&gt;</p>")
    assert "Power & Cooling team <critical>" in md
    assert "&amp;" not in md


def test_html_to_markdown_drops_unknown_tags():
    md = html_to_markdown('<p><span class="x">Hello</span><img src="a.png"/></p>')
    assert md == "Hello"
    assert "<" not in md


def test_html_to_markdown_empty_input():
    assert html_to_markdown("") == ""


def test_markdown_uses_html_when_available():
    posting = dict(_posting(), job_description_html="<ul><li>Own UPS design</li></ul>")
    md = build_jd_markdown(posting)
    assert "- Own UPS design" in md


def test_markdown_falls_back_to_plain_text():
    posting = dict(_posting(), job_description_html="")
    md = build_jd_markdown(posting)
    assert "BSEE required" in md


def test_html_to_markdown_br_is_not_treated_as_bold():
    md = html_to_markdown("<p>Line one<br/>Line two</p>")
    assert md == "Line one\nLine two"
    assert "*" not in md
