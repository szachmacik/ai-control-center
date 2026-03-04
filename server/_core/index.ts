import express from "express";
import { ensureDatabaseExists } from "../initDb";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerSupabaseAuthRoutes } from "./supabaseAuth";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";

// SEC-011 FIX: Import helmet for security headers
// Run: pnpm add helmet @types/helmet
let helmet: any;
try {
  helmet = require("helmet");
} catch {
  console.warn("[Security] helmet not installed — run: pnpm add helmet");
}

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

  // SEC-011 FIX: Apply helmet security headers
  if (helmet) {
    app.use(helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", "data:", "blob:", "https:"],
          connectSrc: ["'self'", "https://*.supabase.co", "wss://*.supabase.co"],
          frameSrc: ["'none'"],
          objectSrc: ["'none'"],
          baseUri: ["'self'"],
          upgradeInsecureRequests: [],
        },
      },
      hsts: {
        maxAge: 63072000,
        includeSubDomains: true,
        preload: true,
      },
    }));
  }

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

  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

startServer().catch(console.error);
