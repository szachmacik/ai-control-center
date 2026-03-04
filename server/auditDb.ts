/**
 * Audit Module — Database Operations
 * Handles all CRUD for audit_projects, audit_runs, audit_findings, uptime_checks
 */
import { eq, desc, and, gte } from "drizzle-orm";
import { getDb } from "./db"; // re-uses the same lazy DB singleton
import {
  auditProjects, auditRuns, auditFindings, uptimeChecks,
  type InsertAuditProject, type InsertAuditRun, type InsertAuditFinding, type InsertUptimeCheck,
  type AuditProject, type AuditRun, type AuditFinding, type UptimeCheck,
} from "../drizzle/schema";

// ─── Audit Projects ───────────────────────────────────────────────────────────

export async function listAuditProjects(): Promise<AuditProject[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(auditProjects).orderBy(auditProjects.name);
}

export async function createAuditProject(data: InsertAuditProject): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(auditProjects).values(data);
  return (result as any).insertId ?? 0;
}

export async function updateAuditProject(id: number, data: Partial<InsertAuditProject>): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(auditProjects).set(data).where(eq(auditProjects.id, id));
}

export async function deleteAuditProject(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(auditProjects).where(eq(auditProjects.id, id));
}

// ─── Audit Runs ───────────────────────────────────────────────────────────────

export async function createAuditRun(data: InsertAuditRun): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(auditRuns).values(data);
  return (result as any).insertId ?? 0;
}

export async function completeAuditRun(
  id: number,
  updates: {
    status: "completed" | "failed";
    severity: "none" | "low" | "medium" | "high" | "critical";
    totalFindings: number;
    criticalCount: number;
    highCount: number;
    mediumCount: number;
    lowCount: number;
    reportMarkdown?: string;
    driveUrl?: string;
  }
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(auditRuns).set({
    ...updates,
    completedAt: new Date(),
  }).where(eq(auditRuns.id, id));
}

export async function listAuditRuns(limit = 50): Promise<AuditRun[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(auditRuns).orderBy(desc(auditRuns.startedAt)).limit(limit);
}

export async function getAuditRun(id: number): Promise<AuditRun | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(auditRuns).where(eq(auditRuns.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function getLatestRunByType(auditType: AuditRun["auditType"]): Promise<AuditRun | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(auditRuns)
    .where(eq(auditRuns.auditType, auditType))
    .orderBy(desc(auditRuns.startedAt))
    .limit(1);
  return rows[0] ?? null;
}

// ─── Audit Findings ───────────────────────────────────────────────────────────

export async function createAuditFindings(findings: InsertAuditFinding[]): Promise<void> {
  const db = await getDb();
  if (!db || findings.length === 0) return;
  // Insert in batches of 50 to avoid MySQL packet size limits
  for (let i = 0; i < findings.length; i += 50) {
    await db.insert(auditFindings).values(findings.slice(i, i + 50));
  }
}

export async function listFindingsByRun(runId: number): Promise<AuditFinding[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(auditFindings)
    .where(eq(auditFindings.runId, runId))
    .orderBy(auditFindings.severity);
}

export async function listRecentFindings(days = 7): Promise<AuditFinding[]> {
  const db = await getDb();
  if (!db) return [];
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  return db.select().from(auditFindings)
    .where(gte(auditFindings.createdAt, since))
    .orderBy(desc(auditFindings.createdAt))
    .limit(200);
}

// ─── Uptime Checks ────────────────────────────────────────────────────────────

export async function createUptimeChecks(checks: InsertUptimeCheck[]): Promise<void> {
  const db = await getDb();
  if (!db || checks.length === 0) return;
  await db.insert(uptimeChecks).values(checks);
}

export async function listUptimeHistory(auditProjectId: number, hours = 24): Promise<UptimeCheck[]> {
  const db = await getDb();
  if (!db) return [];
  const since = new Date(Date.now() - hours * 60 * 60 * 1000);
  return db.select().from(uptimeChecks)
    .where(and(
      eq(uptimeChecks.auditProjectId, auditProjectId),
      gte(uptimeChecks.checkedAt, since)
    ))
    .orderBy(desc(uptimeChecks.checkedAt))
    .limit(500);
}

export async function getUptimeSummary(): Promise<{ projectId: number; upPct: number; avgMs: number; lastChecked: Date | null }[]> {
  const db = await getDb();
  if (!db) return [];
  // Get last 24h of checks per project
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const rows = await db.select().from(uptimeChecks)
    .where(gte(uptimeChecks.checkedAt, since))
    .orderBy(desc(uptimeChecks.checkedAt));

  const byProject: Record<number, { up: number; total: number; totalMs: number; lastChecked: Date | null }> = {};
  for (const row of rows) {
    const pid = row.auditProjectId;
    if (!byProject[pid]) byProject[pid] = { up: 0, total: 0, totalMs: 0, lastChecked: null };
    byProject[pid].total++;
    if (row.isUp) byProject[pid].up++;
    if (row.responseTimeMs) byProject[pid].totalMs += row.responseTimeMs;
    if (!byProject[pid].lastChecked || row.checkedAt > byProject[pid].lastChecked!) {
      byProject[pid].lastChecked = row.checkedAt;
    }
  }

  return Object.entries(byProject).map(([pid, s]) => ({
    projectId: Number(pid),
    upPct: s.total > 0 ? Math.round((s.up / s.total) * 1000) / 10 : 100,
    avgMs: s.total > 0 ? Math.round(s.totalMs / s.total) : 0,
    lastChecked: s.lastChecked,
  }));
}

// ─── Dashboard Stats ──────────────────────────────────────────────────────────

export async function getAuditDashboardStats() {
  const db = await getDb();
  if (!db) return null;

  const [
    projectCount,
    recentRuns,
    uptimeSummary,
  ] = await Promise.all([
    db.select().from(auditProjects).where(eq(auditProjects.enabled, true)),
    db.select().from(auditRuns).orderBy(desc(auditRuns.startedAt)).limit(10),
    getUptimeSummary(),
  ]);

  const lastRun = recentRuns[0] ?? null;
  const criticalOpen = recentRuns.reduce((sum, r) => sum + r.criticalCount, 0);
  const highOpen = recentRuns.reduce((sum, r) => sum + r.highCount, 0);

  return {
    projectCount: projectCount.length,
    lastRunAt: lastRun?.startedAt ?? null,
    lastRunSeverity: lastRun?.severity ?? "none",
    criticalFindings: criticalOpen,
    highFindings: highOpen,
    recentRuns: recentRuns.slice(0, 5),
    uptimeSummary,
  };
}
