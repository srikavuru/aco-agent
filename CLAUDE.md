# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

ACO Agent (Automated Compliance Auditor) — an Azure Function that audits job descriptions for legal compliance (EEO, ADA, pay transparency, prohibited language, export control). It is a **decision support tool only** — it flags issues for human recruiters; it never blocks autonomously. Built for Vertiv's recruiting workflow.

## Commands

```bash
# Install backend deps (from repo root)
pip install -r aco-agent/requirements.txt

# Run tests (no Azure/CosmosDB needed)
pytest aco-agent/tests/ -v

# Run Azure Function locally (requires Azure Functions Core Tools)
cd aco-agent && func start

# Run recruiter UI (separate terminal)
cd recruiter-ui && npm install && npm run dev

# Test audit endpoint
curl -X POST http://localhost:7071/api/audit -H "Content-Type: application/json" \
  -d '{"job_description": "...", "region": "CO", "role_type": "engineer", "req_number": "REQ-12345", "submitted_by": "user@vertiv.com", "posting_title": "Senior EE"}'

# Test ORC webhook (use sample payload)
curl -X POST http://localhost:7071/api/orc-webhook -H "Content-Type: application/json" \
  -d @aco-agent/docs/orc-webhook-payload-sample.json
```

## Architecture

### Backend — `aco-agent/`

Two Azure Functions sharing a common engine:

- **`POST /api/audit`** (`audit_jd/__init__.py`) — Direct audit. Accepts `job_description`, `region`, `role_type`, `req_number`, `posting_title`, `submitted_by`. Returns Audit Certificate JSON.
- **`POST /api/orc-webhook`** (`orc_webhook/__init__.py`) — Oracle Recruiting Cloud integration. Accepts ORC's requisition-draft-saved webhook payload, strips HTML from `jobDescription`, maps `primaryLocation` → region code, maps `jobFamily` → role_type, extracts `requisitionNumber` → req_number, then runs the same audit pipeline.

Shared modules at `aco-agent/shared/`:

1. **`rule_engine.py`** — Deterministic rule evaluator. Dispatches each rule from `data/rules/rules.json` to its match strategy (semantic, keyword_list, keyword, regex, computed). Returns findings sorted by severity.
2. **`semantic_matcher.py`** — Wraps `all-MiniLM-L6-v2` via sentence-transformers for cosine similarity. Chunks long JDs into paragraphs for per-section matching. Lazy-loads model on first use. Falls back to token overlap if package unavailable.
3. **`audit_certificate.py`** — Builds the structured Audit Certificate JSON (the legal record). Status logic: CRITICAL→BLOCKED, HIGH→REVIEW_REQUIRED, MEDIUM→ADVISORY, LOW→INFO, none→APPROVED. Version is `AUDIT_CERT_VERSION`. The `posting` object includes `req_number`.
4. **`cosmos_writer.py`** — Persists certificates to CosmosDB with 7-year TTL. Partition key: `/posting/region`. Requires env vars: `COSMOS_ENDPOINT`, `COSMOS_KEY`, `COSMOS_DATABASE`, `COSMOS_CONTAINER`.

### Frontend — `recruiter-ui/`

Vite + React + Tailwind app. Vite proxies `/api` to `localhost:7071`. Tabs: Audit, Batch Scrape, Rules, What's New, Reporting. Components:
- `AuditForm` — JD paste textarea, posting title, req number, region/role selects
- `AuditResult` — Status banner with severity count pills, req number display
- `FindingCard` — Per-finding detail with severity badge, matched terms, legal citation, one-click remediation copy
- `SeverityBadge` — Color-coded CRITICAL/HIGH/MEDIUM/LOW badge
- `ComplianceRules` — All audit rules organized by category with severity badges and publish gate legend
- `WhatsNew` — Timeline-style changelog showcasing policy updates (e.g. V14 pay transparency)
- `BatchScrape` — Batch JD scraping interface
- `ComplianceDonut` — Donut chart for compliance visualization
- `AuditHistory` — Recent audit session history

## Key Data Files

- **`data/rules/rules.json`** — Primary source of truth for all compliance rules. Each rule has a `match_type`, severity, and category. Changes here directly affect audit behavior.
- **`data/regional_matrix/regional_transparency_matrix.json`** — Region-specific salary transparency requirements.
- **`data/prohibited_language/prohibited_terms.json`** — Banned terms list (age bias, national origin, etc.).
- **`data/templates/golden_template_engineer.txt`** — Reference compliant JD for semantic comparison.
- **`docs/orc-webhook-payload-sample.json`** — Sample ORC webhook payload showing all mapped fields.

## Deployment

- **Pushing to `master` triggers two GitHub Actions workflows automatically:**
  - **Deploy Static Web App** — builds and deploys `recruiter-ui/` to Azure Static Web Apps (~1 min)
  - **Deploy Azure Function** — deploys `aco-agent/` to Azure Functions
- **Keep Function Warm** — scheduled workflow that pings the function app every ~2 hours to prevent cold starts
- **Live site:** `aco-agent-func.azurewebsites.net` (backend API) + Azure Static Web App (frontend)
- **To get changes live:** merge to `master` (or push directly) — do NOT stay on a feature branch expecting the live site to update
- PR branches do not trigger deploys

## Design Constraints

- Every finding must trace to an explicit `rule_id` — no black-box generation.
- Semantic matching uses a published model with configurable per-rule thresholds for legal defensibility ("we used threshold 0.82 on all-MiniLM-L6-v2" is auditable).
- The `legal_record` block in every certificate must always show `decision_authority: HUMAN_RECRUITER` and `tool_type: DECISION_SUPPORT`.
- Audit Certificate schema is versioned — breaking changes require bumping `AUDIT_CERT_VERSION` and a CosmosDB migration plan.
- `local.settings.json` contains secrets — never commit it.
- When adding features or changing rules, update the `TIMELINE` array in `recruiter-ui/src/components/WhatsNew.jsx` in the same commit. This is the user-facing changelog — it should always reflect what's live.

## Roadmap (Not Yet Built)

Phase 6: PDF export for legal hold.
