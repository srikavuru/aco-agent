# Questions for HR & Legal — ACO Agent Validation

Before the ACO Agent moves from demo to production use, the assumptions baked into
`data/rules/rules.json` and the audit workflow need sign-off from the people who own them.
This is the specific list of what to ask, who to ask, and why it matters.

> The tool is decision support only — it flags, humans decide. Every question below is
> about making sure what it flags reflects actual Vertiv policy, not the author's best guess.

---

## For Legal

### Boilerplate & remediation language
1. **Are the four remediation templates the current approved language?** The tool offers
   one-click copy of the EEO block (v3), Core Principals & Behaviors, About Us, and Work
   Authorization/No Sponsorship blocks. If Legal revises any of these, the templates in
   the app must be updated the same day. *Who owns notifying us when approved language changes?*
2. **Is the About Us block current?** It cites NYSE: VRT, Westerville OH HQ, ~34,000
   employees, 130+ countries. Headcount and country figures drift.

### Severity & publish gates
3. **Do the severity assignments match Legal's risk posture?** Current gates:
   CRITICAL → do not publish; HIGH → HM + Legal sign-off; MEDIUM → recruiter review; LOW → discretion.
   In particular: the Core Principals block (RD-005) is rated CRITICAL — is a brand/culture
   requirement really publish-blocking, or should that be HIGH?
4. **Is "BLOCKED" acceptable terminology** given the tool never blocks autonomously?
   Certificates record `decision_authority: HUMAN_RECRUITER` — confirm Legal is comfortable
   with the status label vs. the actual authority.

### Pay transparency (V14)
5. **Confirm the 17-jurisdiction mandatory pay-range list**: CA, CO, CT, DC, HI, IL, MA,
   MD, ME, MN, NJ, NY, NYC, OH (Cleveland), VA, VT, WA. Any effective-dated additions coming?
6. **Confirm the state-specific rules**: Colorado application deadline wording (ST-003),
   locality-specific pay reference requirement (ST-004), Washington's enhanced benefits
   detail including the 9-holiday count (ST-005), and NV/RI interview-only disclosure (ST-006).
7. **Who notifies us when a new state law passes?** The V14 update proved same-day
   enforcement is possible — but only if Legal's policy distribution includes this tool.

### Other rule content
8. **E-Verify mandatory states** — currently AZ, AL, GA, NC, SC, TN, UT. Accurate and complete?
9. **Export control (EC-001)** — which job families are actually ITAR/EAR-regulated, and is
   the required notice text approved? Currently applied to engineer/manufacturing/research/systems roles.
10. **Prohibited terms lists** — review the age-bias, gender-coded, citizenship, and
    competitor-mention term lists. Anything to add or remove?
11. **Legal citations** — each rule carries a citation shown to recruiters (Title VII,
    41 CFR 60-1.4, EO 13665, ADEA, state acts). Spot-check for accuracy.

### Records & defensibility
12. **Is 7 years the right retention period** for audit certificates in CosmosDB? What is
    the litigation-hold process if a posting is ever challenged?
13. **Is the semantic-matching posture defensible?** Findings are backed by a published
    model (all-MiniLM-L6-v2) with per-rule thresholds recorded in every certificate —
    "we used threshold 0.82" is auditable. Does Legal want anything else recorded?
14. **Rule proposal workflow** — the UI lets team members propose rules marked "Pending
    Legal Review." Who at Legal reviews proposals, and what turnaround should we promise?

---

## For HR / Talent Acquisition

### Workflow & ownership
1. **Who are the human decision-makers of record?** Certificates name the recruiter as
   the publish authority. Confirm that matches how recruiting actually assigns ownership.
2. **Where in the workflow should the audit run?** Options: at requisition draft-save
   (ORC webhook, already built), as a pre-publish checklist step, or on-demand only.
3. **Who receives BLOCKED / REVIEW_REQUIRED email alerts?** Notification plumbing exists
   (SendGrid) but the recipient list is unset. Individual recruiter? Team lead? Legal inbox?

### Data mapping
4. **How should multi-state and remote postings be regioned?** The audit takes a single
   region code; a remote posting may implicate all 17 transparency jurisdictions at once.
   What is HR's policy for remote-eligible reqs?
5. **Confirm the ORC job-family → role-type mapping** (engineer / manufacturing / research /
   sales / general). Need the authoritative list of jobFamily values used in Oracle.
6. **Golden templates** — semantic rules compare against a reference compliant JD per role
   type. Who in HR owns keeping those reference JDs current?

### Standards & rollout
7. **Are the posting-length guardrails right?** Currently flags under 500 characters
   (distribution suppression) and over 5,000 (mobile completion). HR may have its own standards.
8. **Who needs access?** Currently single-user. If other recruiters use it, we add
   Azure AD sign-in — need the user list and whether HRIS/ORC roles should gate access.
9. **Training & rollout** — does TA leadership want a pilot group first, and who runs
   the enablement session?

---

## For IT / Oracle Team (the known dependency)

This is the one item that needs engineering engagement outside this app:

1. **ORC webhook registration** — someone with Oracle Recruiting Cloud admin access needs
   to register the `requisition draft saved` webhook pointing at our endpoint
   (`POST /api/orc-webhook`), in a sandbox first.
2. **Auth & allowlisting** — what auth does Vertiv's ORC instance require for outbound
   webhooks (tokens, IP allowlists), and what approval process does IT security need?
3. **Sandbox access** — a test ORC environment to validate the payload mapping in
   `docs/orc-webhook-payload-sample.json` against real events before production.

---

*Maintained alongside the app — update this list as questions get answered, and record
the answers (with who/when) so the rule file's provenance stays auditable.*
