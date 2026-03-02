import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import {
  listAgents, updateAgentStatus,
  listTasks, createTask,
  listInfrastructure,
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

  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
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
        priority: z.number().min(1).max(10).optional(),
      }))
      .mutation(({ input }) => createTask(input)),
  }),

  infrastructure: router({
    list: protectedProcedure.query(() => listInfrastructure()),
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
});

export type AppRouter = typeof appRouter;
