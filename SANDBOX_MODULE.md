# Security Sandbox Module — Dokumentacja

> Moduł rozszerzający AI Control Center / Sentinel App o możliwość klonowania stron, tworzenia wiernych środowisk uruchomieniowych i przeprowadzania kontrolowanych testów bezpieczeństwa.

---

## Jak to działa — przepływ

```
Twoja strona produkcyjna
        │
        ▼
1. DETEKCJA TECHNOLOGII
   Sentinel analizuje nagłówki HTTP, meta tagi, pliki (wp-login.php, composer.json,
   package.json, requirements.txt, Gemfile, manage.py...) i rozpoznaje stos technologiczny
        │
        ▼
2. KLONOWANIE (wget --mirror)
   Pobiera strukturę strony (HTML, CSS, JS, zasoby) — max 50MB, 3 poziomy głębokości
        │
        ▼
3. ANONIMIZACJA PII
   Automatycznie zastępuje w WSZYSTKICH plikach tekstowych:
   • Emaile → user@mock-data.test
   • Telefony PL → +48 000 000 000
   • NIP → 000-000-00-00
   • PESEL → 00000000000
   • Numery kart → 0000-0000-0000-0000
   • IBAN PL → PL00 0000 0000 0000 0000 0000 0000
        │
        ▼
4. GENEROWANIE ŚRODOWISKA DOCKER
   Dopasowany docker-compose.yml + Dockerfile dla wykrytego stosu
        │
        ▼
5. SKANOWANIE BEZPIECZEŃSTWA
   Kontrolowane testy (tylko na sandboxie, nigdy na produkcji)
        │
        ▼
6. RAPORT + SYNC DO SENTINEL
   Wyniki zsynchronizowane z Twoim kontem
```

---

## Obsługiwane środowiska uruchomieniowe

| Stos | Komponenty Docker | Wersje |
|------|-------------------|--------|
| **WordPress** | PHP + Apache + MySQL 8.0 + phpMyAdmin | PHP 7.4–8.3 |
| **WordPress + WooCommerce** | PHP + Apache + MySQL 8.0 + phpMyAdmin | PHP 7.4–8.3 |
| **Next.js** | Node.js Alpine + Dockerfile | Node 18/20/22 |
| **Nuxt.js** | Node.js Alpine + Dockerfile | Node 18/20/22 |
| **Laravel** | PHP + Apache + MySQL 8.0 + Redis + phpMyAdmin | PHP 8.0–8.3 |
| **Symfony** | PHP + Apache + PostgreSQL 15 | PHP 8.0–8.3 |
| **Django** | Python slim + PostgreSQL 15 | Python 3.9–3.12 |
| **Ruby on Rails** | Ruby 3.2 slim + PostgreSQL 15 | Ruby 3.x |
| **Drupal** | PHP + Apache + MySQL 8.0 + phpMyAdmin | PHP 8.0–8.3 |
| **Magento 2** | PHP + MySQL 8.0 + Elasticsearch 7 + Redis | PHP 8.1–8.2 |
| **Gatsby / Astro / Node** | Node.js Alpine | Node 18/20/22 |
| **PHP Generic** | PHP + Apache + MySQL 8.0 + phpMyAdmin | PHP 7.4–8.3 |
| **Static Site** | nginx:alpine | — |

---

## Tryby skanowania bezpieczeństwa

| Tryb | Typ | Co sprawdza |
|------|-----|-------------|
| **Passive** | Pasywny | Nagłówki HTTP, cookies, pliki wrażliwe (.env, .git, backup), informacje o serwerze |
| **Headers Only** | Pasywny | Audyt nagłówków bezpieczeństwa (CSP, HSTS, X-Frame-Options, itp.) |
| **CSRF Check** | Pasywny | Walidacja tokenów CSRF w formularzach |
| **XSS** | Aktywny | Testy wstrzykiwania Cross-Site Scripting w parametrach URL |
| **SQL Injection** | Aktywny | Testy wstrzykiwania SQL w parametrach URL |
| **Open Redirect** | Aktywny | Testy nadużycia parametrów przekierowania URL |
| **Full Scan** | Aktywny | Wszystkie powyższe łącznie |

> **Ważne:** Aktywne skany (XSS, SQLi, Open Redirect, Full) są uruchamiane **wyłącznie** przeciwko środowisku sandbox — nigdy przeciwko Twojej stronie produkcyjnej.

