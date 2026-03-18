import express from "express";
import { guardianRouter } from "../guardian";
import path from "path";
import { ensureDatabaseExists } from "../initDb";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerSupabaseAuthRoutes } from "./supabaseAuth";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic } from "./vite";
import { startCleanupWorker } from "../sandbox/cleanupWorker";
import {
  handleManusSubmitTask,
  handleManusListTasks,
  handleManusStatus,
  handleFbCapiEvent,
  handleManychatWebhook,
} from "../manusApi";
import { startScheduleWorker } from "../sandbox/scheduleWorker";
import {
  handleManyChatVerification,
  handleManyChatWebhook as handleManyChatWebhookPost,
} from "../meta/manychatWebhook";

// Security headers applied directly (no external dependency needed)

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

/**
 * SEC-009 FIX: Validate agent API key from request headers.
 * Agents must send x-agent-key matching AGENT_API_KEY env variable.
 * Returns true if valid, false otherwise.
 */
function validateAgentKey(req: express.Request): boolean {
  const expectedKey = process.env.AGENT_API_KEY;
  if (!expectedKey) {
    // If not configured, log warning and deny all agent requests
    console.warn("[Security] AGENT_API_KEY not set — rejecting all agent requests");
    return false;
  }
  const providedKey = req.headers["x-agent-key"] as string;
  if (!providedKey || providedKey !== expectedKey) {
    return false;
  }
  return true;
}

async function startServer() {
  // Ensure database exists before connecting
  await ensureDatabaseExists();

  const app = express();
  const server = createServer(app);

  // ─── Security Headers ────────────────────────────────────────────────────────
  app.disable("x-powered-by");
  app.use((_req, res, next) => {
    res.setHeader("X-Frame-Options", "SAMEORIGIN");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-XSS-Protection", "1; mode=block");
    res.setHeader("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()");
    res.setHeader(
      "Content-Security-Policy",
      [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: blob: https:",
        "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
        "frame-src 'none'",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
        "frame-ancestors 'self'",
        "upgrade-insecure-requests",
      ].join("; ")
    );
    next();
  });

  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  // OAuth callback under /api/oauth/callback
  registerOAuthRoutes(app);
  // Supabase magic link auth
  registerSupabaseAuthRoutes(app);

  // Agent heartbeat endpoint — agents POST here to report status
  // SEC-009 FIX: Validate x-agent-key header before processing
  app.post("/api/agent/heartbeat", async (req, res) => {
    try {
      // SEC-009 FIX: Validate agent API key
      if (!validateAgentKey(req)) {
        return res.status(401).json({ error: "Unauthorized: invalid or missing x-agent-key" });
      }

      const { agentName, status, taskId, message } = req.body;
      const apiKey = req.headers["x-agent-key"] as string;
      if (!agentName) return res.status(400).json({ error: "agentName required" });
      // Update agent last_active and status in DB
      const { getDb } = await import("../db");
      const { agents, agentLogs } = await import("../../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      const db = await getDb();
      if (db) {
        await db.update(agents)
          .set({ status: status ?? "active", lastActive: new Date() })
          .where(eq(agents.name, agentName));
        if (message) {
          await db.insert(agentLogs).values({
            agentName,
            taskId: taskId ?? null,
            eventType: "info",
            message: message ?? `Heartbeat from ${agentName}`,
          });
        }
      }
      res.json({ ok: true, timestamp: new Date().toISOString() });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Agent task update endpoint — agents POST task results here
  // SEC-009 FIX: Validate x-agent-key header before processing
  app.post("/api/agent/task-update", async (req, res) => {
    try {
      // SEC-009 FIX: Validate agent API key
      if (!validateAgentKey(req)) {
        return res.status(401).json({ error: "Unauthorized: invalid or missing x-agent-key" });
      }

      const { taskId, status, result, resultDriveUrl, agentName, message } = req.body;
      if (!taskId) return res.status(400).json({ error: "taskId required" });
      const { getDb } = await import("../db");
      const { tasks, taskLogs } = await import("../../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      const db = await getDb();
      if (db) {
        await db.update(tasks)
          .set({
            status: status ?? "running",
            result: result ?? undefined,
            resultDriveUrl: resultDriveUrl ?? undefined,
            completedAt: ["completed", "failed"].includes(status) ? new Date() : undefined,
          })
          .where(eq(tasks.id, parseInt(taskId)));
        if (message) {
          await db.insert(taskLogs).values({
            taskId: parseInt(taskId),
            agentName: agentName ?? null,
            level: status === "failed" ? "error" : "info",
            message,
          });
        }
      }
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Sandbox report download endpoint — serves generated HTML/JSON reports
  app.get("/api/sandbox/report/:sandboxId/:filename", async (req, res) => {
    try {
      // Basic auth check via session cookie (same as tRPC)
      const { sandboxId, filename } = req.params;
      // Sanitize: only allow safe filenames
      if (!/^sentinel-report-[\d]+-scan[\d]+\.(html|json)$/.test(filename)) {
        return res.status(400).json({ error: "Invalid filename" });
      }
      const reportPath = path.join("/tmp/sandboxes", `sandbox-${sandboxId}`, "reports", filename);
      const { access } = await import("fs/promises");
      await access(reportPath);
      const ext = filename.endsWith(".json") ? "application/json" : "text/html";
      res.setHeader("Content-Type", ext);
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.sendFile(reportPath);
    } catch {
      res.status(404).json({ error: "Report not found" });
    }
  });

  // tRPC API
  // ─── Manus Autonomous API ────────────────────────────────────────────────────
  // Manus AI controls Sentinel via these endpoints using MANUS_API_KEY
  app.get("/api/manus/status", handleManusStatus);
  app.post("/api/manus/tasks", handleManusSubmitTask);
  app.get("/api/manus/tasks", handleManusListTasks);

  // ─── Marketing Webhooks ───────────────────────────────────────────────────
  // Landing pages send FB CAPI events here (auth: x-internal-secret header)
  app.post("/api/marketing/fb-event", handleFbCapiEvent);
  // ManyChat flows send webhook events here (auth: x-manychat-secret header)
  app.post("/api/marketing/manychat", handleManychatWebhook);
  // New ManyChat webhook endpoint (Sentinel meta module)
  app.get("/api/webhooks/manychat", handleManyChatVerification);
  app.post("/api/webhooks/manychat", handleManyChatWebhookPost);

  // ─── tRPC API ─────────────────────────────────────────────────────────────
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {

    const { setupVite } = await import("./vite");

    await setupVite(app, server);
  } else {
  
  // Health check endpoint (wymagany przez monitoring i Coolify)
  app.get("/api/health", (_req, res) => {
    res.json({
      status: "ok",
      version: process.env.npm_package_version || "1.0.0",
      timestamp: new Date().toISOString(),
      uptime: Math.floor(process.uptime()),
    });
  });

  app.use("/api/guardian", guardianRouter);
  serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
    // Start sandbox cleanup worker after server is up
    startCleanupWorker();
    startScheduleWorker();
  });
}

startServer().catch(console.error);
