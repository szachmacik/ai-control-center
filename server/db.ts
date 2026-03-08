import { eq, desc, like } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  InsertUser, users,
  agents, tasks, taskLogs, driveFiles, infrastructure, secrets, agentLogs, projects,
  type Agent, type AgentLog, type TaskLog,
} from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && ENV.databaseUrl) {
    try {
      // TiDB Cloud (Coolify) requires SSL — ensure ssl=true in URL
      let dbUrl = ENV.databaseUrl;
      if (dbUrl && !dbUrl.includes('ssl=') && !dbUrl.includes('tls=')) {
        dbUrl += (dbUrl.includes('?') ? '&' : '?') + 'ssl={"rejectUnauthorized":false}';
      }
      _db = drizzle(dbUrl);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

// ─── Agents ──────────────────────────────────────────────────────────────────

export async function listAgents() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(agents).orderBy(desc(agents.updatedAt));
}

export async function updateAgentStatus(id: number, status: Agent["status"]) {
  const db = await getDb();
  if (!db) return;
  await db.update(agents).set({ status, lastActive: new Date() }).where(eq(agents.id, id));
}
export async function getAgentById(id: number) {
  const db = await getDb();
  if (!db) return null;
  const [agent] = await db.select().from(agents).where(eq(agents.id, id)).limit(1);
  return agent ?? null;
}
export async function getAgentTasks(agentId: number, limit = 20) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(tasks).where(eq(tasks.agentId, agentId)).orderBy(desc(tasks.createdAt)).limit(limit);
}
export async function incrementAgentTasksCompleted(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.execute(
    `UPDATE agents SET tasks_completed = tasks_completed + 1, last_active = NOW(), updatedAt = NOW() WHERE id = ${id}`
  );
}

export async function seedAgents() {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");

  // Only seed if table is empty
  const existing = await db.select().from(agents).limit(1);
  if (existing.length > 0) return 0;

  const items = [
    { name: "Manus Deployer", role: "autonomous-deployer", description: "Deploys and monitors applications on Coolify via API", model: "claude-3-5-sonnet", status: "active" as const, agentType: "manus" as const },
    { name: "Sentinel Monitor", role: "monitor", description: "Monitors infrastructure health and security events", model: "gpt-4o-mini", status: "active" as const, agentType: "manus" as const },
    { name: "Migration Bot", role: "db-admin", description: "Runs database migrations and schema updates", model: "gpt-4o-mini", status: "idle" as const, agentType: "manus" as const },
    { name: "Code Reviewer", role: "code-review", description: "Reviews PRs and suggests improvements", model: "claude-3-5-sonnet", status: "idle" as const, agentType: "manus" as const },
    { name: "Claude (Anthropic)", role: "assistant", description: "Claude 3.5 Sonnet — general-purpose AI assistant by Anthropic", model: "claude-3-5-sonnet", status: "idle" as const, agentType: "custom" as const },
    { name: "Gemini (Google)", role: "assistant", description: "Gemini 2.0 Flash — multimodal AI assistant by Google DeepMind", model: "gemini-2.0-flash", status: "idle" as const, agentType: "custom" as const },
    { name: "GPT-4 (OpenAI)", role: "assistant", description: "GPT-4o — advanced reasoning AI assistant by OpenAI", model: "gpt-4o", status: "idle" as const, agentType: "custom" as const },
  ];

  for (const item of items) {
    await db.insert(agents).values({
      name: item.name,
      role: item.role,
      description: item.description,
      model: item.model,
      status: item.status,
      lastActive: new Date(),
    });
  }
  return items.length;
}