---

## Poziomy ważności podatności

| Poziom | Kolor | Opis |
|--------|-------|------|
| **Critical** | Czerwony | Natychmiastowe ryzyko przejęcia systemu (RCE, SQL Injection z danymi) |
| **High** | Pomarańczowy | Poważne podatności (XSS stored, CSRF, open redirect) |
| **Medium** | Żółty | Podatności wymagające uwagi (brakujące nagłówki bezpieczeństwa, weak cookies) |
| **Low** | Niebieski | Drobne problemy konfiguracyjne |
| **Info** | Szary | Informacje o technologiach, konfiguracji |

---

## Tryby wdrożenia

### 1. Download ZIP (zalecany dla pełnej wierności)
- Pobierasz paczkę ZIP zawierającą: `docker-compose.yml`, `Dockerfile`, pliki strony, `README.md`, `sentinel-config.json`
- Uruchamiasz lokalnie: `docker-compose up -d`
- Masz **pełny stos runtime** (PHP + MySQL, Node, Python + Postgres, itd.)
- Możesz używać dowolnych narzędzi (OWASP ZAP, Burp Suite, Nikto, Nuclei)
- Wyniki skanów synchronizują się automatycznie z Twoim kontem Sentinel

### 2. Manus Spaces (szybki podgląd)
- Sandbox hostowany tymczasowo w bezpiecznym środowisku chmurowym
- Dostępny przez URL bez instalacji
- Idealny do szybkiego sprawdzenia

---

## Struktura plików ZIP (przykład WordPress)

```
sentinel-sandbox-42.zip
├── docker-compose.yml          # WordPress + MySQL + phpMyAdmin
├── README.md                   # Instrukcje uruchomienia + komendy testowe
├── sentinel-config.json        # Konfiguracja sync z kontem Sentinel
├── sentinel-wp-config.php      # Dodatkowa konfiguracja WordPress (sandbox mode)
├── sql-import/
│   └── README.md               # Instrukcja importu bazy danych
└── wp-content/                 # Sklonowane pliki strony (zanonimizowane)
```

---

## Jak uruchomić lokalnie (po pobraniu ZIP)

```bash
# 1. Rozpakuj ZIP
unzip sentinel-sandbox-42.zip -d my-sandbox

# 2. (Opcjonalnie) Zaimportuj bazę danych
# Skopiuj dump.sql do sql-import/
cp /path/to/your/dump.sql my-sandbox/sql-import/dump.sql

# 3. Uruchom środowisko
cd my-sandbox
docker-compose up -d

# 4. Otwórz w przeglądarce
# WordPress: http://localhost:8080
# phpMyAdmin: http://localhost:8081

# 5. Uruchom testy bezpieczeństwa
docker run -t owasp/zap2docker-stable zap-baseline.py -t http://host.docker.internal:8080
```

---

## Schemat bazy danych

### `sandbox_environments`
Główna tabela środowisk sandbox.

| Kolumna | Typ | Opis |
|---------|-----|------|
| `id` | INT PK | Auto-increment |
| `name` | VARCHAR(128) | Nazwa sandbox |
| `target_url` | VARCHAR(512) | URL oryginalnej strony |
| `status` | ENUM | cloning / ready / scanning / completed / error |
| `sandbox_url` | VARCHAR(512) | URL środowiska (Manus Spaces) |
| `deploy_type` | ENUM | manus_spaces / local_download |
| `anonymized` | BOOLEAN | Czy PII zostało zanonimizowane |
| `clone_progress` | INT | Postęp klonowania 0–100 |
| `file_count` | INT | Liczba sklonowanych plików |
| `notes` | TEXT | Notatki o statusie |
| `created_by` | INT | ID użytkownika |

### `sandbox_scans`
Skany bezpieczeństwa powiązane z sandboxem.

| Kolumna | Typ | Opis |
|---------|-----|------|
| `id` | INT PK | Auto-increment |
| `sandbox_id` | INT FK | Powiązany sandbox |
| `scan_type` | ENUM | passive / xss / sqli / headers / csrf / open_redirect / full |
| `status` | ENUM | pending / running / completed / failed |
| `summary` | JSON | `{critical, high, medium, low, info, total}` |

### `sandbox_findings`
Indywidualne podatności wykryte podczas skanowania.

