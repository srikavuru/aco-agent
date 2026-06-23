# ACO Agent — Automated Compliance Auditor

**Decision Support Tool. Human-owned publish decisions only.**

---

## Architecture Overview

```
POST /api/audit
  { job_description, region, role_type, submitted_by, posting_title }
         │
         ▼
┌─────────────────────────────────────────────────────────┐
│  Azure Function: audit_jd/__init__.py                   │
│  - Validates input                                       │
│  - Generates audit_id                                    │
│  - Calls RuleEngine                                      │
└─────────────────┬───────────────────────────────────────┘
                  │
         ┌────────▼────────┐
         │  RuleEngine      │  ← deterministic, rules.json-driven
         │  rule_engine.py  │
         └────────┬────────┘
         Strategies:
         ├── semantic_matcher.py  (cosine sim, all-MiniLM-L6-v2)
         ├── keyword_list check   (O(n) substring scan)
         ├── regex check          ($X,XXX – $Y,YYY patterns)
         └── computed check       (character count, etc.)
                  │
         ┌────────▼──────────────┐
         │  audit_certificate.py │  ← builds structured JSON record
         └────────┬──────────────┘
                  │
         ┌────────▼──────────┐
         │  cosmos_writer.py  │  ← persists to CosmosDB (7yr TTL)
         └───────────────────┘
```

---

## Folder Structure

```
aco-agent/
├── functions/
│   ├── audit_jd/
│   │   ├── __init__.py          # Azure Function entry point (HTTP trigger)
│   │   └── function.json        # Binding config
│   └── shared/
│       ├── rule_engine.py       # Deterministic rule evaluation
│       ├── semantic_matcher.py  # sentence-transformers wrapper
│       ├── audit_certificate.py # Structured output builder
│       └── cosmos_writer.py     # CosmosDB persistence + queries
│
├── data/
│   ├── rules/
│   │   └── rules.json                   # ← PRIMARY SOURCE OF TRUTH
│   ├── regional_matrix/
│   │   └── regional_transparency_matrix.json
│   ├── prohibited_language/
│   │   └── prohibited_terms.json
│   └── templates/
│       └── golden_template_engineer.txt
│
├── tests/
│   └── test_audit_engine.py
│
├── docs/
│   └── sample_audit_certificate.json
│
├── host.json
├── requirements.txt
└── local.settings.json          # ← never commit (add to .gitignore)
```

---

## Rule Categories in rules.json

| Category | Rules | Severity Range | Legal Basis |
|---|---|---|---|
| REQUIRED_DISCLAIMERS | RD-001 to RD-004 | CRITICAL–MEDIUM | Title VII, ADA, EO 13665 |
| SALARY_TRANSPARENCY | ST-001, ST-002 | CRITICAL–HIGH | State pay transparency laws |
| PROHIBITED_LANGUAGE | PL-001 to PL-005 | CRITICAL–MEDIUM | ADEA, Title VII, INA |
| STYLE_AND_STRUCTURE | SS-001 to SS-005 | MEDIUM–LOW | Vertiv brand standard |
| EXPORT_CONTROL | EC-001 | HIGH | ITAR/EAR |

---

## Match Types

| Type | How It Works | When Used |
|---|---|---|
| `semantic` | Cosine similarity ≥ threshold (all-MiniLM-L6-v2) | Required disclaimers (EEO, ADA, Pay Transparency) |
| `keyword_list` | Prohibited terms — any match = FAIL | Prohibited language, brand risk |
| `keyword` | Required terms — no match = FAIL | E-Verify, ITAR keywords |
| `regex` | Pattern match (salary ranges, phone numbers) | Pay range format validation |
| `computed` | Character count, word count | Style/structure checks |

---

## Audit Certificate — Overall Status Logic

| Status | Condition | Recommended Action |
|---|---|---|
| `APPROVED` | Zero findings | Publish |
| `INFO` | LOW findings only | Publish; review at discretion |
| `ADVISORY` | MEDIUM findings | Publish after review |
| `REVIEW_REQUIRED` | HIGH findings | HM + Legal sign-off required |
| `BLOCKED` | Any CRITICAL | Do not publish — resolve first |

**All final decisions are human-owned. ACO never blocks autonomously.**

---

## Local Dev

```bash
# Install dependencies
pip install -r requirements.txt

# Run tests (no Azure required)
pytest tests/ -v

# Start Function locally
func start

# Test the endpoint
curl -X POST http://localhost:7071/api/audit \
  -H "Content-Type: application/json" \
  -d '{
    "job_description": "We are looking for a young professional ...",
    "region": "CO",
    "role_type": "engineer",
    "submitted_by": "j.recruiter@vertiv.com",
    "posting_title": "Senior EE — OneCore"
  }'
```

---

## CosmosDB Setup

```bash
# Create database and container (Azure CLI)
az cosmosdb sql database create \
  --account-name <account> \
  --resource-group <rg> \
  --name aco-db

az cosmosdb sql container create \
  --account-name <account> \
  --resource-group <rg> \
  --database-name aco-db \
  --name audit-certificates \
  --partition-key-path "/posting/region" \
  --default-ttl -1
```

---

## Phase Roadmap

| Phase | Status | What |
|---|---|---|
| 1 — Foundry Sandbox | ✅ Built | Azure Function boilerplate, rules.json schema |
| 2 — Evaluation Logic | ✅ Built | Semantic + keyword + regex engine |
| 3 — Logging | ✅ Built | CosmosDB writer with 7yr TTL |
| 4 — ORC Integration | ⬜ Next | Oracle Recruiting Cloud webhook trigger |
| 5 — Recruiter UI | ⬜ Next | React dashboard for audit review workflow |
| 6 — PDF Export | ⬜ Next | Legal-hold PDF generation from certificate |
