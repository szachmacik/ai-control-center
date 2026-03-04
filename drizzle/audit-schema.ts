// ─── Audit Module Schema ────────────────────────────────────────────────────
// Add these exports to schema.ts

import { int, varchar, text, json, timestamp, mysqlEnum, mysqlTable, boolean } from "drizzle-orm/mysql-core";

// ─── Audit Projects ──────────────────────────────────────────────────────────
// Each "audit project" is a monitored target (a repo, a URL, a Supabase project)
export const auditProjects = mysqlTable("audit_projects", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 128 }).notNull(),
  type: mysqlEnum("type", ["github_repo", "url", "supabase", "npm_package"]).notNull(),
  // For github_repo: "owner/repo"
  // For url: "https://..."
  // For supabase: "project_id"
  // For npm_package: "package-name"
  target: varchar("target", { length: 512 }).notNull(),
  description: text("description"),
  enabled: boolean("enabled").default(true).notNull(),
  // JSON config: { branch, packageManager, demoEmail, demoPassword, loginUrl, ... }
  config: json("config"),
  createdBy: int("created_by"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type AuditProject = typeof auditProjects.$inferSelect;
export type InsertAuditProject = typeof auditProjects.$inferInsert;

// ─── Audit Runs ──────────────────────────────────────────────────────────────
// One run = one execution of one audit type against one or all projects
export const auditRuns = mysqlTable("audit_runs", {
  id: int("id").autoincrement().primaryKey(),
  auditType: mysqlEnum("audit_type", [
    "uptime",
    "security",
    "functional",
    "dependency",
    "db_health",
  ]).notNull(),
  status: mysqlEnum("status", ["running", "completed", "failed"]).default("running").notNull(),
  // Overall severity of findings: none / low / medium / high / critical
  severity: mysqlEnum("severity", ["none", "low", "medium", "high", "critical"]).default("none").notNull(),
  totalFindings: int("total_findings").default(0).notNull(),
  criticalCount: int("critical_count").default(0).notNull(),
  highCount: int("high_count").default(0).notNull(),
  mediumCount: int("medium_count").default(0).notNull(),
  lowCount: int("low_count").default(0).notNull(),
  // Full markdown report text
  reportMarkdown: text("report_markdown"),
  // Google Drive URL of the uploaded report (if applicable)
  driveUrl: varchar("drive_url", { length: 512 }),
  triggeredBy: varchar("triggered_by", { length: 64 }).default("schedule").notNull(), // "schedule" | "manual" | user email
  startedAt: timestamp("started_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type AuditRun = typeof auditRuns.$inferSelect;
export type InsertAuditRun = typeof auditRuns.$inferInsert;

// ─── Audit Findings ──────────────────────────────────────────────────────────
// Individual findings within a run
export const auditFindings = mysqlTable("audit_findings", {
  id: int("id").autoincrement().primaryKey(),
  runId: int("run_id").notNull(),
  auditProjectId: int("audit_project_id"), // null = applies to all / global
  severity: mysqlEnum("severity", ["critical", "high", "medium", "low", "info"]).notNull(),
  category: varchar("category", { length: 64 }).notNull(), // e.g. "secret_leak", "missing_rls", "cve", "uptime", "i18n"
  code: varchar("code", { length: 32 }).notNull(),          // e.g. "SEC-001", "CVE-002", "UPT-001"
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  // File path, URL, table name, package name, etc.
  location: varchar("location", { length: 512 }),
  // Raw evidence (git diff snippet, HTTP response, etc.)
  evidence: text("evidence"),
  // Was this auto-fixed?
  autoFixed: boolean("auto_fixed").default(false).notNull(),
  fixDescription: text("fix_description"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type AuditFinding = typeof auditFindings.$inferSelect;
export type InsertAuditFinding = typeof auditFindings.$inferInsert;

// ─── Uptime Checks ───────────────────────────────────────────────────────────
// Granular per-endpoint uptime records (used for charts/history)
export const uptimeChecks = mysqlTable("uptime_checks", {
  id: int("id").autoincrement().primaryKey(),
  auditProjectId: int("audit_project_id").notNull(),
  url: varchar("url", { length: 512 }).notNull(),
  statusCode: int("status_code"),
  responseTimeMs: int("response_time_ms"),
  isUp: boolean("is_up").default(true).notNull(),
  isSlow: boolean("is_slow").default(false).notNull(),
  errorMessage: varchar("error_message", { length: 512 }),
  checkedAt: timestamp("checked_at").defaultNow().notNull(),
});
export type UptimeCheck = typeof uptimeChecks.$inferSelect;
