/**
 * Security Sandbox — tRPC Router
 *
 * Handles all sandbox CRUD, cloning, scanning, and download operations.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { sandboxEnvironments, sandboxScans, sandboxFindings, sandboxSchedules } from "../../drizzle/schema";
import { eq, desc, and } from "drizzle-orm";
import { detectTechStack } from "./tech-detector";
import { generateEnvironment, describeEnvironment } from "./env-generator";
import { cloneSite, packageSandboxAsZip, deleteSandboxFiles, SANDBOX_DIR } from "./cloner";
import {
  spinUpSandbox,
  teardownSandbox,
  getSandboxContainerStatus,
  getSandboxExpiry,
  extendSandboxTTL,
} from "./lifecycle";
import * as fs from "fs/promises";
import * as path from "path";
import { generateReport } from "./reportGenerator";
import { runScan } from "./scanner";
import { compareScans, buildTrendSeries, type ScanSnapshot } from "./scanComparator";
import { createNotification } from "../notificationsDb";


// ─── Helpers ──────────────────────────────────────────────────────────────────

// Simple in-memory rate limiter: max 5 sandbox creates per user per 10 minutes
const createRateLimiter = new Map<number, { count: number; resetAt: number }>();
const MAX_CREATES_PER_WINDOW = 5;
const RATE_WINDOW_MS = 10 * 60 * 1000;

function checkCreateRateLimit(userId: number): void {
  const now = Date.now();
  const entry = createRateLimiter.get(userId);
  if (!entry || now > entry.resetAt) {
    createRateLimiter.set(userId, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return;
  }
  if (entry.count >= MAX_CREATES_PER_WINDOW) {
    const waitSec = Math.ceil((entry.resetAt - now) / 1000);
    throw new TRPCError({
      code: "TOO_MANY_REQUESTS",
      message: `Rate limit exceeded. You can create ${MAX_CREATES_PER_WINDOW} sandboxes per 10 minutes. Try again in ${waitSec}s.`,
    });
  }
  entry.count++;
}

// Simple in-memory rate limiter for scans: max 10 scans per user per 5 minutes
const scanRateLimiter = new Map<number, { count: number; resetAt: number }>();
const MAX_SCANS_PER_WINDOW = 10;
const SCAN_WINDOW_MS = 5 * 60 * 1000;

function checkScanRateLimit(userId: number): void {
  const now = Date.now();
  const entry = scanRateLimiter.get(userId);
  if (!entry || now > entry.resetAt) {
    scanRateLimiter.set(userId, { count: 1, resetAt: now + SCAN_WINDOW_MS });
    return;
  }
  if (entry.count >= MAX_SCANS_PER_WINDOW) {
    const waitSec = Math.ceil((entry.resetAt - now) / 1000);
    throw new TRPCError({
      code: "TOO_MANY_REQUESTS",
      message: `Rate limit exceeded. Max ${MAX_SCANS_PER_WINDOW} scans per 5 minutes. Try again in ${waitSec}s.`,
    });
  }
  entry.count++;
}

// Validate URL: must be http/https, no localhost/private IPs
function validateTargetUrl(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid URL format" });
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "URL must use http or https protocol" });
  }
  const hostname = parsed.hostname.toLowerCase();
  const blocked = [
    'localhost', '127.0.0.1', '0.0.0.0', '::1',
    '169.254.169.254', // AWS metadata
    '10.', '172.16.', '172.17.', '172.18.', '172.19.',
    '172.20.', '172.21.', '172.22.', '172.23.', '172.24.',
    '172.25.', '172.26.', '172.27.', '172.28.', '172.29.',
    '172.30.', '172.31.', '192.168.',
  ];
  if (blocked.some(b => hostname === b || hostname.startsWith(b))) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Scanning internal/private addresses is not allowed" });
  }
}

async function getSandboxOrThrow(id: number, userId: number) {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

  const [sandbox] = await db
    .select()
    .from(sandboxEnvironments)
    .where(and(eq(sandboxEnvironments.id, id), eq(sandboxEnvironments.createdBy, userId)))
    .limit(1);

  if (!sandbox) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Sandbox not found or access denied" });
  }
  return { db, sandbox };
}

// ─── Router ───────────────────────────────────────────────────────────────────

export const sandboxRouter = router({

  // ── List all sandboxes for current user ─────────────────────────────────────
  list: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return [];

    const envs = await db
      .select()
      .from(sandboxEnvironments)
      .where(eq(sandboxEnvironments.createdBy, ctx.user.id))
      .orderBy(desc(sandboxEnvironments.createdAt));

    // Attach latest scan summary to each
    const result = await Promise.all(
      envs.map(async (env) => {
        const [latestScan] = await db
          .select()
          .from(sandboxScans)
          .where(eq(sandboxScans.sandboxId, env.id))
          .orderBy(desc(sandboxScans.createdAt))
          .limit(1);
        return { ...env, latestScan: latestScan ?? null };
      })
    );

    return result;
  }),

  // ── Get single sandbox with scans ───────────────────────────────────────────
  get: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input, ctx }) => {
      const { db, sandbox } = await getSandboxOrThrow(input.id, ctx.user.id);

      const scans = await db
        .select()
        .from(sandboxScans)
        .where(eq(sandboxScans.sandboxId, input.id))
        .orderBy(desc(sandboxScans.createdAt));

      return { ...sandbox, scans };
    }),

  // ── Detect technology stack (preview before creating) ───────────────────────
  detectTech: protectedProcedure
    .input(z.object({ url: z.string().url() }))
    .mutation(async ({ input }) => {
      const profile = await detectTechStack(input.url);
      return {
        profile,
        description: describeEnvironment(profile),
      };
    }),

  // ── Create sandbox (clone + detect + generate env) ──────────────────────────
  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(128),
        targetUrl: z.string().url(),
        deployType: z.enum(["manus_spaces", "local_download"]).default("local_download"),
        anonymize: z.boolean().default(true),
        autoScan: z.boolean().default(true),
        scanType: z
          .enum(["passive", "active", "xss", "sqli", "headers", "ssl", "csrf", "open_redirect", "full"])
          .default("passive"),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Security: validate URL and rate limit
      validateTargetUrl(input.targetUrl);
      checkCreateRateLimit(ctx.user.id);

      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      // Limit: max 20 active sandboxes per user
      const existing = await db
        .select({ id: sandboxEnvironments.id })
        .from(sandboxEnvironments)
        .where(eq(sandboxEnvironments.createdBy, ctx.user.id));
      if (existing.length >= 20) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Maximum 20 sandboxes per account. Please delete some before creating new ones.",
        });
      }

      // 1. Create sandbox record
      const [result] = await db.insert(sandboxEnvironments).values({
        name: input.name,
        targetUrl: input.targetUrl,
        status: "cloning",
        deployType: input.deployType,
        anonymized: input.anonymize,
        cloneProgress: 0,
        fileCount: 0,
        createdBy: ctx.user.id,
      });

      const sandboxId = (result as any).insertId as number;

      // 2. Run async pipeline (non-blocking — status updates via polling)
      setImmediate(async () => {
        try {
          // Step A: Detect tech stack
          await db
            .update(sandboxEnvironments)
            .set({ cloneProgress: 5, notes: "Detecting technology stack..." })
            .where(eq(sandboxEnvironments.id, sandboxId));

          const profile = await detectTechStack(input.targetUrl);
          const envDef = generateEnvironment(profile, sandboxId);

          await db
            .update(sandboxEnvironments)
            .set({
              cloneProgress: 10,
              notes: `Detected: ${envDef.stackLabel} (${profile.confidence}% confidence). Cloning site...`,
            })
            .where(eq(sandboxEnvironments.id, sandboxId));

          // Step B: Clone site
          const cloneResult = await cloneSite({
            targetUrl: input.targetUrl,
            sandboxId,
            anonymize: input.anonymize,
            onProgress: async (progress, message) => {
              await db
                .update(sandboxEnvironments)
                .set({ cloneProgress: 10 + Math.round(progress * 0.6), notes: message })
                .where(eq(sandboxEnvironments.id, sandboxId));
            },
          });

          if (!cloneResult.success) {
            await db
              .update(sandboxEnvironments)
              .set({ status: "error", notes: cloneResult.error ?? "Clone failed" })
              .where(eq(sandboxEnvironments.id, sandboxId));
            return;
          }

          // Step C: Write docker-compose + extra files
          const sandboxDir = path.join(SANDBOX_DIR, `sandbox-${sandboxId}`);
          await fs.mkdir(sandboxDir, { recursive: true });

          await fs.writeFile(
            path.join(sandboxDir, "docker-compose.yml"),
            envDef.dockerCompose,
            "utf-8"
          );

          await fs.writeFile(
            path.join(sandboxDir, "README.md"),
            envDef.readme,
            "utf-8"
          );

          for (const [filename, content] of Object.entries(envDef.extraFiles)) {
            const filePath = path.join(sandboxDir, filename);
            await fs.mkdir(path.dirname(filePath), { recursive: true });
            await fs.writeFile(filePath, content, "utf-8");
          }

          await db
            .update(sandboxEnvironments)
            .set({
              cloneProgress: 80,
              fileCount: cloneResult.fileCount,
              notes: `${envDef.stackLabel} environment ready. ${cloneResult.fileCount} files cloned.`,
            })
            .where(eq(sandboxEnvironments.id, sandboxId));

          // Step D: Spin up Docker environment (server-side, for manus_spaces)
          if (input.deployType === "manus_spaces") {
            await db
              .update(sandboxEnvironments)
              .set({ cloneProgress: 85, notes: `Starting ${envDef.stackLabel} Docker environment...` })
              .where(eq(sandboxEnvironments.id, sandboxId));

            const spinResult = await spinUpSandbox({
              sandboxId,
              tech: profile,
              ttlMs: 60 * 60 * 1000, // 1 hour TTL
              onProgress: async (msg) => {
                await db
                  .update(sandboxEnvironments)
                  .set({ notes: msg })
                  .where(eq(sandboxEnvironments.id, sandboxId))
                  .catch(() => {});
              },
            });

            if (spinResult.success) {
              await db
                .update(sandboxEnvironments)
                .set({
                  status: "ready",
                  cloneProgress: 100,
                  sandboxUrl: spinResult.sandboxUrl ?? null,
                  sandboxPort: spinResult.sandboxPort ?? null,
                  notes: `Live at ${spinResult.sandboxUrl} · Expires ${spinResult.expiresAt?.toLocaleString()} · Stack: ${envDef.stackLabel}`,
                })
                .where(eq(sandboxEnvironments.id, sandboxId));
            } else {
              // Spin-up failed — still mark ready for local use, note the error
              await db
                .update(sandboxEnvironments)
                .set({
                  status: "ready",
                  cloneProgress: 100,
                  notes: `Docker spin-up failed (${spinResult.error}). Files ready for local download.`,
                })
                .where(eq(sandboxEnvironments.id, sandboxId));
            }
          } else {
            // local_download: just mark ready, no server-side Docker
            await db
              .update(sandboxEnvironments)
              .set({
                status: "ready",
                cloneProgress: 100,
                notes: `Ready for download. Stack: ${envDef.stackLabel}. ${cloneResult.fileCount} files.`,
              })
              .where(eq(sandboxEnvironments.id, sandboxId));
          }

          // Step E: Auto-scan if requested
          if (input.autoScan) {
            await runSandboxScan(sandboxId, input.scanType, input.targetUrl, db);
          }
        } catch (err) {
          await db
            .update(sandboxEnvironments)
            .set({
              status: "error",
              notes: `Error: ${err instanceof Error ? err.message : String(err)}`,
            })
            .where(eq(sandboxEnvironments.id, sandboxId))
            .catch(() => {});
        }
      });

      return { sandboxId, message: "Sandbox creation started. Poll /sandbox.get for status." };
    }),

  // ── Delete sandbox ───────────────────────────────────────────────────────────
  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const { db } = await getSandboxOrThrow(input.id, ctx.user.id);

      // Tear down Docker containers (if running server-side) + delete files
      await teardownSandbox(input.id);
      // Also clean up any leftover files via the old helper
      await deleteSandboxFiles(input.id).catch(() => {});

      await db
        .delete(sandboxFindings)
        .where(eq(sandboxFindings.sandboxId, input.id));

      await db
        .delete(sandboxScans)
        .where(eq(sandboxScans.sandboxId, input.id));

      await db
        .delete(sandboxEnvironments)
        .where(eq(sandboxEnvironments.id, input.id));

      return { success: true };
    }),

  // ── Start a security scan ────────────────────────────────────────────────────
  startScan: protectedProcedure
    .input(
      z.object({
        sandboxId: z.number(),
        scanType: z
          .enum(["passive", "active", "xss", "sqli", "headers", "ssl", "csrf", "open_redirect", "full"])
          .default("passive"),
        targetUrl: z.string().url().optional(), // override sandbox URL
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Security: rate limit scans
      checkScanRateLimit(ctx.user.id);

      const { db, sandbox } = await getSandboxOrThrow(input.sandboxId, ctx.user.id);

      if (sandbox.status === "cloning") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Sandbox is still cloning. Wait for it to be ready." });
      }
      if (sandbox.status === "scanning") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "A scan is already running for this sandbox." });
      }

      const targetUrl = input.targetUrl ?? sandbox.sandboxUrl ?? sandbox.targetUrl;
      // Validate override URL if provided
      if (input.targetUrl) {
        validateTargetUrl(input.targetUrl);
      }

      // Create scan record
      const [scanResult] = await db.insert(sandboxScans).values({
        sandboxId: input.sandboxId,
        scanType: input.scanType,
        status: "pending",
      });
      const scanId = (scanResult as any).insertId as number;

      // Update sandbox status
      await db
        .update(sandboxEnvironments)
        .set({ status: "scanning" })
        .where(eq(sandboxEnvironments.id, input.sandboxId));

      // Run scan async
      setImmediate(async () => {
        await runSandboxScan(input.sandboxId, input.scanType, targetUrl, db, scanId);
      });

      return { scanId, message: "Scan started. Poll /sandbox.getScan for results." };
    }),

  // ── Get scan with findings ───────────────────────────────────────────────────
  getScan: protectedProcedure
    .input(z.object({ scanId: z.number(), sandboxId: z.number() }))
    .query(async ({ input, ctx }) => {
      await getSandboxOrThrow(input.sandboxId, ctx.user.id);

      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const [scan] = await db
        .select()
        .from(sandboxScans)
        .where(eq(sandboxScans.id, input.scanId))
        .limit(1);

      if (!scan) throw new TRPCError({ code: "NOT_FOUND", message: "Scan not found" });

      const findings = await db
        .select()
        .from(sandboxFindings)
        .where(eq(sandboxFindings.scanId, input.scanId))
        .orderBy(
          // Order by severity: critical first
          sandboxFindings.severity
        );

      return { ...scan, findings };
    }),

  // ── Get all findings for a sandbox ──────────────────────────────────────────
  getFindings: protectedProcedure
    .input(z.object({ sandboxId: z.number() }))
    .query(async ({ input, ctx }) => {
      await getSandboxOrThrow(input.sandboxId, ctx.user.id);

      const db = await getDb();
      if (!db) return [];

      return db
        .select()
        .from(sandboxFindings)
        .where(eq(sandboxFindings.sandboxId, input.sandboxId))
        .orderBy(desc(sandboxFindings.createdAt));
    }),

  // ── Extend TTL of a running sandbox ───────────────────────────────────────────
  extendTTL: protectedProcedure
    .input(z.object({ id: z.number(), extraMinutes: z.number().min(5).max(480).default(60) }))
    .mutation(async ({ input, ctx }) => {
      await getSandboxOrThrow(input.id, ctx.user.id);
      await extendSandboxTTL(input.id, input.extraMinutes * 60 * 1000);
      const expiry = await getSandboxExpiry(input.id);
      return { success: true, newExpiresAt: expiry };
    }),

  // ── Get container status for a sandbox ──────────────────────────────────────
  getContainerStatus: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input, ctx }) => {
      await getSandboxOrThrow(input.id, ctx.user.id);
      const status = await getSandboxContainerStatus(input.id);
      const expiry = await getSandboxExpiry(input.id);
      return { ...status, expiresAt: expiry };
    }),

  // ── Download sandbox as ZIP ──────────────────────────────────────────────────
  getDownloadPath: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const { sandbox } = await getSandboxOrThrow(input.id, ctx.user.id);

      if (sandbox.status === "cloning") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Sandbox not ready yet" });
      }

      const zipPath = await packageSandboxAsZip(input.id);
      return { zipPath, filename: `sentinel-sandbox-${input.id}.zip` };
    }),

  // ── Generate security report for a scan ─────────────────────────────────────
  generateReport: protectedProcedure
    .input(z.object({ scanId: z.number(), sandboxId: z.number(), format: z.enum(["html", "json"]).default("html") }))
    .mutation(async ({ input, ctx }) => {
      const { sandbox } = await getSandboxOrThrow(input.sandboxId, ctx.user.id);

      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const [scan] = await db
        .select()
        .from(sandboxScans)
        .where(eq(sandboxScans.id, input.scanId))
        .limit(1);

      if (!scan) throw new TRPCError({ code: "NOT_FOUND", message: "Scan not found" });
      if (scan.status !== "completed") throw new TRPCError({ code: "BAD_REQUEST", message: "Scan not completed yet" });

      const findings = await db
        .select()
        .from(sandboxFindings)
        .where(eq(sandboxFindings.scanId, input.scanId));

      const summary = (scan.summary as any) ?? { critical: 0, high: 0, medium: 0, low: 0, info: 0, total: 0 };

      // Build a ScanResult-compatible object from DB data
      const scanResult = {
        findings: findings.map((f) => ({
          id: String(f.id),
          severity: f.severity as any,
          category: f.category,
          title: f.title,
          description: f.description ?? "",
          evidence: f.evidence ?? undefined,
          affectedUrl: f.affectedUrl ?? undefined,
          remediation: f.remediation ?? "",
          cvssScore: f.cvssScore ?? undefined,
        })),
        summary,
        scanType: scan.scanType as any,
        targetUrl: sandbox.targetUrl,
        duration: scan.startedAt && scan.completedAt
          ? new Date(scan.completedAt).getTime() - new Date(scan.startedAt).getTime()
          : 0,
        startedAt: scan.startedAt ? new Date(scan.startedAt) : new Date(),
        completedAt: scan.completedAt ? new Date(scan.completedAt) : new Date(),
      };

      const report = generateReport(scanResult, sandbox.name, undefined);

      // Save report to disk
      const reportDir = path.join("/tmp/sandboxes", `sandbox-${input.sandboxId}`, "reports");
      await fs.mkdir(reportDir, { recursive: true });
      const ext = input.format === "json" ? "json" : "html";
      const filename = `sentinel-report-${input.sandboxId}-scan${input.scanId}.${ext}`;
      const reportPath = path.join(reportDir, filename);
      await fs.writeFile(reportPath, input.format === "json" ? report.json : report.html, "utf-8");

      return {
        filename,
        reportPath,
        summary: report.summary,
        format: input.format,
      };
    }),

  // ── Get risk score for a scan ────────────────────────────────────────────────
  getRiskScore: protectedProcedure
    .input(z.object({ scanId: z.number(), sandboxId: z.number() }))
    .query(async ({ input, ctx }) => {
      await getSandboxOrThrow(input.sandboxId, ctx.user.id);

      const db = await getDb();
      if (!db) return null;

      const [scan] = await db
        .select()
        .from(sandboxScans)
        .where(eq(sandboxScans.id, input.scanId))
        .limit(1);

      if (!scan || !scan.summary) return null;

      const s = scan.summary as any;
      const riskScore = Math.min(
        100,
        (s.critical ?? 0) * 20 + (s.high ?? 0) * 10 + (s.medium ?? 0) * 5 + (s.low ?? 0) * 2 + (s.info ?? 0) * 1
      );
      const riskLevel =
        riskScore >= 60 ? "Critical Risk" :
        riskScore >= 40 ? "High Risk" :
        riskScore >= 20 ? "Medium Risk" :
        riskScore >= 5  ? "Low Risk" : "Minimal Risk";

      return { riskScore, riskLevel, summary: s };
    }),

  // ─── Schedule management ──────────────────────────────────────────────────

  createSchedule: protectedProcedure
    .input(z.object({
      sandboxId: z.number(),
      schedule: z.enum(["daily", "weekly", "monthly"]),
      scanType: z.enum(["passive", "active", "xss", "sqli", "headers", "ssl", "csrf", "open_redirect", "full"]).default("passive"),
    }))
    .mutation(async ({ input, ctx }) => {
      await getSandboxOrThrow(input.sandboxId, ctx.user.id);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      // Deactivate any existing schedule for this sandbox
      await db
        .update(sandboxSchedules)
        .set({ isActive: false })
        .where(eq(sandboxSchedules.sandboxId, input.sandboxId));

      const intervalMs = input.schedule === "daily" ? 86400000 : input.schedule === "weekly" ? 604800000 : 2592000000;
      const nextRunAt = new Date(Date.now() + intervalMs);

      const [result] = await db
        .insert(sandboxSchedules)
        .values({
          sandboxId: input.sandboxId,
          userId: ctx.user.id,
          schedule: input.schedule,
          scanType: input.scanType,
          isActive: true,
          nextRunAt,
          runCount: 0,
        })
        .$returningId();

      return { scheduleId: result.id, nextRunAt };
    }),

  getSchedule: protectedProcedure
    .input(z.object({ sandboxId: z.number() }))
    .query(async ({ input, ctx }) => {
      await getSandboxOrThrow(input.sandboxId, ctx.user.id);
      const db = await getDb();
      if (!db) return null;

      const [schedule] = await db
        .select()
        .from(sandboxSchedules)
        .where(and(
          eq(sandboxSchedules.sandboxId, input.sandboxId),
          eq(sandboxSchedules.isActive, true)
        ))
        .limit(1);

      return schedule ?? null;
    }),

  deleteSchedule: protectedProcedure
    .input(z.object({ sandboxId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      await getSandboxOrThrow(input.sandboxId, ctx.user.id);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      await db
        .update(sandboxSchedules)
        .set({ isActive: false })
        .where(eq(sandboxSchedules.sandboxId, input.sandboxId));

      return { success: true };
    }),

  // ─── Scan Comparison ───────────────────────────────────────────────────────

  compareScans: protectedProcedure
    .input(z.object({
      sandboxId: z.number(),
      baselineScanId: z.number(),
      compareScanId: z.number(),
    }))
    .query(async ({ input, ctx }) => {
      await getSandboxOrThrow(input.sandboxId, ctx.user.id);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      // Load both scans
      const loadScan = async (scanId: number): Promise<ScanSnapshot> => {
        const [scan] = await db
          .select()
          .from(sandboxScans)
          .where(and(eq(sandboxScans.id, scanId), eq(sandboxScans.sandboxId, input.sandboxId)))
          .limit(1);
        if (!scan) throw new TRPCError({ code: "NOT_FOUND", message: "Scan not found: " + scanId });

        const findings = await db
          .select()
          .from(sandboxFindings)
          .where(eq(sandboxFindings.scanId, scanId));

        const summary = (scan.summary as { critical: number; high: number; medium: number; low: number; info: number; total: number }) ?? { critical: 0, high: 0, medium: 0, low: 0, info: 0, total: 0 };
        const riskScore = Math.min(100, summary.critical * 10 + summary.high * 5 + summary.medium * 2 + summary.low);

        return {
          scanId: scan.id,
          createdAt: scan.createdAt?.toISOString() ?? new Date().toISOString(),
          scanType: scan.scanType,
          riskScore,
          summary,
          findings: findings.map((f) => ({
            id: String(f.id),
            title: f.title,
            severity: f.severity as "critical" | "high" | "medium" | "low" | "info",
            category: f.category,
            affectedUrl: f.affectedUrl ?? undefined,
            cvssScore: f.cvssScore ?? undefined,
            cwe: undefined,
            owasp: undefined,
          })),
        };
      };

      const [baseline, compare] = await Promise.all([
        loadScan(input.baselineScanId),
        loadScan(input.compareScanId),
      ]);

      return compareScans(baseline, compare);
    }),

  getScanTrend: protectedProcedure
    .input(z.object({ sandboxId: z.number(), limit: z.number().min(2).max(20).default(10) }))
    .query(async ({ input, ctx }) => {
      await getSandboxOrThrow(input.sandboxId, ctx.user.id);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const scans = await db
        .select()
        .from(sandboxScans)
        .where(and(eq(sandboxScans.sandboxId, input.sandboxId), eq(sandboxScans.status, "completed")))
        .orderBy(desc(sandboxScans.createdAt))
        .limit(input.limit);

      const snapshots: ScanSnapshot[] = scans.map((s) => {
        const summary = (s.summary as { critical: number; high: number; medium: number; low: number; info: number; total: number }) ?? { critical: 0, high: 0, medium: 0, low: 0, info: 0, total: 0 };
        return {
          scanId: s.id,
          createdAt: s.createdAt?.toISOString() ?? new Date().toISOString(),
          scanType: s.scanType,
          riskScore: Math.min(100, summary.critical * 10 + summary.high * 5 + summary.medium * 2 + summary.low),
          summary,
          findings: [],
        };
      });

      return buildTrendSeries(snapshots);
    }),
});

// ─── Shared scan runner (used by create + startScan) ─────────────────────────

async function runSandboxScan(
  sandboxId: number,
  scanType: string,
  targetUrl: string,
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  existingScanId?: number
) {
  let scanId = existingScanId;

  try {
    // Create scan record if not provided
    if (!scanId) {
      const [r] = await db.insert(sandboxScans).values({
        sandboxId,
        scanType: scanType as any,
        status: "running",
        startedAt: new Date(),
      });
      scanId = (r as any).insertId as number;
    } else {
      await db
        .update(sandboxScans)
        .set({ status: "running", startedAt: new Date() })
        .where(eq(sandboxScans.id, scanId));
    }

    // Run the scan
    const result = await runScan(targetUrl, scanType as any);

    // Persist findings
    if (result.findings.length > 0) {
      await db.insert(sandboxFindings).values(
        result.findings.map((f) => ({
          scanId: scanId!,
          sandboxId,
          severity: f.severity,
          category: f.category,
          title: f.title,
          description: f.description ?? null,
          evidence: f.evidence ?? null,
          affectedUrl: f.affectedUrl ?? null,
          remediation: f.remediation,
          cvssScore: f.cvssScore ?? null,
        }))
      );
    }

    // Update scan record
    await db
      .update(sandboxScans)
      .set({
        status: "completed",
        completedAt: new Date(),
        summary: result.summary,
      })
      .where(eq(sandboxScans.id, scanId!));

    // Update sandbox status
    await db
      .update(sandboxEnvironments)
      .set({ status: "completed" })
      .where(eq(sandboxEnvironments.id, sandboxId));

    // Send in-app notification to sandbox owner
    try {
      const [env] = await db
        .select({ createdBy: sandboxEnvironments.createdBy, name: sandboxEnvironments.name })
        .from(sandboxEnvironments)
        .where(eq(sandboxEnvironments.id, sandboxId))
        .limit(1);

      if (env) {
        const critical = result.summary.critical;
        const high = result.summary.high;
        const total = result.summary.total;
        const hasCritical = critical > 0;
        const severity = hasCritical ? "error" : high > 0 ? "warning" : total > 0 ? "info" : "success";
        const title = hasCritical
          ? `⚠️ Critical vulnerabilities found in "${env.name}"`
          : high > 0
          ? `Security scan completed — ${high} high severity issue(s) in "${env.name}"`
          : total > 0
          ? `Security scan completed — ${total} finding(s) in "${env.name}"`
          : `Security scan completed — no issues found in "${env.name}"`;

        const body = `Scan type: ${scanType}. Found: ${critical} critical, ${high} high, ${result.summary.medium} medium, ${result.summary.low} low, ${result.summary.info} info. Total: ${total} finding(s).`;

        await createNotification({
          userId: env.createdBy,
          type: "security",
          severity,
          title,
          body,
          link: `/sandbox/${sandboxId}`,
          sourceId: scanId ?? undefined,
          sourceType: "sandbox_scan",
        });
      }
    } catch {
      // Notification failure should not break scan result
    }
  } catch (err) {
    if (scanId) {
      await db
        .update(sandboxScans)
        .set({
          status: "failed",
          completedAt: new Date(),
        })
        .where(eq(sandboxScans.id, scanId))
        .catch(() => {});
    }

    await db
      .update(sandboxEnvironments)
      .set({ status: "error" })
      .where(eq(sandboxEnvironments.id, sandboxId))
      .catch(() => {});
  }
}
