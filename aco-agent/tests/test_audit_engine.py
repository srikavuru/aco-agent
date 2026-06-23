"""
ACO Engine Tests — runs without Azure, without CosmosDB.
Tests the rule engine + certificate builder in isolation.

Run: pytest tests/ -v
"""

import json
import sys
from pathlib import Path

# Add project root to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from shared.rule_engine import RuleEngine
from shared.audit_certificate import build_certificate

# Load shared rules
RULES_PATH = Path(__file__).parent.parent / "data" / "rules" / "rules.json"
with open(RULES_PATH) as f:
    RULES = json.load(f)


# ── Fixtures ──────────────────────────────────────────────────────────────────

COMPLIANT_JD = """
Senior Electrical Engineer — Vertiv OneCore | Columbus, OH

About Vertiv: Vertiv designs and manufactures critical digital infrastructure for 
data centers globally, including UPS, switchgear, and thermal management systems.

What You'll Do:
- Lead electrical design of AC power distribution equipment (Juice Box / SmartRun)
- Own FAT protocols and design validation through engineering lifecycle
- Collaborate with thermal and BMS teams on integrated solutions

Requirements:
- 5+ years in power distribution or UPS design
- BSEE required; PE license preferred
- Familiarity with NEC, UL 891, IEC 61439

Salary: $110,000 – $135,000 annually. Benefits include medical, dental, vision, 
401(k) with match, paid parental leave, and tuition reimbursement.

Vertiv is an Equal Opportunity/Affirmative Action employer. We promote equal 
opportunity for all applicants regardless of race, color, religion, sex, national 
origin, age, disability, veteran status, or other protected characteristics.

Vertiv will make reasonable accommodations for qualified individuals with 
disabilities. Contact HR at accommodations@vertiv.com.

Vertiv will not discharge or in any other manner discriminate against employees 
or applicants because they have inquired about, discussed, or disclosed their 
own pay or the pay of another employee or applicant.

This position may be subject to U.S. export control requirements (ITAR/EAR).
Persons hired may need to qualify as a U.S. Person.

Vertiv will only employ those who are legally authorized to work in the
United States. This is not a position for which sponsorship will be provided.
Individuals with temporary visas such as E, F-1, H-1, H-2, L, B, J, or TN
or who need sponsorship for work authorization now or in the future, are not
eligible for hire.

Core Principals: Safety. Integrity. Respect. Teamwork. Inclusion.

About Vertiv: Vertiv (NYSE: VRT) brings together hardware, software, analytics
and ongoing services to enable customers' vital applications to run continuously.
Headquartered in Westerville, Ohio, Vertiv employs around 34,000 people and does
business in more than 130 countries. Visit Vertiv.com.
"""

NON_COMPLIANT_JD_CRITICAL = """
Senior Rockstar Engineer — Columbus, OH

We're looking for a young professional with digital native energy to crush it 
on our engineering team. U.S. citizens only. This is a competitive salary role 
based on experience.

Requirements: Some electrical background helpful. Be energetic and aggressive 
in problem-solving. Must be able-bodied for physical tasks.
"""


# ── Tests ─────────────────────────────────────────────────────────────────────

def test_compliant_jd_passes():
    """A fully compliant posting should produce zero CRITICAL or HIGH findings."""
    engine = RuleEngine(rules=RULES, region="OH", role_type="engineer")
    findings = engine.run(COMPLIANT_JD)

    critical = [f for f in findings if f["severity"] == "CRITICAL"]
    high = [f for f in findings if f["severity"] == "HIGH"]

    assert len(critical) == 0, f"Expected 0 CRITICAL, got: {[f['rule_id'] for f in critical]}"
    assert len(high) == 0, f"Expected 0 HIGH, got: {[f['rule_id'] for f in high]}"
    print(f"✓ Compliant JD: {len(findings)} LOW/MEDIUM findings (acceptable)")


def test_non_compliant_jd_critical_flags():
    """Non-compliant posting must trigger CRITICAL flags for EEO, age bias, national origin."""
    engine = RuleEngine(rules=RULES, region="CO", role_type="engineer")  # CO for salary check
    findings = engine.run(NON_COMPLIANT_JD_CRITICAL)

    rule_ids = {f["rule_id"] for f in findings}

    assert "RD-001" in rule_ids, "EEO statement check (RD-001) should have fired"
    assert "PL-001" in rule_ids, "Age bias check (PL-001) should have fired"
    assert "PL-003" in rule_ids, "National origin check (PL-003) should have fired"
    assert "ST-001" in rule_ids, "Salary transparency (ST-001) should have fired in CO"

    critical = [f for f in findings if f["severity"] == "CRITICAL"]
    assert len(critical) > 0, "At least one CRITICAL finding expected"
    print(f"✓ Non-compliant JD: {len(critical)} CRITICAL findings detected as expected")


