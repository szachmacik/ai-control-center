# Sentinel — AI Control Center

> **Autonomiczne centrum dowodzenia dla agentów AI, projektów i infrastruktury**

Sentinel to wewnętrzna platforma zarządzania dla offshore.dev — umożliwia monitorowanie agentów AI, zarządzanie zadaniami, audyty bezpieczeństwa, integrację z Facebook Ads / ManyChat oraz autonomiczne sterowanie przez Manus AI.

[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-19-blue)](https://react.dev/)
[![tRPC](https://img.shields.io/badge/tRPC-11-violet)](https://trpc.io/)
[![Drizzle](https://img.shields.io/badge/Drizzle-ORM-green)](https://orm.drizzle.team/)

---

## Stack technologiczny

| Warstwa | Technologia |
|---------|------------|
| Frontend | React 19 + Vite + TypeScript + TailwindCSS |
| Backend | Node.js + Express + tRPC 11 |
| ORM | Drizzle ORM + MySQL (TiDB) |
| Auth | Manus OAuth (Google SSO) |
| UI | shadcn/ui + Recharts + Lucide |
| Testy | Vitest |

---

## Funkcjonalności

### Dashboard
- Statystyki w czasie rzeczywistym: agenci, zadania, audyty, uptime
- Wykres aktywności agentów (7 dni) — Recharts AreaChart
- Wykres severity findings z audytów — Recharts BarChart
- Widget ostatnich findings z audytów
- Auto-refresh co 30 sekund

### Agenci (`/agents`)
- Lista agentów z live polling co 10 sekund
- Status badge: active / idle / error / offline
- Panel szczegółów (Sheet) z historią zadań i logami
- Tworzenie i edycja agentów

### Zadania (`/tasks`)
- Kanban-style lista zadań z priorytetami
- Panel szczegółów z live logami (polling co 3s gdy status = running)
- Przyciski akcji: Mark Running / Complete / Failed
- Link do Google Drive z wynikami

### Audyty (`/audits`)
- 5 typów audytów: Uptime, Security, Functional, Dependencies, DB Health
- Ręczne uruchamianie z animacją ładowania
- Historia runów z severity badge i liczbą findings
- Dialog ze szczegółowymi findings per run
- Statystyki: critical/high findings, ostatni run

### Marketing (`/marketing`)
- Integracja z Facebook Ads (wymaga kluczy)
- Facebook CAPI events — śledzenie konwersji
- ManyChat webhook events
- Kolejka zadań Manus do autonomicznego zarządzania kampaniami

### Infrastruktura (`/infrastructure`)
- Monitoring serwerów i serwisów
- Status uptime per endpoint

### Security Sandbox (`/sandbox`)
- Środowiska testowe dla skanowania bezpieczeństwa
- Wyniki skanów z findings

### Powiadomienia
- Bell icon w topbarze z licznikiem nieprzeczytanych
- Dropdown z alertami z audytów i logów agentów
- Auto-refresh co 30 sekund

### Global Search (Cmd+K)
- Szybkie przejście do dowolnej strony
- Skróty klawiaturowe

### Ustawienia (`/settings`)
- Profil użytkownika
- Motyw (dark/light)
- Konfiguracja powiadomień
- Harmonogram audytów
- Klucze API
- Danger Zone

---

## Manus Autonomous API

Sentinel udostępnia REST API które pozwala Manusowi autonomicznie wykonywać zadania:

```
POST /api/manus/tasks
Authorization: Bearer <MANUS_API_KEY>

{
  "taskType": "fb_campaign_create" | "fb_campaign_pause" | "fb_budget_update" |
              "fb_audience_update" | "fb_report_generate" | "manychat_flow_trigger" |
              "deploy_project" | "run_audit",
  "payload": { ... },
  "submittedBy": "manus"
}
```

```
GET /api/manus/tasks          — lista zadań w kolejce
GET /api/manus/tasks/:id      — status zadania
POST /api/manus/tasks/:id/complete — oznacz jako zakończone
```

---

## Schemat bazy danych

```
agents              — agenci AI (typ, model, status, konfiguracja)
agent_logs          — logi aktywności agentów
tasks               — zadania z priorytetami i przypisaniem do agentów
task_logs           — logi wykonania zadań
audit_projects      — monitorowane projekty
audit_runs          — historyczne runy audytów
audit_findings      — findings per run (severity: critical/high/medium/low/info)
uptime_checks       — historia sprawdzeń dostępności
notifications       — powiadomienia systemowe
fb_capi_events      — eventy Facebook CAPI
manychat_events     — eventy ManyChat webhooks
fb_campaigns        — kampanie Facebook Ads
manus_queue         — kolejka zadań dla Manus AI
sandboxEnvironments — środowiska security sandbox
sandboxScans        — skany bezpieczeństwa
sandboxFindings     — findings ze skanów
```

---

## Instalacja i uruchomienie

```bash
# 1. Klonowanie
git clone https://github.com/szachmacik/ai-control-center.git
cd ai-control-center

# 2. Zależności
pnpm install

# 3. Zmienne środowiskowe
cp .env.example .env
# Uzupełnij .env (patrz sekcja poniżej)

# 4. Migracje bazy danych
pnpm db:migrate

# 5. Uruchomienie dev
pnpm dev
```

### Wymagane zmienne środowiskowe

```env
# Baza danych
DATABASE_URL=mysql://user:pass@host:4000/sentinel

# Auth (Manus OAuth)
MANUS_CLIENT_ID=...
MANUS_CLIENT_SECRET=...
NEXTAUTH_SECRET=...

# Manus API
MANUS_API_KEY=...          # Klucz do Manus Autonomous API

# Facebook Ads (opcjonalne)
FB_ACCESS_TOKEN=...
FB_PIXEL_ID=...
FB_AD_ACCOUNT_ID=act_...

# ManyChat (opcjonalne)
MANYCHAT_WEBHOOK_SECRET=...
```

---

## Struktura projektu

```
ai-control-center/
├── client/src/
│   ├── pages/              # 19 stron React
│   ├── components/
│   │   ├── ui/             # shadcn/ui komponenty
│   │   ├── DashboardLayout.tsx
│   │   ├── GlobalSearch.tsx
│   │   ├── NotificationCenter.tsx
│   │   └── ThemeToggle.tsx
│   └── lib/
├── server/
│   ├── _core/              # tRPC setup, auth, schema
│   ├── db.ts               # Drizzle DB functions
│   ├── auditDb.ts          # Audit module DB
│   ├── auditEngine.ts      # Audit runners (5 typów)
│   ├── marketingDb.ts      # Marketing/FB Ads DB
│   ├── fbCapiService.ts    # Facebook CAPI integration
│   ├── manusApi.ts         # Manus Autonomous API handlers
│   ├── notificationsDb.ts  # Notifications DB
│   └── routers.ts          # tRPC router (wszystkie endpointy)
└── drizzle/
    ├── schema.ts            # Pełny schemat DB
    ├── 0001_initial.sql
    ├── 0002_sandbox.sql
    ├── 0003_audit_module.sql
    └── 0004_marketing_manus.sql
```

---

## Automatyczne audyty

Sentinel jest monitorowany przez zestaw automatycznych skryptów:

| Audyt | Częstotliwość | Skrypt |
|-------|--------------|--------|
| Uptime | Codziennie 07:00 | `run_uptime_check.py` |
| Bezpieczeństwo | Pon 08:00 | `run_audit.py` |
| Funkcjonalny | Pon 08:30 | `run_functional_audit.py` |
| Zależności | Pon 09:00 | `run_dependency_check.py` |
| Baza danych | 1. każdego miesiąca | `run_db_health.py` |

Raporty trafiają automatycznie na Google Drive (`ofshore.dev/`).

---

## Powiązane projekty

| Projekt | Repo | Opis |
|---------|------|------|
| Integration Hub | `szachmacik/integration-hub` | Katalog 33 integracji dla klientów |
| Polaris Track | `szachmacik/polaris-track` | Marketing attribution SaaS |
| ZenKsięgowość | `szachmacik/zenksiegowosc` | Platforma finansowa |
| Educational Sales | `szachmacik/educational-sales-site` | Platforma edukacyjna (Next.js) |

---

*Projekt prywatny — offshore.dev | Manus AI*
