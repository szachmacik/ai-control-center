import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// Mock db module
vi.mock("./db", () => ({
  listAgents: vi.fn().mockResolvedValue([]),
  updateAgentStatus: vi.fn().mockResolvedValue(undefined),
  listTasks: vi.fn().mockResolvedValue([]),
  createTask: vi.fn().mockResolvedValue(undefined),
  listInfrastructure: vi.fn().mockResolvedValue([]),
  listSecrets: vi.fn().mockResolvedValue([]),
  createSecret: vi.fn().mockResolvedValue(undefined),
  deleteSecret: vi.fn().mockResolvedValue(undefined),
  listLogs: vi.fn().mockResolvedValue([]),
  listProjects: vi.fn().mockResolvedValue([]),
  createProject: vi.fn().mockResolvedValue(undefined),
  getDashboardStats: vi.fn().mockResolvedValue({
    activeAgents: 2, runningTasks: 1, healthyServices: 3, totalServices: 4,
    eventsToday: 10, agents: [], recentLogs: [], infrastructure: [],
  }),
  upsertUser: vi.fn().mockResolvedValue(undefined),
  getUserByOpenId: vi.fn().mockResolvedValue(undefined),
}));

function makeCtx(role: "admin" | "user" = "user"): TrpcContext {
  return {
    user: {
      id: 1,
      openId: "test-user",
      email: "test@example.com",
      name: "Test User",
      loginMethod: "supabase",
      role,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

function makePublicCtx(): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

describe("auth.me", () => {
  it("returns null for unauthenticated user", async () => {
    const caller = appRouter.createCaller(makePublicCtx());
    const result = await caller.auth.me();
    expect(result).toBeNull();
  });

  it("returns user for authenticated user", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.auth.me();
    expect(result?.email).toBe("test@example.com");
  });
});

describe("dashboard.stats", () => {
  it("returns stats for authenticated user", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.dashboard.stats();
    expect(result.activeAgents).toBe(2);
    expect(result.runningTasks).toBe(1);
  });

  it("throws UNAUTHORIZED for unauthenticated user", async () => {
    const caller = appRouter.createCaller(makePublicCtx());
    await expect(caller.dashboard.stats()).rejects.toThrow();
  });
});

describe("agents.list", () => {
  it("returns agents for authenticated user", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.agents.list();
    expect(Array.isArray(result)).toBe(true);
  });
});

describe("agents.updateStatus (admin only)", () => {
  it("allows admin to update agent status", async () => {
    const caller = appRouter.createCaller(makeCtx("admin"));
    await expect(
      caller.agents.updateStatus({ id: 1, status: "active" })
    ).resolves.not.toThrow();
  });

  it("throws FORBIDDEN for non-admin user", async () => {
    const caller = appRouter.createCaller(makeCtx("user"));
    await expect(
      caller.agents.updateStatus({ id: 1, status: "active" })
    ).rejects.toThrow("Admin access required");
  });
});

describe("secrets (admin only)", () => {
  it("allows admin to list secrets", async () => {
    const caller = appRouter.createCaller(makeCtx("admin"));
    const result = await caller.secrets.list();
    expect(Array.isArray(result)).toBe(true);
  });

  it("throws FORBIDDEN for non-admin user on secrets.list", async () => {
    const caller = appRouter.createCaller(makeCtx("user"));
    await expect(caller.secrets.list()).rejects.toThrow("Admin access required");
  });

  it("allows admin to create secret", async () => {
    const caller = appRouter.createCaller(makeCtx("admin"));
    await expect(
      caller.secrets.create({ name: "TEST_KEY", value: "secret123" })
    ).resolves.not.toThrow();
  });
});

describe("tasks.create", () => {
  it("allows authenticated user to create task", async () => {
    const caller = appRouter.createCaller(makeCtx());
    await expect(
      caller.tasks.create({ title: "Test task", priority: "medium" })
    ).resolves.not.toThrow();
  });

  it("throws for empty title", async () => {
    const caller = appRouter.createCaller(makeCtx());
    await expect(
      caller.tasks.create({ title: "" })
    ).rejects.toThrow();
  });
});

describe("projects.create (admin only)", () => {
  it("allows admin to create project", async () => {
    const caller = appRouter.createCaller(makeCtx("admin"));
    await expect(
      caller.projects.create({ name: "my-app", template: "web-app" })
    ).resolves.not.toThrow();
  });

  it("throws FORBIDDEN for non-admin user", async () => {
    const caller = appRouter.createCaller(makeCtx("user"));
    await expect(
      caller.projects.create({ name: "my-app", template: "web-app" })
    ).rejects.toThrow("Admin access required");
  });
});