def test_certificate_structure():
    """Audit Certificate must have all required top-level keys."""
    engine = RuleEngine(rules=RULES, region="OH", role_type="general")
    findings = engine.run(NON_COMPLIANT_JD_CRITICAL)

    cert = build_certificate(
        audit_id="ACO-TEST-00000001",
        posting_title="Test Posting",
        submitted_by="pytest",
        region="OH",
        role_type="general",
        job_description_hash="abc123",
        findings=findings,
        rules_schema_version="1.0.0",
        req_number="REQ-99999",
    )

    required_keys = [
        "audit_id", "certificate_version", "audited_at", "audited_at_epoch",
        "posting", "audit_result", "executive_summary", "findings", "legal_record"
    ]
    for key in required_keys:
        assert key in cert, f"Missing required key: {key}"

    assert cert["posting"]["req_number"] == "REQ-99999"
    assert cert["audit_result"]["overall_status"] in (
        "BLOCKED", "REVIEW_REQUIRED", "ADVISORY", "INFO", "APPROVED"
    )
    assert cert["legal_record"]["decision_authority"] == "HUMAN_RECRUITER"
    assert cert["legal_record"]["tool_type"] == "DECISION_SUPPORT"
    print(f"✓ Certificate structure valid | Status: {cert['audit_result']['overall_status']}")


def test_certificate_blocked_on_critical():
    """Any CRITICAL finding must result in BLOCKED overall_status."""
    engine = RuleEngine(rules=RULES, region="OH", role_type="general")
    findings = engine.run(NON_COMPLIANT_JD_CRITICAL)

    cert = build_certificate(
        audit_id="ACO-TEST-BLOCK",
        posting_title="Block Test",
        submitted_by="pytest",
        region="OH",
        role_type="general",
        job_description_hash="xyz",
        findings=findings,
        rules_schema_version="1.0.0"
    )

    # At minimum, EEO + national origin = 2 CRITICAL should block
    if cert["audit_result"]["counts"]["CRITICAL"] > 0:
        assert cert["audit_result"]["overall_status"] == "BLOCKED"
        assert cert["audit_result"]["action_required"] is True
    print(f"✓ BLOCKED status correctly set for CRITICAL findings")


def test_certificate_req_number_default():
    """req_number should default to empty string when not provided."""
    cert = build_certificate(
        audit_id="ACO-TEST-REQDEFAULT",
        posting_title="Default Req Test",
        submitted_by="pytest",
        region="OH",
        role_type="general",
        job_description_hash="abc",
        findings=[],
        rules_schema_version="1.0.0",
    )
    assert cert["posting"]["req_number"] == ""
    print("✓ req_number defaults to empty string")


def test_orc_webhook_mappers():
    """ORC location and job family mappers produce correct values."""
    sys.path.insert(0, str(Path(__file__).parent.parent))
    from orc_webhook import _map_location, _map_job_family, _strip_html

    assert _map_location("Columbus, OH, US") == "OH"
    assert _map_location("Denver, CO") == "CO"
    assert _map_location("New York, NY, US") == "NY"
    assert _map_location("") == "UNKNOWN"
    assert _map_location("London, UK") == "UNKNOWN"

    assert _map_job_family("Electrical Engineering") == "engineer"
    assert _map_job_family("Manufacturing Operations") == "manufacturing"
    assert _map_job_family("Sales") == "sales"
    assert _map_job_family("") == "general"
    assert _map_job_family("Advanced R&D") == "research"

    html = "<p>Hello <b>world</b></p><br/><ul><li>Item</li></ul>"
    text = _strip_html(html)
    assert "Hello" in text
    assert "world" in text
    assert "Item" in text
    assert "<" not in text
    print("✓ ORC webhook mappers work correctly")


if __name__ == "__main__":
    test_compliant_jd_passes()
    test_non_compliant_jd_critical_flags()
    test_certificate_structure()
    test_certificate_blocked_on_critical()
    test_certificate_req_number_default()
    test_orc_webhook_mappers()
    print("\n✅ All tests passed.")