export async function createAgent(data: {
  name: string;
  role?: string;
  description?: string;
  model?: string;
  status?: Agent["status"];
  agentType?: "manus" | "n8n" | "autogpt" | "crewai" | "custom";
  mcpEndpoint?: string;
  driveFolderId?: string;
  driveFolderUrl?: string;
  apiKey?: string;
  config?: Record<string, unknown>;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const [result] = await db.insert(agents).values({
    name: data.name,
    role: data.role ?? null,
    description: data.description ?? null,
    model: data.model ?? null,
    status: data.status ?? "idle",
    agentType: data.agentType ?? "custom",
    mcpEndpoint: data.mcpEndpoint ?? null,
    driveFolderId: data.driveFolderId ?? null,
    driveFolderUrl: data.driveFolderUrl ?? null,
    apiKey: data.apiKey ?? null,
    config: data.config ?? null,
    lastActive: new Date(),
  });
  return result;
}

export async function updateAgent(id: number, data: {
  name?: string;
  role?: string;
  description?: string;
  model?: string;
  status?: Agent["status"];
  agentType?: "manus" | "n8n" | "autogpt" | "crewai" | "custom";
  mcpEndpoint?: string;
  driveFolderId?: string;
  driveFolderUrl?: string;
  config?: Record<string, unknown>;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  await db.update(agents).set({
    ...(data.name !== undefined && { name: data.name }),
    ...(data.role !== undefined && { role: data.role }),
    ...(data.description !== undefined && { description: data.description }),
    ...(data.model !== undefined && { model: data.model }),
    ...(data.status !== undefined && { status: data.status }),
    ...(data.agentType !== undefined && { agentType: data.agentType }),
    ...(data.mcpEndpoint !== undefined && { mcpEndpoint: data.mcpEndpoint }),
    ...(data.driveFolderId !== undefined && { driveFolderId: data.driveFolderId }),
    ...(data.driveFolderUrl !== undefined && { driveFolderUrl: data.driveFolderUrl }),
    ...(data.config !== undefined && { config: data.config }),
  }).where(eq(agents.id, id));
}

export async function deleteAgent(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  await db.delete(agents).where(eq(agents.id, id));
}

// ─── Tasks ───────────────────────────────────────────────────────────────────

export async function listTasks() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(tasks).orderBy(desc(tasks.createdAt));
}

export async function createTask(data: {
  title: string;
  description?: string;
  assignedTo?: string;
  agentId?: number;
  priority?: "low" | "medium" | "high" | "urgent";
  dueDate?: Date;
  tags?: string[];
  createdBy?: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  await db.insert(tasks).values({
    title: data.title,
    description: data.description ?? null,
    assignedTo: data.assignedTo ?? null,
    agentId: data.agentId ?? null,
    priority: data.priority ?? "medium",
    dueDate: data.dueDate ?? null,
    tags: data.tags ?? null,
    createdBy: data.createdBy ?? null,
  });
}

// ─── Infrastructure ───────────────────────────────────────────────────────────

export async function listInfrastructure() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(infrastructure).orderBy(desc(infrastructure.updatedAt));
}

export async function seedInfrastructure() {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");

  const items = [
    { name: "Ollama", type: "service" as const, url: "http://ollama.ofshore.dev", status: "healthy" as const, metadata: { description: "Local LLM inference server", model: "llama3.2", auth: "none" } },
    { name: "Open WebUI", type: "service" as const, url: "https://chat.ofshore.dev", status: "healthy" as const, metadata: { description: "Web interface for Ollama", auth: "builtin" } },
    { name: "Kortix / Suna AI", type: "service" as const, url: "https://suna.ofshore.dev", status: "healthy" as const, metadata: { description: "Autonomous AI agent platform", auth: "builtin" } },
    { name: "OpenCraw", type: "service" as const, url: "https://opencraw.ofshore.dev", status: "healthy" as const, metadata: { description: "Web crawling and scraping service", auth: "none" } },
    { name: "Sentinel Dashboard", type: "service" as const, url: "https://sentinel.ofshore.dev", status: "healthy" as const, metadata: { description: "Infrastructure monitoring & SIEM", auth: "supabase-otp", ssoEnabled: true } },
    { name: "Polaris Track", type: "service" as const, url: "https://polaris-track.ofshore.dev", status: "healthy" as const, metadata: { description: "Project tracking and management", auth: "supabase-otp", ssoEnabled: true } },
    { name: "Coolify", type: "server" as const, url: "https://coolify.ofshore.dev", status: "healthy" as const, metadata: { description: "Self-hosted PaaS on DigitalOcean", version: "4.x", auth: "builtin" } },
    // SEC-008 FIX: Removed hardcoded Supabase project ID — use env variable instead
    { name: "Supabase", type: "database" as const, url: process.env.SUPABASE_DASHBOARD_URL || "https://supabase.com/dashboard", status: "healthy" as const, metadata: { description: "PostgreSQL + Auth + Storage", auth: "builtin" } },
    { name: "Cloudflare", type: "service" as const, url: "https://dash.cloudflare.com", status: "healthy" as const, metadata: { description: "DNS & CDN for ofshore.dev", zone: "ofshore.dev", auth: "builtin" } },
    { name: "DigitalOcean", type: "server" as const, url: "https://cloud.digitalocean.com", status: "healthy" as const, metadata: { description: "VPS hosting Coolify", ip: "178.62.246.169", auth: "builtin" } },
  ];

  // Delete existing and re-insert
  await db.delete(infrastructure);
  for (const item of items) {
    await db.insert(infrastructure).values({
      name: item.name,
      type: item.type,
      url: item.url,
      status: item.status,
      metadata: item.metadata,
      lastChecked: new Date(),
    });
  }
  return items.length;
}
export async function checkInfrastructureHealth(): Promise<{ id: number; name: string; url: string | null; status: "healthy" | "degraded" | "offline" | "unknown"; latencyMs: number | null }[]> {
  const db = await getDb();
  if (!db) return [];
  const items = await db.select().from(infrastructure);
  const results: { id: number; name: string; url: string | null; status: "healthy" | "degraded" | "offline" | "unknown"; latencyMs: number | null }[] = [];

  for (const item of items) {
    if (!item.url) {
      results.push({ id: item.id, name: item.name, url: null, status: "unknown", latencyMs: null });
      continue;
    }
    // Skip external services (Cloudflare, DigitalOcean, Supabase) — they don't have a /health endpoint we can reach
    const isExternal = item.url.includes("cloudflare.com") || item.url.includes("digitalocean.com") || item.url.includes("supabase.com");
    if (isExternal) {
      results.push({ id: item.id, name: item.name, url: item.url, status: "healthy", latencyMs: null });
      continue;
    }
    const start = Date.now();
    let newStatus: "healthy" | "degraded" | "offline" | "unknown" = "unknown";
    let latencyMs: number | null = null;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const res = await fetch(item.url, { method: "HEAD", signal: controller.signal, redirect: "follow" });
      clearTimeout(timeout);
      latencyMs = Date.now() - start;
      if (res.ok || res.status < 400) {
        newStatus = latencyMs > 3000 ? "degraded" : "healthy";
      } else if (res.status < 500) {
        // 4xx — service is up but auth required, counts as healthy
        newStatus = "healthy";
      } else {
        newStatus = "degraded";
      }
    } catch {
      latencyMs = Date.now() - start;
      newStatus = "offline";
    }
    // Update DB
    await db.update(infrastructure).set({ status: newStatus, lastChecked: new Date() }).where(eq(infrastructure.id, item.id));
    results.push({ id: item.id, name: item.name, url: item.url, status: newStatus, latencyMs });
  }
  return results;
}

