# ACO Agent — Automated Compliance Auditor

**Decision support tool for Vertiv job posting compliance. Human-owned publish decisions only.**

ACO Agent is an internal compliance auditor that screens job descriptions against federal, state, and Vertiv-specific requirements before they reach candidates. It checks for missing EEO statements, ADA accommodation language, pay transparency violations, age/gender-biased terms, ITAR export control gaps, and brand standard deviations — returning a structured Audit Certificate with severity-ranked findings, legal citations, and one-click remediation language. ACO never blocks a posting autonomously; it surfaces issues for human recruiters to resolve.

---

## Architecture

```
                                    ┌──────────────────────────┐
                                    │   Oracle Recruiting Cloud│
                                    │   (ORC Webhook)          │
                                    └────────────┬─────────────┘
                                                 │ POST /api/orc-webhook
                                                 ▼
┌─────────────────┐    scrape     ┌──────────────────────────────┐    persist    ┌──────────────┐
│ Vertiv Careers   │─────────────▶│   Azure Functions (Python)   │─────────────▶│  CosmosDB     │
│ (Oracle HCM)     │  Playwright  │                              │   7yr TTL    │  audit-certs  │
└─────────────────┘               │  ┌────────────────────────┐  │              └──────────────┘
                                  │  │ Rule Engine             │  │
┌─────────────────┐    POST       │  │  ├ semantic (MiniLM)    │  │
│ Recruiter UI     │─────────────▶│  │  ├ keyword / keyword_list│ │
│ React + Tailwind │  /api/audit  │  │  ├ regex                │  │
│ Azure SWA        │◀─────────────│  │  └ computed             │  │
└─────────────────┘  Audit Cert   │  └────────────────────────┘  │
                                  │  ┌────────────────────────┐  │
                                  │  │ Audit Certificate       │  │
                                  │  │  Builder + PDF Export   │  │
                                  │  └────────────────────────┘  │
                                  └──────────────────────────────┘

Endpoints:
  POST /api/audit        — Direct audit (recruiter UI, batch scripts)
  POST /api/orc-webhook  — Oracle Recruiting Cloud integration
```

---

## Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Backend** | Python 3.11, Azure Functions v4 | HTTP-triggered audit endpoints |
| **Semantic Engine** | sentence-transformers, all-MiniLM-L6-v2 | Cosine similarity for required statement detection |
| **Persistence** | Azure CosmosDB | Audit certificate storage with 7-year TTL |
| **Frontend** | React 19, Vite 8, Tailwind CSS 4 | Recruiter dashboard with severity badges, PDF export |
| **Hosting** | Azure Static Web Apps (Free) | Frontend hosting with SPA fallback |
| **Scraper** | Playwright (Chromium) | Oracle HCM job page extraction |
| **CI/CD** | GitHub Actions | Auto-deploy on push to master |

---

## Rule Categories

| Category | Rules | Severity Range | Legal Basis |
|----------|-------|---------------|-------------|
| **REQUIRED_DISCLAIMERS** | RD-001 through RD-007 | CRITICAL – MEDIUM | Title VII, ADA, EO 13665, Vertiv Policy |
| **SALARY_TRANSPARENCY** | ST-001, ST-002 | CRITICAL – HIGH | CO SB21-085, NY Labor Law §194-b, CA Labor Code §432.3 |
| **PROHIBITED_LANGUAGE** | PL-001 through PL-005 | CRITICAL – MEDIUM | ADEA, Title VII, INA §274B |
| **STYLE_AND_STRUCTURE** | SS-001 through SS-005 | MEDIUM – LOW | Vertiv brand standard |
| **EXPORT_CONTROL** | EC-001 | HIGH | ITAR 22 CFR §120-130, EAR 15 CFR §730-774 |

**20 rules** across 5 categories. Each finding traces to an explicit `rule_id` — no black-box generation.

### Key Rules

