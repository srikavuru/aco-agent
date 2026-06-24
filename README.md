# ACO Agent — Automated Compliance Auditor

**Decision support tool for Vertiv job posting compliance. Human-owned publish decisions only.**

ACO Agent is an internal compliance auditor that screens job descriptions against federal, state, and Vertiv-specific requirements before they reach candidates. It checks for missing EEO statements, ADA accommodation language, pay transparency violations, age/gender-biased terms, ITAR export control gaps, and brand standard deviations — returning a structured Audit Certificate with severity-ranked findings, legal citations, and one-click remediation language. ACO never blocks a posting autonomously; it surfaces issues for human recruiters to resolve.

**Live:** [white-sea-07b2f3b0f.7.azurestaticapps.net](https://white-sea-07b2f3b0f.7.azurestaticapps.net)

---

## Architecture

```
                                    +----------------------------+
                                    |   Oracle Recruiting Cloud  |
                                    |   (ORC Webhook)            |
                                    +-------------+--------------+
                                                  | POST /api/orc-webhook
                                                  v
+-----------------+  Oracle REST  +-------------------------------+   persist   +--------------+
| Vertiv Careers  |-------------->|   Azure Functions (Python)    |------------>| CosmosDB     |
| (Oracle HCM)   |    API        |                               |   7yr TTL   | audit-certs  |
+-----------------+               |  +-------------------------+  |             +--------------+
                                  |  | Rule Engine              |  |
+-----------------+    POST       |  |  - semantic (MiniLM)     |  |   notify   +--------------+
| Recruiter UI    |-------------->|  |  - keyword / keyword_list|  |----------->| SendGrid     |
| React + Tailwind|  /api/audit   |  |  - regex                 |  |            | Email Alerts |
| Azure SWA       |<--------------|  |  - computed               |  |            +--------------+
+-----------------+  Audit Cert   |  +-------------------------+  |
                                  |  +-------------------------+  |
+-----------------+    POST       |  | Embedding Cache          |  |
| Spreadsheet     |-------------->|  | Pre-computed canonical   |  |
| Upload (CSV/XLS)|  /api/audit   |  | text embeddings          |  |
+-----------------+  per req #    |  +-------------------------+  |
                                  +-------------------------------+

Endpoints:
  POST /api/audit        Direct audit (text or URL mode)
  POST /api/orc-webhook  Oracle Recruiting Cloud integration
  POST /api/audit-all    Batch audit N postings from careers site
  GET  /api/warmup       Pre-load semantic model for fast response
```

---

## Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Backend** | Python 3.11, Azure Functions v4 | HTTP-triggered audit endpoints |
| **Semantic Engine** | sentence-transformers, all-MiniLM-L6-v2 | Cosine similarity for required statement detection |
| **Embedding Cache** | Pre-computed numpy arrays | Skip re-encoding canonical texts (40ms vs 200ms per audit) |
| **Persistence** | Azure CosmosDB | Audit certificate storage with 7-year TTL |
| **Notifications** | SendGrid API | Email alerts for BLOCKED/REVIEW_REQUIRED results |
| **Frontend** | React 19, Vite 8, Tailwind CSS 4 | Recruiter dashboard with donut chart, PDF export |
| **Hosting** | Azure Static Web Apps (Free) | Frontend hosting with SPA fallback |
| **Data Source** | Oracle HCM REST API | Direct job data extraction (no browser needed) |
| **Scraper** | Playwright (local only) | Batch scraping for demo scripts |
| **CI/CD** | GitHub Actions | SWA auto-deploy, Function tests, keep-warm cron |

---

## Features

### Recruiter Dashboard (Audit Tab)

- **Paste Text** or **Enter URL** — paste a JD directly or enter an Oracle HCM URL for automatic extraction
- **Compliance donut chart** — radial gauge with score percentage, color-coded by status
- **Severity-coded finding cards** — red/orange/yellow/gray left borders, monospace rule IDs, match type badges
- **Copy All Remediation Language** — one click copies all missing required blocks with section headers
- **Download PDF** — formatted audit certificate with header, findings table, legal record
- **Download JSON** — raw certificate for programmatic use
- **Audit history** — last 10 audits in a collapsible table, click to re-render

### Batch Scrape Tab

- **Upload Reqs** — upload a CSV/Excel spreadsheet, select the req number column, audit each against the live site
- **Crawl All** — audit N postings from the Vertiv careers site (via Oracle HCM REST API, fully serverless)
- **Specific URLs** — paste individual Oracle HCM URLs for targeted audits
- **Export CSV** — download batch results as a spreadsheet
- **Auto-warmup** — pre-loads the semantic model before batch operations

### Backend

- **Deterministic rule engine** — 20 rules across 5 categories, every finding traces to an explicit rule_id
- **Oracle HCM REST API integration** — extracts job data without Playwright, works on Consumption plan
- **Pre-computed embedding cache** — 33 canonical text embeddings loaded at startup
- **CosmosDB persistence** — fire-and-forget background writes with 7-year TTL
- **Email notifications** — BLOCKED/REVIEW_REQUIRED audits trigger SendGrid alerts
- **Keep-warm cron** — GitHub Actions pings /api/warmup every 15 min during business hours

---

## Rule Categories

| Category | Rules | Severity Range | Legal Basis |
|----------|-------|---------------|-------------|
| **REQUIRED_DISCLAIMERS** | RD-001 through RD-007 | CRITICAL - MEDIUM | Title VII, ADA, EO 13665, Vertiv Policy |
| **SALARY_TRANSPARENCY** | ST-001, ST-002 | CRITICAL - HIGH | CO SB21-085, NY Labor Law, CA Labor Code |
| **PROHIBITED_LANGUAGE** | PL-001 through PL-005 | CRITICAL - MEDIUM | ADEA, Title VII, INA |
| **STYLE_AND_STRUCTURE** | SS-001 through SS-005 | MEDIUM - LOW | Vertiv brand standard |
| **EXPORT_CONTROL** | EC-001 | HIGH | ITAR 22 CFR, EAR 15 CFR |

**20 rules** across 5 categories. Each finding traces to an explicit `rule_id`.

---

## Overall Status Logic

| Status | Condition | Recommended Action |
|--------|-----------|-------------------|
| `APPROVED` | Zero findings | Publish |
| `INFO` | LOW findings only | Publish; review at discretion |
| `ADVISORY` | MEDIUM findings present | Publish after review |
| `REVIEW_REQUIRED` | HIGH findings present | HM + Legal sign-off required |
| `BLOCKED` | Any CRITICAL finding | Do not publish -- resolve first |

---

## Local Development

### Prerequisites

- Python 3.11+, Node.js 18+, Azure Functions Core Tools v4, Git

### Setup

```bash
git clone https://github.com/srikavuru/aco-agent.git
cd aco-agent

pip install -r aco-agent/requirements.txt
cd recruiter-ui && npm install && cd ..
pytest aco-agent/tests/ -v
```

### Run Locally

```bash
# Terminal 1
cd aco-agent && func start

# Terminal 2
cd recruiter-ui && npm run dev

# Open http://localhost:5173
```

### Deploy Function (manual)

```bash
cd aco-agent && func azure functionapp publish aco-agent-func --python
```

---

## Batch Audit

### From the UI

Open the **Batch Scrape** tab, choose **Crawl All**, set the count, and click. The function crawls the Oracle HCM REST API, fetches each posting's details, and runs the compliance audit -- all serverless.

### From the CLI

```bash
# Autonomous pipeline demo (10 postings against production)
python scrapers/demo_run.py --count 10

# Scrape with Playwright + audit locally
python scrapers/vertiv_scraper.py
python scrapers/run_audit_batch.py

# Audit against production
python scrapers/run_audit_batch.py --endpoint https://aco-agent-func.azurewebsites.net/api/audit
```

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `COSMOS_ENDPOINT` | For persistence | CosmosDB account URI |
| `COSMOS_KEY` | For persistence | CosmosDB primary key |
| `COSMOS_DATABASE` | For persistence | Database name (default: `aco-db`) |
| `COSMOS_CONTAINER` | For persistence | Container name (default: `audit-certificates`) |
| `SENDGRID_API_KEY` | For notifications | SendGrid API key for email alerts |
| `NOTIFY_FROM_EMAIL` | For notifications | Sender email address |
| `NOTIFY_TO_EMAILS` | For notifications | Comma-separated recipient list |
| `VITE_API_BASE` | Production build | Function App URL for the React frontend |

---

## Phase Roadmap

| Phase | Status | Deliverable |
|-------|--------|-------------|
| 1 -- Foundry Sandbox | Done | Azure Function boilerplate, rules.json schema |
| 2 -- Evaluation Logic | Done | Semantic + keyword + regex rule engine |
| 3 -- Persistence | Done | CosmosDB writer with 7-year TTL |
| 4 -- ORC Integration | Done | Oracle Recruiting Cloud webhook endpoint |
| 5 -- Recruiter UI | Done | React dashboard with donut chart, PDF export, audit history |
| 6 -- PDF Export | Done | Client-side jsPDF certificate generation |
| 7 -- Batch Scraper | Done | Playwright scraper + Oracle REST API batch audit |
| 8 -- Azure Deployment | Done | SWA + Function App + GitHub Actions CI/CD |
| 9 -- Agent Infra | Done | Embedding cache, CosmosDB persistence, email notifications |
| 10 -- Spreadsheet Upload | Done | CSV/Excel req number upload with column picker |

---

## Design Decisions

### Why deterministic rules, not LLM generation?

Every finding must trace to an explicit `rule_id` with a published threshold. When Legal asks "why did ACO flag this posting?", the answer is "rule RD-001 checked for EEO language using cosine similarity against a canonical text, scored 0.42 against a 0.82 threshold." That's auditable. "GPT said it looked non-compliant" is not.

### Why all-MiniLM-L6-v2?

- **Deterministic**: same input = same score every time
- **Cost**: free inference vs. API calls per audit at scale
- **Latency**: ~5ms local inference vs. 300-800ms API round-trip
- **Size**: 22MB model, fits in Azure Functions Consumption plan
- **Legal defensibility**: "we used threshold 0.82 on a published, peer-reviewed model" holds up in review

### Why Oracle HCM REST API instead of Playwright?

Playwright requires a ~150MB Chromium binary that doesn't fit on Consumption plan. The Oracle HCM candidate experience SPA loads data from a public REST API (`recruitingCEJobRequisitionDetails`). We call that API directly -- same data, no browser, works serverless.

### Why human decision authority?

ACO is a decision support tool. The `legal_record` block in every certificate shows `decision_authority: HUMAN_RECRUITER` and `tool_type: DECISION_SUPPORT`. Even when the status is `BLOCKED`, ACO cannot prevent publication. The recruiter and their manager own the final call.

### Why 7-year TTL?

Employment records are subject to federal retention requirements (EEOC guidelines, OFCCP audit windows). The 7-year TTL ensures audit certificates survive through any reasonable compliance review period, then auto-expire.

---

## Project Structure

```
aco-agent/
|-- aco-agent/                    # Azure Function backend
|   |-- audit_jd/                 # POST /api/audit
|   |-- audit_all/                # POST /api/audit-all
|   |-- orc_webhook/              # POST /api/orc-webhook
|   |-- warmup/                   # GET /api/warmup
|   |-- shared/                   # Rule engine, semantic matcher, embedding cache,
|   |                             # certificate builder, CosmosDB writer, notifier
|   |-- data/rules/rules.json     # Primary source of truth for all compliance rules
|   |-- data/cache/               # Pre-computed embedding cache (embeddings.npz)
|   |-- tests/                    # pytest suite (no Azure needed)
|   +-- requirements.txt
|-- recruiter-ui/                 # React + Tailwind frontend
|   +-- src/components/           # AuditForm, AuditResult, BatchScrape, ComplianceDonut,
|                                 # FindingCard, SeverityBadge, AuditHistory, generatePdf
|-- scrapers/                     # Playwright scraper + batch audit runner + demo script
|   +-- output/                   # Scraped postings + audit results
|-- .github/workflows/            # SWA deploy, Function tests, keep-warm cron
|-- CLAUDE.md                     # Claude Code project context
+-- README.md
```

---

<sub>Decision support only -- all publish decisions are human-owned.</sub>
