# AI Control Center - TODO

## Auth & Setup
- [x] Supabase magic link auth (polaris-track pattern)
- [x] Role-based access control (admin/user)
- [x] Admin auto-assign for owner email

## Database Schema
- [x] Extend schema with agents, tasks, infrastructure, secrets, agent_logs tables
- [x] Push migrations

## Pages & Features
- [x] Login page with magic link
- [x] AuthCallback page
- [x] Dashboard overview (agents, tasks, infra stats)
- [x] Agents management (list, details, start/stop)
- [x] Tasks management (create, assign, track)
- [x] Infrastructure monitoring (servers, DBs, services)
- [x] Secrets vault (view, add, edit, delete)
- [x] Activity logs (filter by agent, event type)
- [x] Project creation workflow (scaffold + deploy via Manus)

## Design
- [x] Dark elegant design system (index.css)
- [x] DashboardLayout with sidebar navigation
- [x] Responsive layout

## Backend
- [x] tRPC routers for all features (agents, tasks, infra, secrets, logs, projects, dashboard)
- [x] Vitest tests (17 tests passing)

## Deployment
- [ ] GitHub repo creation
- [ ] Coolify deployment on ai-control-center.ofshore.dev
- [x] Supabase env vars configured

## Fixes & Enhancements (Mar 3)
- [ ] Fix Settings 404 - create Settings page and add route
- [ ] Seed infrastructure table with real services (Ollama, Kortix/Suna, OpenCraw, Open WebUI, Sentinel, Polaris)
- [ ] Add real-time health check for infrastructure services
- [ ] Fix DATABASE_URL pointing to wrong container (done)
- [x] Fix post-deployment command (pnpm db:push → node dist/migrate.js)
- [ ] Add seed endpoint (admin-only tRPC mutation) to populate infrastructure table
- [ ] Add SSO/launch panel in Infrastructure page - open services without re-login
- [ ] Generate signed launch tokens for services that require auth (Sentinel, Polaris)
- [ ] Add "Launch" button on each infrastructure card that opens service in new tab with auto-auth token
- [ ] Explore Automation Hub - understand what's there
- [ ] Integrate Automation Hub workflows into AI Control Center
- [ ] Update autonomous-deployment-knowledge-base.md with autodeploy lessons