| Rule ID | Name | Severity | Match Type |
|---------|------|----------|------------|
| RD-001 | EEO Statement | CRITICAL | semantic (0.82) |
| RD-002 | Reasonable Accommodation (ADA) | CRITICAL | semantic (0.75) |
| RD-005 | Core Principals & Behaviors Block | CRITICAL | semantic (0.70) |
| RD-007 | Work Authorization & No Sponsorship | CRITICAL | semantic (0.75) |
| ST-001 | Pay Range Disclosure (Mandatory States) | CRITICAL | regex |
| PL-001 | Age-Biased Language | CRITICAL | keyword_list |
| PL-003 | Citizenship/National Origin Language | CRITICAL | keyword_list |
| EC-001 | ITAR Notice for Regulated Roles | HIGH | keyword |

---

## Overall Status Logic

| Status | Condition | Recommended Action |
|--------|-----------|-------------------|
| `APPROVED` | Zero findings | Publish |
| `INFO` | LOW findings only | Publish; review at discretion |
| `ADVISORY` | MEDIUM findings present | Publish after review |
| `REVIEW_REQUIRED` | HIGH findings present | HM + Legal sign-off required |
| `BLOCKED` | Any CRITICAL finding | Do not publish — resolve first |

---

## Local Development

### Prerequisites

- Python 3.11+ (`python --version`)
- Node.js 18+ (`node --version`)
- Azure Functions Core Tools v4 (`func --version`)
- Git, pip, npm

### Setup

```bash
# Clone
git clone https://github.com/srikavuru/aco-agent.git
cd aco-agent

# Backend dependencies
pip install -r aco-agent/requirements.txt

# Frontend dependencies
cd recruiter-ui && npm install && cd ..

# Run tests (no Azure needed)
pytest aco-agent/tests/ -v
```

### Run Locally

```bash
# Terminal 1 — Azure Function backend
cd aco-agent && func start

# Terminal 2 — Recruiter UI (proxies /api to :7071)
cd recruiter-ui && npm run dev

# Open http://localhost:5173
```

### Test the Endpoint

```bash
curl -X POST http://localhost:7071/api/audit \
  -H "Content-Type: application/json" \
  -d '{
    "job_description": "We are looking for a young professional...",
    "region": "CO",
    "role_type": "engineer",
    "req_number": "REQ-12345",
    "posting_title": "Senior EE — OneCore",
    "submitted_by": "recruiter@vertiv.com"
  }'
```

---

## Batch Scraper

Scrapes live Vertiv job postings from Oracle HCM and audits them in bulk.

```bash
# Install Playwright
pip install playwright requests
python -m playwright install chromium

# Scrape 5 default postings (or pass URLs as args)
python scrapers/vertiv_scraper.py

# Audit all scraped postings against the local function
python scrapers/run_audit_batch.py

# Or audit against production
python scrapers/run_audit_batch.py --endpoint https://aco-agent-func.azurewebsites.net/api/audit
```

**Output:**
- `scrapers/output/postings.json` — structured posting data (title, req_number, location, job_family, clean JD text)
- `scrapers/output/audit_results.json` — full audit certificates for each posting

---

## Audit Certificate Structure

```json
{
  "audit_id": "ACO-20260623-A1B2C3D4",
  "certificate_version": "1.0.0",
  "audited_at": "2026-06-23T14:30:00Z",
  "posting": {
    "title": "Senior Electrical Engineer",
    "req_number": "REQ-12345",
    "region": "OH",
    "role_type": "engineer",
    "submitted_by": "recruiter@vertiv.com"
  },
  "audit_result": {
    "overall_status": "BLOCKED",
    "compliance_score": "15%",
    "rules_evaluated": 20,
    "total_findings": 17,
    "counts": { "CRITICAL": 7, "HIGH": 6, "MEDIUM": 3, "LOW": 1 },
    "publish_recommendation": "Do NOT publish..."
  },
  "findings": [
    {
      "rule_id": "RD-001",
      "severity": "CRITICAL",
      "match_type": "semantic",
      "semantic_score": 0.15,
      "semantic_threshold": 0.82,
      "failure_message": "EEO statement missing...",
      "legal_citation": "Title VII; 41 CFR 60-1.4",
      "remediation_template": "vertiv_eeo_block_v3"
    }
  ],
  "legal_record": {
    "decision_authority": "HUMAN_RECRUITER",
    "tool_type": "DECISION_SUPPORT",
    "audit_engine": "ACO v1.0",
    "model_used_for_semantic": "all-MiniLM-L6-v2"
  }
}
```