| Kolumna | Typ | Opis |
|---------|-----|------|
| `id` | INT PK | Auto-increment |
| `scan_id` | INT FK | Powiązany skan |
| `sandbox_id` | INT FK | Powiązany sandbox |
| `severity` | ENUM | critical / high / medium / low / info |
| `category` | VARCHAR(64) | Kategoria (XSS, SQLi, Headers, itp.) |
| `title` | VARCHAR(255) | Tytuł podatności |
| `description` | TEXT | Szczegółowy opis |
| `evidence` | TEXT | Dowód (request/response) |
| `affected_url` | VARCHAR(512) | Dotknięty URL |
| `remediation` | TEXT | Zalecenia naprawcze |
| `cvss_score` | VARCHAR(8) | Wynik CVSS (opcjonalny) |

---

## Pliki modułu

```
server/sandbox/
├── tech-detector.ts      # Detekcja stosu technologicznego
├── env-generator.ts      # Generator docker-compose.yml per stos
├── cloner.ts             # Klonowanie wget + anonimizacja PII
├── scanner.ts            # Silnik skanowania bezpieczeństwa
├── lifecycle.ts          # Port allocation, TTL management, teardown
├── nvdLookup.ts          # NVD CVE lookup z cache 24h i rate limiterem
├── sandboxRouter.ts      # tRPC router (API endpoints)
├── lifecycle.test.ts     # 85 testów: port allocation, TTL, teardown, concurrent
├── nvdLookup.test.ts     # 49 testów: cache, rate limiter, CSV escape, severity
└── cloner.test.ts        # 42 testy: klonowanie, anonimizacja PII

client/src/pages/
├── SandboxList.tsx        # Lista sandboxów + checkbox bulk select + toolbar
├── SandboxNew.tsx         # Formularz tworzenia + detekcja technologii
└── SandboxDetail.tsx      # Szczegóły + wyniki + historia + Export CSV

drizzle/
├── schema.ts              # Tabele: sandboxEnvironments, sandboxScans, sandboxFindings
└── 0003_security_sandbox.sql  # Migracja SQL
```

---

## Bezpieczeństwo i izolacja

- Wszystkie aktywne testy (XSS, SQLi) są uruchamiane **wyłącznie** na lokalnym sandboxie lub Manus Spaces
- Dane wrażliwe (PII) są anonimizowane **przed** jakimkolwiek testem
- Sandbox jest izolowany od produkcji — nie ma połączenia z oryginalną bazą danych
- Pliki sandbox są przechowywane w `/tmp/sandboxes/` i usuwane po żądaniu
- Każdy sandbox jest powiązany z kontem użytkownika — brak dostępu między kontami

---

## Nowe funkcjonalności (2026-03-06)

### Export CSV findings
- Endpoint: `sandbox.exportFindings` (tRPC query)
- Parametry: `sandboxId`, `severity` (filtr: all/critical/high/medium/low/info), `scanId` (opcjonalny)
- Zwraca CSV z 10 kolumnami: ID, Severity, Category, Title, Description, Evidence, Affected URL, Remediation, CVSS Score, Created At
- Filename: `sentinel-findings-{sandbox-name}-{YYYY-MM-DD}.csv`
- UI: przycisk **Export CSV** w sekcji findings (respektuje aktywny filtr severity)

### Bulk Delete sandboxów
- Endpoint: `sandbox.bulkDelete` (tRPC mutation)
- Parametry: `ids: number[]` (max 20 sandboxów)
- Wykonuje: teardown Docker + delete files + delete DB records (findings, scans, sandbox)
- Zwraca: `{ results: [{id, success, error?}], succeeded, failed }`
- UI: checkbox na każdej karcie sandboxa + sticky toolbar z licznikiem + AlertDialog potwierdzającym

### Pokrycie testami (276 testów, 100% pass rate)

| Plik testów | Testy | Zakres |
|---|---|---|
| `lifecycle.test.ts` | 85 | Port allocation, TTL, teardown, concurrent access |
| `nvdLookup.test.ts` | 49 | Cache, rate limiter, CSV escape, severity mapping |
| `cloner.test.ts` | 42 | Klonowanie, anonimizacja PII, tech detection |
| Pozostałe | 100 | Router, auth, scanner, DB |
| **Łącznie** | **276** | **100% pass rate** |

---

*Zaktualizowano: 2026-03-06 | AI Control Center — Security Sandbox Module*
