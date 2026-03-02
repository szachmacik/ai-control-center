import { eq, desc, like } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  InsertUser, users,
  agents, tasks, infrastructure, secrets, agentLogs, projects,
  type Agent, type AgentLog,
} from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
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
  priority?: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  await db.insert(tasks).values({
    title: data.title,
    description: data.description ?? null,
    assignedTo: data.assignedTo ?? null,
    priority: data.priority ?? 5,
  });
}

// ─── Infrastructure ───────────────────────────────────────────────────────────

export async function listInfrastructure() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(infrastructure).orderBy(desc(infrastructure.updatedAt));
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
