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

export async function seedAgents() {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");

  // Only seed if table is empty
  const existing = await db.select().from(agents).limit(1);
  if (existing.length > 0) return 0;

  const items = [
    { name: "Manus Deployer", role: "autonomous-deployer", description: "Deploys and monitors applications on Coolify via API", model: "claude-3-5-sonnet", status: "active" as const },
    { name: "Sentinel Monitor", role: "monitor", description: "Monitors infrastructure health and security events", model: "gpt-4o-mini", status: "active" as const },
    { name: "Migration Bot", role: "db-admin", description: "Runs database migrations and schema updates", model: "gpt-4o-mini", status: "idle" as const },
    { name: "Code Reviewer", role: "code-review", description: "Reviews PRs and suggests improvements", model: "claude-3-5-sonnet", status: "idle" as const },
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

// ─── Secrets ─────────────────────────────────────────────────────────────────

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
