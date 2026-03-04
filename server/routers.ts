import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { runAudit } from "./auditEngine";
import { sandboxRouter } from "./sandbox/sandboxRouter";
import {
  listNotifications, countUnread, markRead, markAllRead, createNotification,
} from "./notificationsDb";
import {
  listAuditProjects, createAuditProject, updateAuditProject, deleteAuditProject,
  listAuditRuns, getAuditRun, listFindingsByRun, listRecentFindings,
  listUptimeHistory, getAuditDashboardStats,
} from "./auditDb";
import jwt from "jsonwebtoken";
import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { verifySupabaseToken } from "./_core/supabaseAuth";
import { sdk } from "./_core/sdk";
import * as db from "./db";
import {
  listAgents, updateAgentStatus,
  listTasks, createTask, updateTaskStatus, addTaskLog, getTaskLogs, addDriveFile, getDriveFiles,
  listInfrastructure, seedInfrastructure, seedAgents,
  listSecrets, createSecret, deleteSecret,
  listLogs,
  listProjects, createProject,
  getDashboardStats,
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

  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
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
    updateStatus: adminProcedure
      .input(z.object({
        id: z.number(),
        status: z.enum(["active", "idle", "offline", "error"]),
      }))
      .mutation(({ input }) => updateAgentStatus(input.id, input.status)),
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
});

export type AppRouter = typeof appRouter;