---

## Environment Variables

Set in Azure Function App Settings or `local.settings.json` (never committed):

| Variable | Required | Description |
|----------|----------|-------------|
| `COSMOS_ENDPOINT` | For persistence | CosmosDB account URI |
| `COSMOS_KEY` | For persistence | CosmosDB primary key |
| `COSMOS_DATABASE` | For persistence | Database name (default: `aco-db`) |
| `COSMOS_CONTAINER` | For persistence | Container name (default: `audit-certificates`) |
| `VITE_API_BASE` | Production build | Function App URL for the React frontend |

---

## Phase Roadmap

| Phase | Status | Deliverable |
|-------|--------|-------------|
| 1 — Foundry Sandbox | Done | Azure Function boilerplate, rules.json schema |
| 2 — Evaluation Logic | Done | Semantic + keyword + regex rule engine |
| 3 — Persistence | Done | CosmosDB writer with 7-year TTL |
| 4 — ORC Integration | Done | Oracle Recruiting Cloud webhook endpoint |
| 5 — Recruiter UI | Done | React dashboard, severity badges, finding cards |
| 6 — PDF Export | Done | Client-side jsPDF audit certificate generation |
| 7 — Batch Scraper | Done | Playwright scraper + batch audit runner |
| 8 — Azure Deployment | Done | SWA + Function App + GitHub Actions CI/CD |

---

## Design Decisions

### Why deterministic rules, not LLM generation?

Every finding must trace to an explicit `rule_id` with a published threshold. When Legal asks "why did ACO flag this posting?", the answer is "rule RD-001 checked for EEO language using cosine similarity against a canonical text, scored 0.42 against a 0.82 threshold." That's auditable. "GPT said it looked non-compliant" is not.

### Why all-MiniLM-L6-v2?

- **Deterministic**: same input produces the same score every time — required for audit trail integrity
- **Cost**: free inference vs. API calls per audit at scale
- **Latency**: ~5ms local inference vs. 300-800ms API round-trip
- **Size**: 22MB model, fits in Azure Functions Consumption plan
- **Legal defensibility**: "we used threshold 0.82 on a published, peer-reviewed model" holds up in review

### Why human decision authority?

ACO is a decision support tool. The `legal_record` block in every certificate shows `decision_authority: HUMAN_RECRUITER` and `tool_type: DECISION_SUPPORT`. Even when the status is `BLOCKED`, ACO cannot prevent publication — it surfaces the recommendation. The recruiter and their manager own the final call.

### Why 7-year TTL?

Employment records and hiring documentation are subject to federal retention requirements (EEOC guidelines, OFCCP audit windows). The 7-year TTL on CosmosDB documents ensures audit certificates survive through any reasonable compliance review period, then auto-expire.

---

## Project Structure

```
aco-agent/
├── aco-agent/                    # Azure Function backend
│   ├── audit_jd/                 # POST /api/audit
│   ├── orc_webhook/              # POST /api/orc-webhook
│   ├── shared/                   # Rule engine, semantic matcher, certificate builder
│   ├── data/rules/rules.json     # Primary source of truth for all compliance rules
│   ├── tests/                    # pytest suite (no Azure needed)
│   └── requirements.txt
├── recruiter-ui/                 # React + Tailwind frontend
│   └── src/components/           # AuditForm, AuditResult, FindingCard, etc.
├── scrapers/                     # Playwright scraper + batch audit runner
│   └── output/                   # Scraped postings + audit results
├── .github/workflows/            # CI/CD for SWA and Function App
├── CLAUDE.md                     # Claude Code project context
└── README.md
```

---

<sub>Decision support only — all publish decisions are human-owned.</sub>
