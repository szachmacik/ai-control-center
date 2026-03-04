import {
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
  json,
  boolean,
} from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// Agents
export const agents = mysqlTable("agents", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 128 }).notNull(),
  role: varchar("role", { length: 128 }),
  description: text("description"),
  model: varchar("model", { length: 64 }),
  status: mysqlEnum("status", ["active", "idle", "offline", "error"]).default("idle").notNull(),
  tasksCompleted: int("tasks_completed").default(0).notNull(),
  lastActive: timestamp("last_active"),
  mcpEndpoint: varchar("mcp_endpoint", { length: 512 }),
  driveFolderId: varchar("drive_folder_id", { length: 128 }),
  driveFolderUrl: varchar("drive_folder_url", { length: 512 }),
  apiKey: varchar("api_key", { length: 128 }),
  agentType: mysqlEnum("agent_type", ["manus", "n8n", "autogpt", "crewai", "custom"]).default("custom"),
  config: json("config"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Agent = typeof agents.$inferSelect;

// Tasks
export const tasks = mysqlTable("tasks", {
  id: int("id").autoincrement().primaryKey(),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  status: mysqlEnum("status", ["pending", "running", "completed", "failed", "cancelled"]).default("pending").notNull(),
  priority: mysqlEnum("priority", ["low", "medium", "high", "urgent"]).default("medium").notNull(),
  assignedTo: varchar("assigned_to", { length: 128 }),
  agentId: int("agent_id"),
  result: text("result"),
  error: text("error"),
  resultDriveUrl: varchar("result_drive_url", { length: 512 }),
  resultDriveFileId: varchar("result_drive_file_id", { length: 128 }),
  dueDate: timestamp("due_date"),
  tags: json("tags"),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  createdBy: int("created_by"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

// Task logs
export const taskLogs = mysqlTable("task_logs", {
  id: int("id").autoincrement().primaryKey(),
  taskId: int("task_id").notNull(),
  agentId: int("agent_id"),
  agentName: varchar("agent_name", { length: 128 }),
  level: mysqlEnum("level", ["info", "warning", "error", "success"]).default("info").notNull(),
  message: text("message").notNull(),
  details: json("details"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type TaskLog = typeof taskLogs.$inferSelect;

// Drive files
export const driveFiles = mysqlTable("drive_files", {
  id: int("id").autoincrement().primaryKey(),
  taskId: int("task_id"),
  agentId: int("agent_id"),
  fileName: varchar("file_name", { length: 255 }).notNull(),
  driveFileId: varchar("drive_file_id", { length: 128 }).notNull(),
  driveUrl: varchar("drive_url", { length: 512 }).notNull(),
  mimeType: varchar("mime_type", { length: 128 }),
  fileSize: int("file_size"),
  uploadedAt: timestamp("uploaded_at").defaultNow().notNull(),
});

export type DriveFile = typeof driveFiles.$inferSelect;
export type Task = typeof tasks.$inferSelect;

// Infrastructure
export const infrastructure = mysqlTable("infrastructure", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 128 }).notNull(),
  type: mysqlEnum("type", ["server", "database", "api", "service", "storage", "other"]).default("server").notNull(),
  url: varchar("url", { length: 512 }),
  status: mysqlEnum("status", ["healthy", "degraded", "offline", "unknown"]).default("unknown").notNull(),
  metadata: json("metadata"),
  lastChecked: timestamp("last_checked"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Infrastructure = typeof infrastructure.$inferSelect;

// Secrets
export const secrets = mysqlTable("secrets", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 128 }).notNull().unique(),
  value: text("value").notNull(),
  description: text("description"),
  createdBy: int("created_by"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Secret = typeof secrets.$inferSelect;

// Agent logs
export const agentLogs = mysqlTable("agent_logs", {
  id: int("id").autoincrement().primaryKey(),
  agentId: int("agent_id"),
  agentName: varchar("agent_name", { length: 128 }),
  taskId: int("task_id"),
  eventType: mysqlEnum("event_type", ["info", "warning", "error", "success"]).default("info").notNull(),
  message: text("message").notNull(),
  details: json("details"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type AgentLog = typeof agentLogs.$inferSelect;

// Projects
export const projects = mysqlTable("projects", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 128 }).notNull(),
  description: text("description"),
  template: varchar("template", { length: 64 }).default("web-app").notNull(),
  subdomain: varchar("subdomain", { length: 128 }),
  repo: varchar("repo", { length: 256 }),
  status: mysqlEnum("status", ["pending", "building", "deployed", "failed"]).default("pending").notNull(),
  deployUrl: varchar("deploy_url", { length: 512 }),
  createdBy: int("created_by"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Project = typeof projects.$inferSelect;

// ─── Audit Module ────────────────────────────────────────────────────────────

// Audit Projects — monitored targets (GitHub repos, URLs, Supabase projects)
export const auditProjects = mysqlTable("audit_projects", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 128 }).notNull(),
  type: mysqlEnum("type", ["github_repo", "url", "supabase", "npm_package"]).notNull(),
  // github_repo: "owner/repo" | url: "https://..." | supabase: "project_id"
  target: varchar("target", { length: 512 }).notNull(),
  description: text("description"),
  enabled: boolean("enabled").default(true).notNull(),
  // { branch, packageManager, demoEmail, demoPassword, loginUrl, supabaseProjectId, ... }
  config: json("config"),
  createdBy: int("created_by"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type AuditProject = typeof auditProjects.$inferSelect;
export type InsertAuditProject = typeof auditProjects.$inferInsert;

// Audit Runs — one execution of one audit type
export const auditRuns = mysqlTable("audit_runs", {
  id: int("id").autoincrement().primaryKey(),
  auditType: mysqlEnum("audit_type", ["uptime", "security", "functional", "dependency", "db_health"]).notNull(),
  status: mysqlEnum("status", ["running", "completed", "failed"]).default("running").notNull(),
  severity: mysqlEnum("severity", ["none", "low", "medium", "high", "critical"]).default("none").notNull(),
  totalFindings: int("total_findings").default(0).notNull(),
  criticalCount: int("critical_count").default(0).notNull(),
  highCount: int("high_count").default(0).notNull(),
  mediumCount: int("medium_count").default(0).notNull(),
  lowCount: int("low_count").default(0).notNull(),
  reportMarkdown: text("report_markdown"),
  driveUrl: varchar("drive_url", { length: 512 }),
  triggeredBy: varchar("triggered_by", { length: 64 }).default("schedule").notNull(),
  startedAt: timestamp("started_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type AuditRun = typeof auditRuns.$inferSelect;
export type InsertAuditRun = typeof auditRuns.$inferInsert;

// Audit Findings — individual issues found within a run
export const auditFindings = mysqlTable("audit_findings", {
  id: int("id").autoincrement().primaryKey(),
  runId: int("run_id").notNull(),
  auditProjectId: int("audit_project_id"),
  severity: mysqlEnum("severity", ["critical", "high", "medium", "low", "info"]).notNull(),
  category: varchar("category", { length: 64 }).notNull(),
  code: varchar("code", { length: 32 }).notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  location: varchar("location", { length: 512 }),
  evidence: text("evidence"),
  autoFixed: boolean("auto_fixed").default(false).notNull(),
  fixDescription: text("fix_description"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type AuditFinding = typeof auditFindings.$inferSelect;
export type InsertAuditFinding = typeof auditFindings.$inferInsert;

// Uptime Checks — per-endpoint granular history (used for availability charts)
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
export type InsertUptimeCheck = typeof uptimeChecks.$inferInsert;

// ─── Security Sandbox ───────────────────────────────────────────────────────
// Sandbox environments — cloned sites for security testing
export const sandboxEnvironments = mysqlTable("sandbox_environments", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("user_id"),
  name: varchar("name", { length: 128 }).notNull(),
  targetUrl: varchar("target_url", { length: 512 }).notNull(),
  status: mysqlEnum("status", ["cloning", "ready", "scanning", "completed", "error"]).default("cloning").notNull(),
  sandboxUrl: varchar("sandbox_url", { length: 512 }),
  sandboxPort: int("sandbox_port"),
  deployType: mysqlEnum("deploy_type", ["manus_spaces", "local_download"]).default("manus_spaces").notNull(),
  anonymized: boolean("anonymized").default(true).notNull(),
  cloneProgress: int("clone_progress").default(0).notNull(),
  fileCount: int("file_count").default(0).notNull(),
  notes: text("notes"),
  createdBy: int("created_by"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type SandboxEnvironment = typeof sandboxEnvironments.$inferSelect;
export type InsertSandboxEnvironment = typeof sandboxEnvironments.$inferInsert;

// Sandbox scans — security scan runs within a sandbox
export const sandboxScans = mysqlTable("sandbox_scans", {
  id: int("id").autoincrement().primaryKey(),
  sandboxId: int("sandbox_id").notNull(),
  scanType: mysqlEnum("scan_type", ["passive", "active", "xss", "sqli", "headers", "ssl", "csrf", "open_redirect", "full"]).default("passive").notNull(),
  status: mysqlEnum("status", ["pending", "running", "completed", "failed"]).default("pending").notNull(),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  summary: json("summary"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type SandboxScan = typeof sandboxScans.$inferSelect;
export type InsertSandboxScan = typeof sandboxScans.$inferInsert;

// Sandbox findings — individual vulnerabilities found in a scan
export const sandboxFindings = mysqlTable("sandbox_findings", {
  id: int("id").autoincrement().primaryKey(),
  scanId: int("scan_id").notNull(),
  sandboxId: int("sandbox_id").notNull(),
  severity: mysqlEnum("severity", ["critical", "high", "medium", "low", "info"]).default("info").notNull(),
  category: varchar("category", { length: 64 }).notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  evidence: text("evidence"),
  affectedUrl: varchar("affected_url", { length: 512 }),
  remediation: text("remediation"),
  cvssScore: varchar("cvss_score", { length: 8 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type SandboxFinding = typeof sandboxFindings.$inferSelect;
export type InsertSandboxFinding = typeof sandboxFindings.$inferInsert;

// ─── Notifications ────────────────────────────────────────────────────────────
// In-app notification feed — generated by audit runs, agent events, task status changes
export const notifications = mysqlTable("notifications", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("user_id"),                                                        // null = broadcast to all
  type: mysqlEnum("type", ["audit", "agent", "task", "system", "security"]).notNull(),
  severity: mysqlEnum("severity", ["info", "warning", "error", "success"]).notNull().default("info"),
  title: varchar("title", { length: 255 }).notNull(),
  body: text("body"),
  link: varchar("link", { length: 512 }),
  isRead: boolean("is_read").default(false).notNull(),
  sourceId: int("source_id"),
  sourceType: varchar("source_type", { length: 32 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type Notification = typeof notifications.$inferSelect;
export type InsertNotification = typeof notifications.$inferInsert;
