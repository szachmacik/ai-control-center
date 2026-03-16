import {
  insertFbCapiEvent, insertManychatEvent, listRecentFbEvents, listRecentManychatEvents,
  listFbCampaigns, listManusQueue, getManusTask, getMarketingStats, insertManusTask,
} from "./marketingDb";
import { syncFbCampaigns, upsertCampaignFromMeta } from "./fbCapiService";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { runAudit } from "./auditEngine";
import { sandboxRouter } from "./sandbox/sandboxRouter";
import { metaRouter } from "./meta/metaRouter";
import {
  listNotifications, countUnread, markRead, markAllRead, createNotification,
} from "./notificationsDb";
import {
  listAuditProjects, createAuditProject, updateAuditProject, deleteAuditProject,
  listAuditRuns, getAuditRun, listFindingsByRun, listRecentFindings,
  listUptimeHistory, getAuditDashboardStats, getUptimeSummary } from "./auditDb";
import jwt from "jsonwebtoken";
import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { verifySupabaseToken } from "./_core/supabaseAuth";
import { sdk } from "./_core/sdk";
import * as db from "./db";
import {
  listAgents, updateAgentStatus, getAgentById, getAgentTasks, incrementAgentTasksCompleted,
  createAgent, updateAgent, deleteAgent,
  listTasks, createTask, updateTaskStatus, addTaskLog, getTaskLogs, addDriveFile, getDriveFiles,
  getTaskById,
  listInfrastructure, seedInfrastructure, seedAgents, checkInfrastructureHealth,
  listSecrets, createSecret, deleteSecret,
  listLogs,
  listProjects, createProject,
  getDashboardStats,
  listKnowledgeFiles, createKnowledgeFile, deleteKnowledgeFile, toggleKnowledgeStar, incrementKnowledgeViewCount,
  getAuditSchedule, saveAuditSchedule,
  listLogsFiltered, dispatchAgentTask,
  getVaultKeys, setVaultKey,
} from "./db";

// Admin-only guard
const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required" });
  }
  return next({ ctx });
});

