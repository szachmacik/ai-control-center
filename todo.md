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
