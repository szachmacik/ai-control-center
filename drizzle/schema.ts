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
  // Multi-Agent Hub extensions
  mcpEndpoint: varchar("mcp_endpoint", { length: 512 }),        // HTTP endpoint agent reports to
  driveFolderId: varchar("drive_folder_id", { length: 128 }),   // Google Drive folder ID for this agent
  driveFolderUrl: varchar("drive_folder_url", { length: 512 }), // Shareable Drive URL
  apiKey: varchar("api_key", { length: 128 }),                  // Secret key for agent auth
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
  // Multi-Agent Hub extensions
  resultDriveUrl: varchar("result_drive_url", { length: 512 }), // Drive URL where agent uploaded results
  resultDriveFileId: varchar("result_drive_file_id", { length: 128 }),
  dueDate: timestamp("due_date"),
  tags: json("tags"),                                           // string[]
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  createdBy: int("created_by"),                                 // user id who created
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

// Task logs (detailed per-task activity)
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

// Drive files (files uploaded by agents as task results)
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
