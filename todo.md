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

## Multi-Agent Orchestration Hub (Phase 2)
- [ ] DB schema: extend agents table with google_drive_folder, mcp_endpoint, last_seen fields
- [ ] DB schema: tasks table (title, description, assigned_agent_id, status, priority, result_drive_url, due_date)
- [ ] DB schema: task_logs table (task_id, message, timestamp, author_agent)
- [ ] tRPC: tasks CRUD (list, create, assign, update status, add log, get by agent)
- [ ] tRPC: Google Drive integration (list files in task folder, get shareable link)
- [ ] tRPC: agent heartbeat endpoint (agents report online status via HTTP POST)
- [ ] Frontend: /tasks page - kanban board (todo/in-progress/review/done)
- [ ] Frontend: /tasks/:id page - szczegóły, logi, wyniki z Drive, timeline
- [ ] Frontend: task creation modal (tytuł, opis, agent, priorytet, deadline)
- [ ] Frontend: /agents page - rozbuduj o MCP endpoint, Drive folder, last seen
- [ ] Google Drive: auto-create folder structure /ofshore-agents/{agent-name}/tasks/
- [ ] MCP bridge: HTTP endpoint /api/agent/heartbeat i /api/agent/task-update dla agentów
- [ ] Seed: domyślni agenci (Manus AI, n8n-worker, sentinel-monitor)
- [ ] Notifications: powiadomienie gdy agent kończy zadanie

## AI School for Agents (Google Drive Knowledge Base)
- [ ] Create /ofshore-agents/ folder structure on Google Drive
- [ ] Upload skills/ folder (SKILL.md files from Manus)
- [ ] Create playbooks/ folder with autodeploy and QA guides
- [ ] Create context/ folder with ofshore.dev architecture notes
- [ ] Create agent-onboarding.md - how to work in ofshore.dev ecosystem
- [ ] Frontend: /knowledge page in AI Control Center - browse Drive files
- [ ] Frontend: link to Drive school from agent detail page

## AI Providers Integration (Claude, Gemini, OpenAI)
- [ ] Check Google Drive / previous session notes for original AI providers design
- [ ] Add AI providers section to Secrets vault (OPENAI_API_KEY, ANTHROPIC_API_KEY, GEMINI_API_KEY)
- [ ] Add agents seed: Claude (Anthropic), Gemini (Google), GPT-4 (OpenAI) as built-in agents
- [ ] Frontend: /agents page - show AI provider agents with model info, API key status (set/not set)
- [ ] Frontend: AI provider card - test connection button (calls API to verify key works)
- [ ] tRPC: testProviderConnection mutation (calls provider API with stored key, returns latency/model list)
- [ ] tRPC: updateAgentApiKey mutation (stores encrypted key in secrets table, links to agent)
- [ ] Secrets vault: special "AI Providers" section with masked key display