// ─── Secrets ───────────────────────────────────────────────────────────────────
export async function listSecrets() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(secrets).orderBy(desc(secrets.createdAt));
}

export async function createSecret(data: { name: string; value: string; description?: string; createdBy?: number }) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  await db.insert(secrets).values({
    name: data.name,
    value: data.value,
    description: data.description ?? null,
    createdBy: data.createdBy ?? null,
  });
}

export async function deleteSecret(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  await db.delete(secrets).where(eq(secrets.id, id));
}

// ─── Logs ─────────────────────────────────────────────────────────────────────

export async function listLogs(search?: string) {
  const db = await getDb();
  if (!db) return [];
  if (search) {
    return db.select().from(agentLogs)
      .where(like(agentLogs.message, `%${search}%`))
      .orderBy(desc(agentLogs.createdAt))
      .limit(200);
  }
  return db.select().from(agentLogs).orderBy(desc(agentLogs.createdAt)).limit(200);
}

export async function createLog(data: {
  agentId?: number;
  agentName?: string;
  taskId?: number;
  eventType?: AgentLog["eventType"];
  message: string;
  details?: unknown;
}) {
  const db = await getDb();
  if (!db) return;
  await db.insert(agentLogs).values({
    agentId: data.agentId ?? null,
    agentName: data.agentName ?? null,
    taskId: data.taskId ?? null,
    eventType: data.eventType ?? "info",
    message: data.message,
    details: data.details ?? null,
  });
}

// ─── Projects ─────────────────────────────────────────────────────────────────

export async function listProjects() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(projects).orderBy(desc(projects.createdAt));
}