export const appRouter = router({
  system: systemRouter,
  sandbox: sandboxRouter,
  meta: metaRouter,

  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      const _clearOpts = Object.assign({}, cookieOptions);
      ctx.res.clearCookie(COOKIE_NAME, _clearOpts);
      return { success: true } as const;
    }),
    exchangeSupabaseToken: publicProcedure
      .input(z.object({ accessToken: z.string(), refreshToken: z.string() }))
      .mutation(async ({ input, ctx }) => {
        const payload = await verifySupabaseToken(input.accessToken);
        if (!payload?.sub) {
          throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid Supabase token" });
        }
        const email = payload.email ?? null;
        const ALLOWED_EMAILS = (process.env.ALLOWED_EMAILS ?? "***REDACTED***").split(",").map(e => e.trim().toLowerCase());
        const ADMIN_EMAILS = (process.env.ADMIN_EMAILS ?? "***REDACTED***").split(",").map(e => e.trim().toLowerCase());
        if (!email || !ALLOWED_EMAILS.includes(email.toLowerCase())) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Access denied. Your email is not authorized." });
        }
        const openId = `supabase:${payload.sub}`;
        const name = payload.user_metadata?.full_name ?? payload.user_metadata?.name ?? email;
        const isAdmin = ADMIN_EMAILS.includes(email.toLowerCase());
        await db.upsertUser({ openId, name, email, role: isAdmin ? "admin" : undefined, loginMethod: "supabase", lastSignedIn: new Date() });
        const sessionToken = await sdk.createSessionToken(openId, { name, expiresInMs: ONE_YEAR_MS });
        const cookieOptions = getSessionCookieOptions(ctx.req);
        ctx.res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });
        return { success: true } as const;
      }),
  }),

  dashboard: router({
    stats: protectedProcedure.query(() => getDashboardStats()),
  }),

  agents: router({
    list: protectedProcedure.query(() => listAgents()),
    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(({ input }) => getAgentById(input.id)),
    getTasks: protectedProcedure
      .input(z.object({ agentId: z.number(), limit: z.number().optional() }))
      .query(({ input }) => getAgentTasks(input.agentId, input.limit)),
    updateStatus: adminProcedure
      .input(z.object({
        id: z.number(),
        status: z.enum(["active", "idle", "offline", "error"]),
      }))
      .mutation(({ input }) => updateAgentStatus(input.id, input.status)),
    incrementTasksCompleted: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(({ input }) => incrementAgentTasksCompleted(input.id)),
    create: adminProcedure
      .input(z.object({
        name: z.string().min(1),
        role: z.string().optional(),
        description: z.string().optional(),
        model: z.string().optional(),
        status: z.enum(["active", "idle", "offline", "error"]).optional(),
        agentType: z.enum(["manus", "n8n", "autogpt", "crewai", "custom"]).optional(),
        mcpEndpoint: z.string().url().optional().or(z.literal("")),
        driveFolderUrl: z.string().url().optional().or(z.literal("")),
        config: z.record(z.string(), z.unknown()).optional(),
      }))
      .mutation(({ input }) => createAgent(input)),
    update: adminProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().min(1).optional(),
        role: z.string().optional(),
        description: z.string().optional(),
        model: z.string().optional(),
        status: z.enum(["active", "idle", "offline", "error"]).optional(),
        agentType: z.enum(["manus", "n8n", "autogpt", "crewai", "custom"]).optional(),
        mcpEndpoint: z.string().optional(),
        driveFolderUrl: z.string().optional(),
        config: z.record(z.string(), z.unknown()).optional(),
      }))
      .mutation(({ input }) => { const { id, ...data } = input; return updateAgent(id, data); }),
    delete: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(({ input }) => deleteAgent(input.id)),
    dispatchTask: protectedProcedure
      .input(z.object({
        agentId: z.number(),
        agentName: z.string(),
        title: z.string().min(1).max(255),
        description: z.string().optional(),
        priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
      }))
      .mutation(({ input, ctx }) => dispatchAgentTask({ ...input, createdBy: ctx.user.id })),
  }),

  tasks: router({
    list: protectedProcedure.query(() => listTasks()),
    create: protectedProcedure
      .input(z.object({
        title: z.string().min(1),
        description: z.string().optional(),
        assignedTo: z.string().optional(),
        agentId: z.number().optional(),
        priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
        dueDate: z.date().optional(),
        tags: z.array(z.string()).optional(),
      }))
      .mutation(({ input, ctx }) => createTask({ ...input, createdBy: ctx.user.id })),
    updateStatus: protectedProcedure
      .input(z.object({
        id: z.number(),
        status: z.enum(["pending", "running", "completed", "failed", "cancelled"]),
        result: z.string().optional(),
        resultDriveUrl: z.string().optional(),
      }))
      .mutation(({ input }) => updateTaskStatus(input)),
    addLog: protectedProcedure
      .input(z.object({
        taskId: z.number(),
        message: z.string(),
        level: z.enum(["info", "warning", "error", "success"]).optional(),
        agentId: z.number().optional(),
        agentName: z.string().optional(),
        details: z.record(z.string(), z.unknown()).optional(),
      }))
      .mutation(({ input }) => addTaskLog(input)),
    getLogs: protectedProcedure
      .input(z.object({ taskId: z.number() }))
      .query(({ input }) => getTaskLogs(input.taskId)),
    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(({ input }) => getTaskById(input.id)),
    getDriveFiles: protectedProcedure
      .input(z.object({ taskId: z.number() }))
      .query(({ input }) => getDriveFiles(input.taskId)),
  }),

  knowledge: router({
    list: protectedProcedure
      .input(z.object({ search: z.string().optional() }))
      .query(({ input, ctx }) => listKnowledgeFiles(ctx.user.id, input.search)),
    create: protectedProcedure
      .input(z.object({
        title: z.string().min(1).max(255),
        description: z.string().optional(),
        category: z.string().max(64).default("general"),
        tags: z.array(z.string()).optional(),
        fileName: z.string().min(1).max(255),
        fileSize: z.number().optional(),
        mimeType: z.string().optional(),
        storageKey: z.string().min(1).max(512),
        publicUrl: z.string().url().optional(),
      }))
      .mutation(({ input, ctx }) => createKnowledgeFile({ ...input, userId: ctx.user.id, tags: input.tags ?? null, isStarred: false })),
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(({ input, ctx }) => deleteKnowledgeFile(input.id, ctx.user.id)),
    toggleStar: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(({ input, ctx }) => toggleKnowledgeStar(input.id, ctx.user.id)),
    incrementView: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(({ input }) => incrementKnowledgeViewCount(input.id)),
  }),

  infrastructure: router({
    list: protectedProcedure.query(() => listInfrastructure()),
    // One-time seed for initial data population (admin only)
    seed: adminProcedure.mutation(async () => {
      const infraCount = await seedInfrastructure();
      const agentCount = await seedAgents();
      return { infraCount, agentCount };
    }),
    // Generate a short-lived SSO launch token for Supabase-OTP services
    uptimeSummary: protectedProcedure
      .query(() => getUptimeSummary()),
    getLaunchToken: protectedProcedure
      .input(z.object({
        serviceUrl: z.string().url(),
        serviceName: z.string(),
      }))
      .mutation(async ({ input, ctx }) => {
        const secret = process.env.JWT_SECRET ?? "fallback-secret";
        const token = jwt.sign(
          {
            sub: ctx.user.openId,
            email: ctx.user.email,
            name: ctx.user.name,
            iss: "ai-control-center.ofshore.dev",
            aud: input.serviceName,
          },
          secret,
          { expiresIn: "5m" }
        );
        // Append sso_token to the service URL
        const url = new URL(input.serviceUrl);
        url.searchParams.set("sso_token", token);
        return { launchUrl: url.toString(), expiresIn: 300 };
      }),
    // Real-time health check — pings all services and updates DB status
    checkHealth: adminProcedure.mutation(() => checkInfrastructureHealth()),
  }),

  secrets: router({
    list: adminProcedure.query(() => listSecrets()),
    create: adminProcedure
      .input(z.object({
        name: z.string().min(1),
        value: z.string().min(1),
        description: z.string().optional(),
      }))
      .mutation(({ input, ctx }) =>
        createSecret({ ...input, createdBy: ctx.user.id })
      ),
    delete: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(({ input }) => deleteSecret(input.id)),
  }),

  logs: router({
    list: protectedProcedure
      .input(z.object({ search: z.string().optional() }))
      .query(({ input }) => listLogs(input.search)),
    listFiltered: protectedProcedure
      .input(z.object({
        search: z.string().optional(),
        eventType: z.enum(['all', 'info', 'warning', 'error', 'success']).optional(),
        agentName: z.string().optional(),
        limit: z.number().min(1).max(1000).optional(),
      }))
      .query(({ input }) => listLogsFiltered(input)),
    exportCsv: protectedProcedure
      .input(z.object({
        search: z.string().optional(),
        eventType: z.enum(['all', 'info', 'warning', 'error', 'success']).optional(),
        agentName: z.string().optional(),
      }))
      .query(async ({ input }) => {
        const rows = await listLogsFiltered({ ...input, limit: 1000 });
        const header = 'ID,Timestamp,EventType,AgentName,AgentID,TaskID,Message';
        const escape = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
        const lines = rows.map(r =>
          [r.id, r.createdAt, r.eventType, r.agentName ?? '', r.agentId ?? '', r.taskId ?? '', r.message]
            .map(escape).join(',')
        );
        return { csv: [header, ...lines].join('\n'), count: rows.length };
      }),
  }),

  projects: router({
    list: protectedProcedure.query(() => listProjects()),
    create: adminProcedure
      .input(z.object({
        name: z.string().min(1),
        description: z.string().optional(),
        template: z.string().default("web-app"),
        subdomain: z.string().optional(),
        repo: z.string().optional(),
      }))
      .mutation(({ input, ctx }) =>
        createProject({ ...input, createdBy: ctx.user.id })
      ),
  }),

  // ─── Audit Module ─────────────────────────────────────────────────────────
  audit: router({
    // Overview stats for the audit dashboard
    stats: protectedProcedure.query(() => getAuditDashboardStats()),

    // Audit Projects (monitored targets: repos, URLs, Supabase)
    projects: router({
      list: protectedProcedure.query(() => listAuditProjects()),
      create: adminProcedure
        .input(z.object({
          name: z.string().min(1),
          type: z.enum(["github_repo", "url", "supabase", "npm_package"]),
          target: z.string().min(1),
          description: z.string().optional(),
          enabled: z.boolean().optional(),
          config: z.record(z.string(), z.unknown()).optional(),
        }))
        .mutation(({ input, ctx }) =>
          createAuditProject({ ...input, createdBy: ctx.user.id })
        ),
      update: adminProcedure
        .input(z.object({
          id: z.number(),
          name: z.string().optional(),
          enabled: z.boolean().optional(),
          config: z.record(z.string(), z.unknown()).optional(),
          description: z.string().optional(),
        }))
        .mutation(({ input }) => {
          const { id, ...data } = input;
          return updateAuditProject(id, data);
        }),
      delete: adminProcedure
        .input(z.object({ id: z.number() }))
        .mutation(({ input }) => deleteAuditProject(input.id)),
    }),

    // Audit Runs — history and findings
    runs: router({
      list: protectedProcedure
        .input(z.object({ limit: z.number().optional() }))
        .query(({ input }) => listAuditRuns(input.limit ?? 50)),
      get: protectedProcedure
        .input(z.object({ id: z.number() }))
        .query(({ input }) => getAuditRun(input.id)),
      findings: protectedProcedure
        .input(z.object({ runId: z.number() }))
        .query(({ input }) => listFindingsByRun(input.runId)),
    }),

    // Recent findings across all runs (last N days)
    recentFindings: protectedProcedure
      .input(z.object({ days: z.number().optional() }))
      .query(({ input }) => listRecentFindings(input.days ?? 7)),

    // Uptime history for a specific monitored URL project
    uptimeHistory: protectedProcedure
      .input(z.object({ auditProjectId: z.number(), hours: z.number().optional() }))
      .query(({ input }) => listUptimeHistory(input.auditProjectId, input.hours ?? 24)),

    // Manually trigger an audit run (admin only)
    trigger: adminProcedure
      .input(z.object({
        type: z.enum(["uptime", "security", "functional", "dependency", "db_health"]),
        projectIds: z.array(z.number()).optional(),
      }))
      .mutation(({ input, ctx }) =>
        runAudit({
          type: input.type,
          triggeredBy: ctx.user.email ?? ctx.user.name ?? "admin",
          projectIds: input.projectIds,
        })
      ),
  }),

  // ─── Notifications ─────────────────────────────────────────────────────────
  notifications: router({
    list: protectedProcedure
      .query(({ ctx }) => listNotifications(ctx.user.id, 30)),

    unreadCount: protectedProcedure
      .query(({ ctx }) => countUnread(ctx.user.id)),

    markRead: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(({ input }) => markRead(input.id)),

    markAllRead: protectedProcedure
      .mutation(({ ctx }) => markAllRead(ctx.user.id)),

    // Admin: create a broadcast notification (userId = null)
    broadcast: adminProcedure
      .input(z.object({
        type: z.enum(["audit", "agent", "task", "system", "security"]),
        severity: z.enum(["info", "warning", "error", "success"]).optional(),
        title: z.string().min(1),
        body: z.string().optional(),
        link: z.string().optional(),
      }))
      .mutation(({ input }) =>
        createNotification({ ...input, severity: input.severity ?? "info" })
      ),
  }),

  // ─── Marketing Router ─────────────────────────────────────────────────────
  marketing: router({
    stats: protectedProcedure.query(() => getMarketingStats()),

    campaigns: router({
      list: protectedProcedure.query(() => listFbCampaigns()),
      sync: protectedProcedure.mutation(async () => {
        const result = await syncFbCampaigns();
        if (result.success && result.campaigns) {
          for (const c of result.campaigns as any[]) {
            await upsertCampaignFromMeta(c);
          }
        }
        return result;
      }),
    }),

    capi: router({
      list: protectedProcedure
        .input(z.object({ limit: z.number().min(1).max(200).optional() }))
        .query(({ input }) => listRecentFbEvents(input.limit ?? 50)),
    }),

    manychat: router({
      list: protectedProcedure
        .input(z.object({ limit: z.number().min(1).max(200).optional() }))
        .query(({ input }) => listRecentManychatEvents(input.limit ?? 50)),
    }),

    queue: router({
      list: protectedProcedure.query(() => listManusQueue(100)),
      get: protectedProcedure
        .input(z.object({ id: z.number() }))
        .query(({ input }) => getManusTask(input.id)),
      submit: protectedProcedure
        .input(z.object({ taskType: z.string(), payload: z.record(z.string(), z.unknown()).optional() }))
        .mutation(({ input }) => insertManusTask({ taskType: input.taskType, payload: input.payload ?? {}, submittedBy: "sentinel-ui" })),
    }),
  }),

  settings: router({
    getSchedule: protectedProcedure.query(() => getAuditSchedule()),
    vault: router({
      list: adminProcedure.query(() => getVaultKeys()),
      set: adminProcedure
        .input(z.object({
          keyName: z.enum(['COOLIFY_TOKEN', 'COOLIFY_WEBHOOK_URL', 'GITHUB_PAT']),
          keyValue: z.string().min(1),
        }))
        .mutation(({ input }) => setVaultKey(input.keyName as any, input.keyValue)),
    }),
    saveSchedule: adminProcedure
      .input(z.object({
        uptimeEnabled: z.boolean(),
        uptimeCron: z.string(),
        securityEnabled: z.boolean(),
        securityCron: z.string(),
        functionalEnabled: z.boolean(),
        functionalCron: z.string(),
        dependencyEnabled: z.boolean(),
        dependencyCron: z.string(),
        dbHealthEnabled: z.boolean(),
        dbHealthCron: z.string(),
      }))
      .mutation(({ input }) => saveAuditSchedule(input)),
  }),
});

export type AppRouter = typeof appRouter;
