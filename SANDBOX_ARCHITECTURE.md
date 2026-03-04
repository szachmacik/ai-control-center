# Security Sandbox Module — Architecture Design

## Overview

The Security Sandbox module extends AI Control Center with the ability to:
1. **Clone** a target website (crawl HTML/CSS/JS/assets)
2. **Anonymize** sensitive data (replace real emails, phones, names, IDs with mock data)
3. **Host** the cloned site temporarily as a sandbox environment
4. **Run** automated security scans and controlled attack simulations
5. **Report** findings with severity ratings and remediation suggestions

---

## Database Schema — New Tables

### `sandbox_environments`
| Column | Type | Description |
|---|---|---|
| id | int PK | Auto-increment |
| userId | int FK | Owner |
| name | varchar(128) | Human label |
| targetUrl | varchar(512) | Original URL cloned |
| status | enum | `cloning`, `ready`, `scanning`, `completed`, `error` |
| sandboxUrl | varchar(512) | Hosted sandbox URL (Manus Spaces or local) |
| deployType | enum | `manus_spaces`, `local_download` |
| anonymized | boolean | Whether PII was scrubbed |
| createdAt | timestamp | |
| updatedAt | timestamp | |

### `sandbox_scans`
| Column | Type | Description |
|---|---|---|
| id | int PK | Auto-increment |
| sandboxId | int FK | Parent sandbox |
| scanType | enum | `passive`, `active`, `xss`, `sqli`, `headers`, `ssl`, `csrf`, `open_redirect`, `full` |
| status | enum | `pending`, `running`, `completed`, `failed` |
| startedAt | timestamp | |
| completedAt | timestamp | |
| summary | json | `{ critical, high, medium, low, info }` counts |
| createdAt | timestamp | |

### `sandbox_findings`
| Column | Type | Description |
|---|---|---|
| id | int PK | Auto-increment |
| scanId | int FK | Parent scan |
| sandboxId | int FK | |
| severity | enum | `critical`, `high`, `medium`, `low`, `info` |
| category | varchar(64) | e.g. `XSS`, `SQLi`, `Missing Headers`, `Open Redirect` |
| title | varchar(255) | Short description |
| description | text | Detailed finding |
| evidence | text | Request/response snippet |
| url | varchar(512) | Affected URL |
| remediation | text | How to fix |
| cvssScore | decimal(3,1) | CVSS 3.1 base score |
| createdAt | timestamp | |

---

## Backend API (tRPC Routers)

### `sandbox` router
```
sandbox.list          → list all sandboxes for current user
sandbox.get           → get sandbox by id (with scans)
sandbox.create        → clone URL, anonymize, deploy sandbox
sandbox.delete        → remove sandbox
sandbox.download      → generate downloadable ZIP of sandbox
sandbox.startScan     → trigger a scan on a sandbox
sandbox.getScanResults → get findings for a scan
sandbox.getReport     → generate PDF/JSON security report
```

---

## Cloning Engine (server-side)

**Tool**: `wget --mirror` or `httrack` (CLI) → produces static site copy

**Anonymization pipeline** (Node.js):
- Regex replace: emails → `user@mock-data.test`
- Regex replace: phone numbers → `+48 000 000 000`
- Regex replace: Polish NIP/PESEL patterns → randomized mock
- HTML attribute scan: `value=`, `placeholder=` containing PII patterns
- JSON/API response intercept: replace known PII fields

---

## Security Scan Engine

### Passive Checks (no active attacks — safe on any env)
- HTTP Security Headers audit (CSP, HSTS, X-Frame-Options, etc.)
- Cookie flags (Secure, HttpOnly, SameSite)
- SSL/TLS certificate validation
- Information disclosure (server headers, error messages)
- Robots.txt / sitemap exposure
- Open directories / sensitive file exposure (.env, .git, backup files)

### Active Checks (controlled attacks — sandbox only)
- **XSS**: inject `<script>alert(1)</script>` into all input fields and URL params
- **SQL Injection**: inject `' OR 1=1--` patterns into forms and query params
- **CSRF**: check for missing CSRF tokens on state-changing forms
- **Open Redirect**: test `?redirect=https://evil.com` patterns
- **Path Traversal**: test `../../etc/passwd` patterns
- **Clickjacking**: check X-Frame-Options / CSP frame-ancestors
- **Broken Authentication**: test default credentials on login forms

### Tools Used
- **OWASP ZAP** (via Docker or API) — industry standard scanner
- **Custom Node.js scanner** — lightweight header/cookie checks
- **Playwright** — headless browser for XSS/form injection tests

---

## Deployment Modes

### Mode A: Manus Spaces (temporary, cloud)
- Sandbox served via `expose()` on a random port
- URL shared back to user for browser-based testing
- Auto-expires after session ends

### Mode B: Local Download (ZIP)
- All cloned files + `docker-compose.yml` packaged as ZIP
- User runs `docker-compose up` locally
- Sentinel syncs scan results back via API token

---

## Frontend Pages

### `/sandbox` — Sandbox List
- Cards showing all sandboxes: name, target URL, status badge, last scan date
- "New Sandbox" button

### `/sandbox/new` — Create Sandbox
- Form: Target URL, Name, Deploy Mode (Manus Spaces / Download ZIP)
- Toggle: Anonymize PII (on by default)
- Toggle: Auto-run security scan after cloning

### `/sandbox/:id` — Sandbox Detail
- Status indicator (cloning progress)
- "Open Sandbox" button (if Manus Spaces)
- "Download ZIP" button
- Scan history list
- "Run New Scan" button with scan type selector

### `/sandbox/:id/scan/:scanId` — Scan Results
- Summary cards: Critical / High / Medium / Low / Info counts
- Findings table with severity badges, category, affected URL
- Expandable finding detail: description, evidence, remediation
- "Export Report" button (PDF / JSON)

---

## Security Considerations

- Cloning and scanning runs ONLY on explicitly user-provided URLs
- Active scans ONLY run on sandbox environments, never on production
- All sandbox environments are isolated (separate port/container)
- PII anonymization is irreversible (one-way replacement)
- Scan results stored per-user, never shared across accounts
- Rate limiting on scan triggers (max 3 concurrent scans per user)