export async function createProject(data: {
  name: string;
  description?: string;
  template: string;
  subdomain?: string;
  repo?: string;
  createdBy?: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  await db.insert(projects).values({
    name: data.name,
    description: data.description ?? null,
    template: data.template,
    subdomain: data.subdomain ?? null,
    repo: data.repo ?? null,
    createdBy: data.createdBy ?? null,
    status: "pending",
  });
}

// ─── Dashboard stats ──────────────────────────────────────────────────────────

export async function getDashboardStats() {
  const db = await getDb();
  if (!db) return {
    activeAgents: 0, runningTasks: 0, healthyServices: 0, totalServices: 0,
    eventsToday: 0, agents: [], recentLogs: [], infrastructure: [],
  };

  const [allAgents, allTasks, allInfra, recentLogs] = await Promise.all([
    db.select().from(agents).orderBy(desc(agents.updatedAt)).limit(10),
    db.select().from(tasks).orderBy(desc(tasks.createdAt)).limit(50),
    db.select().from(infrastructure).orderBy(desc(infrastructure.updatedAt)),
    db.select().from(agentLogs).orderBy(desc(agentLogs.createdAt)).limit(20),
  ]);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayLogs = recentLogs.filter((l) => new Date(l.createdAt) >= today);

  return {
    activeAgents: allAgents.filter((a) => a.status === "active").length,
    runningTasks: allTasks.filter((t) => t.status === "running").length,
    healthyServices: allInfra.filter((i) => i.status === "healthy").length,
    totalServices: allInfra.length,
    eventsToday: todayLogs.length,
    agents: allAgents,
    recentLogs: recentLogs.slice(0, 8),
    infrastructure: allInfra,
  };
}

// ─── Task status & logs (Multi-Agent Hub) ─────────────────────────────────────

export async function updateTaskStatus(data: {
  id: number;
  status: "pending" | "running" | "completed" | "failed" | "cancelled";
  result?: string;
  resultDriveUrl?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  await db.update(tasks)
    .set({
      status: data.status,
      result: data.result ?? undefined,
      resultDriveUrl: data.resultDriveUrl ?? undefined,
      startedAt: data.status === "running" ? new Date() : undefined,
      completedAt: (data.status === "completed" || data.status === "failed") ? new Date() : undefined,
    })
    .where(eq(tasks.id, data.id));
}

export async function addTaskLog(data: {
  taskId: number;
  message: string;
  level?: TaskLog["level"];
  agentId?: number;
  agentName?: string;
  details?: unknown;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  await db.insert(taskLogs).values({
    taskId: data.taskId,
    agentId: data.agentId ?? null,
    agentName: data.agentName ?? null,
    level: data.level ?? "info",
    message: data.message,
    details: data.details ?? null,
  });
}

export async function getTaskLogs(taskId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(taskLogs)
    .where(eq(taskLogs.taskId, taskId))
    .orderBy(desc(taskLogs.createdAt))
    .limit(100);
}

export async function addDriveFile(data: {
  taskId?: number;
  agentId?: number;
  fileName: string;
  driveFileId: string;
  driveUrl: string;
  mimeType?: string;
  fileSize?: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  await db.insert(driveFiles).values({
    taskId: data.taskId ?? null,
    agentId: data.agentId ?? null,
    fileName: data.fileName,
    driveFileId: data.driveFileId,
    driveUrl: data.driveUrl,
    mimeType: data.mimeType ?? null,
    fileSize: data.fileSize ?? null,
  });
}

export async function getDriveFiles(taskId?: number, agentId?: number) {
  const db = await getDb();
  if (!db) return [];
  if (taskId) {
    return db.select().from(driveFiles).where(eq(driveFiles.taskId, taskId)).orderBy(desc(driveFiles.uploadedAt));
  }
  if (agentId) {
    return db.select().from(driveFiles).where(eq(driveFiles.agentId, agentId)).orderBy(desc(driveFiles.uploadedAt));
  }
  return db.select().from(driveFiles).orderBy(desc(driveFiles.uploadedAt)).limit(50);
}

// ─── Task getById ─────────────────────────────────────────────────────────────

export async function getTaskById(id: number) {
  const db = await getDb();
  if (!db) return null;
  const [task] = await db.select().from(tasks).where(eq(tasks.id, id)).limit(1);
  return task ?? null;
}

// ─── Knowledge Files ──────────────────────────────────────────────────────────

import { knowledgeFiles, type KnowledgeFile, type InsertKnowledgeFile } from "../drizzle/schema";

export async function listKnowledgeFiles(userId: number, search?: string) {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select()
    .from(knowledgeFiles)
    .where(eq(knowledgeFiles.userId, userId))
    .orderBy(desc(knowledgeFiles.createdAt));
  if (!search) return rows;
  const q = search.toLowerCase();
  return rows.filter(
    (r) =>
      r.title.toLowerCase().includes(q) ||
      (r.description ?? "").toLowerCase().includes(q) ||
      r.category.toLowerCase().includes(q)
  );
}

export async function createKnowledgeFile(data: Omit<InsertKnowledgeFile, "id" | "createdAt" | "updatedAt">) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const [result] = await db.insert(knowledgeFiles).values({
    ...data,
    viewCount: 0,
    isStarred: data.isStarred ?? false,
  });
  return { id: (result as any).insertId as number };
}

export async function deleteKnowledgeFile(id: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const [file] = await db.select().from(knowledgeFiles).where(eq(knowledgeFiles.id, id)).limit(1);
  if (!file || file.userId !== userId) throw new Error("File not found or access denied");
  await db.delete(knowledgeFiles).where(eq(knowledgeFiles.id, id));
  return { storageKey: file.storageKey };
}

export async function toggleKnowledgeStar(id: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const [file] = await db.select().from(knowledgeFiles).where(eq(knowledgeFiles.id, id)).limit(1);
  if (!file || file.userId !== userId) throw new Error("File not found or access denied");
  await db.update(knowledgeFiles).set({ isStarred: !file.isStarred }).where(eq(knowledgeFiles.id, id));
  return { isStarred: !file.isStarred };
}

export async function incrementKnowledgeViewCount(id: number) {
  const db = await getDb();
  if (!db) return;
  const [file] = await db.select({ viewCount: knowledgeFiles.viewCount }).from(knowledgeFiles).where(eq(knowledgeFiles.id, id)).limit(1);
  if (!file) return;
  await db.update(knowledgeFiles).set({ viewCount: (file.viewCount ?? 0) + 1 }).where(eq(knowledgeFiles.id, id));
}
// ─── Audit Schedule (persisted in secrets table as AUDIT_SCHEDULE) ───────────
const SCHEDULE_SECRET_NAME = "AUDIT_SCHEDULE";

export interface AuditScheduleSettings {
  uptimeEnabled: boolean;
  uptimeCron: string;
  securityEnabled: boolean;
  securityCron: string;
  functionalEnabled: boolean;
  functionalCron: string;
  dependencyEnabled: boolean;
  dependencyCron: string;
  dbHealthEnabled: boolean;
  dbHealthCron: string;
}

const DEFAULT_SCHEDULE: AuditScheduleSettings = {
  uptimeEnabled: true,
  uptimeCron: "0 0 8 * * *",
  securityEnabled: true,
  securityCron: "0 0 2 * * 1",
  functionalEnabled: true,
  functionalCron: "0 0 3 * * 1",
  dependencyEnabled: true,
  dependencyCron: "0 0 4 * * 1",
  dbHealthEnabled: true,
  dbHealthCron: "0 0 5 1 * *",
};

export async function getAuditSchedule(): Promise<AuditScheduleSettings> {
  const db = await getDb();
  if (!db) return DEFAULT_SCHEDULE;
  const rows = await db
    .select()
    .from(secrets)
    .where(eq(secrets.name, SCHEDULE_SECRET_NAME))
    .limit(1);
  if (rows.length === 0) return DEFAULT_SCHEDULE;
  try {
    return JSON.parse(rows[0].value) as AuditScheduleSettings;
  } catch {
    return DEFAULT_SCHEDULE;
  }
}

export async function saveAuditSchedule(settings: AuditScheduleSettings): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const json = JSON.stringify(settings);
  const existing = await db.select().from(secrets).where(eq(secrets.name, SCHEDULE_SECRET_NAME)).limit(1);
  if (existing.length > 0) {
    await db.update(secrets).set({ value: json }).where(eq(secrets.name, SCHEDULE_SECRET_NAME));
  } else {
    await db.insert(secrets).values({ name: SCHEDULE_SECRET_NAME, value: json, description: "Audit schedule configuration" });
  }
}
