/**
 * Security Sandbox — Cleanup Worker
 *
 * Background job that runs inside the Express server process.
 * Responsibilities:
 *   1. On startup: recover orphaned containers (from previous crash/restart)
 *   2. Every N minutes: scan DB for expired/completed sandboxes and tear them down
 *   3. Stale scan recovery: mark scans stuck in "running" for >30min as failed
 *   4. Disk quota guard: if /tmp/sandboxes exceeds limit, teardown oldest sandboxes
 *
 * This is intentionally simple (no external queue/Redis) — runs in-process.
 * For high-scale deployments, replace with a proper job queue (BullMQ, etc.)
 */

import { teardownSandbox, isSandboxExpired, CLEANUP_INTERVAL_MS } from "./lifecycle";
import { getDb } from "../db";
import { sandboxEnvironments, sandboxScans } from "../../drizzle/schema";
import { eq, inArray, lt, and, or } from "drizzle-orm";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

/** Max disk usage for /tmp/sandboxes in bytes (default: 5 GB) */
const MAX_DISK_BYTES = parseInt(process.env.SANDBOX_MAX_DISK_MB ?? "5120") * 1024 * 1024;

/** Sandboxes older than this are force-deleted even if not expired (safety net) */
const MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

/** Scans stuck in "running" for longer than this are marked failed */
const STALE_SCAN_THRESHOLD_MS = 30 * 60 * 1000; // 30 minutes

let workerInterval: ReturnType<typeof setInterval> | null = null;
let isRunning = false;

// ─── Start / Stop ─────────────────────────────────────────────────────────────

/**
 * Start the cleanup worker. Call once at server startup.
 * Safe to call multiple times — idempotent.
 */
export function startCleanupWorker(): void {
  if (workerInterval) return; // already running

  console.log("[SandboxCleanup] Worker starting...");

  // Run immediately on startup (recover from crashes)
  runCleanupCycle().catch(err =>
    console.error("[SandboxCleanup] Startup cycle error:", err)
  );

  // Then run on interval
  workerInterval = setInterval(() => {
    runCleanupCycle().catch(err =>
      console.error("[SandboxCleanup] Interval cycle error:", err)
    );
  }, CLEANUP_INTERVAL_MS);

  // Don't keep Node.js alive just for this interval
  if (workerInterval.unref) workerInterval.unref();

  console.log(`[SandboxCleanup] Worker started (interval: ${CLEANUP_INTERVAL_MS / 1000}s)`);
}

/** Stop the cleanup worker gracefully */
export function stopCleanupWorker(): void {
  if (workerInterval) {
    clearInterval(workerInterval);
    workerInterval = null;
    console.log("[SandboxCleanup] Worker stopped");
  }
}

// ─── Main Cleanup Cycle ───────────────────────────────────────────────────────

async function runCleanupCycle(): Promise<void> {
  if (isRunning) {
    console.log("[SandboxCleanup] Previous cycle still running, skipping");
    return;
  }
  isRunning = true;

  try {
    await Promise.all([
      cleanupExpiredSandboxes(),
      cleanupStaleSandboxes(),
      recoverStaleScans(),
      enforceDiskQuota(),
    ]);
  } catch (err) {
    console.error("[SandboxCleanup] Cycle error:", err);
  } finally {
    isRunning = false;
  }
}

// ─── Expired Sandboxes ────────────────────────────────────────────────────────

/**
 * Find sandboxes in "ready" or "completed" status whose TTL has expired,
 * tear them down, and update DB status.
 */
async function cleanupExpiredSandboxes(): Promise<void> {
  const db = await getDb();
  if (!db) return;

  // Get all non-deleted sandboxes that could be running server-side
  const candidates = await db
    .select({ id: sandboxEnvironments.id, status: sandboxEnvironments.status, createdAt: sandboxEnvironments.createdAt })
    .from(sandboxEnvironments)
    .where(
      inArray(sandboxEnvironments.status, ["ready", "completed", "scanning"])
    );

  const toTeardown: number[] = [];

  for (const sandbox of candidates) {
    // Check TTL from meta file
    const expired = await isSandboxExpired(sandbox.id);
    if (expired) {
      toTeardown.push(sandbox.id);
      continue;
    }

    // Safety net: force-teardown sandboxes older than MAX_AGE_MS
    const ageMs = Date.now() - new Date(sandbox.createdAt).getTime();
    if (ageMs > MAX_AGE_MS) {
      console.log(`[SandboxCleanup] Force-teardown sandbox ${sandbox.id} (age: ${Math.round(ageMs / 3600000)}h)`);
      toTeardown.push(sandbox.id);
    }
  }

  for (const id of toTeardown) {
    await teardownAndMarkDeleted(id, "TTL expired");
  }

  if (toTeardown.length > 0) {
    console.log(`[SandboxCleanup] Tore down ${toTeardown.length} expired sandbox(es)`);
  }
}

// ─── Stale Sandboxes (stuck in cloning/error) ─────────────────────────────────

/**
 * Sandboxes stuck in "cloning" for >30 minutes are considered failed.
 * Mark them as "error" and clean up files.
 */
async function cleanupStaleSandboxes(): Promise<void> {
  const db = await getDb();
  if (!db) return;

  const staleThreshold = new Date(Date.now() - STALE_SCAN_THRESHOLD_MS);

  const stale = await db
    .select({ id: sandboxEnvironments.id })
    .from(sandboxEnvironments)
    .where(
      and(
        eq(sandboxEnvironments.status, "cloning"),
        lt(sandboxEnvironments.createdAt, staleThreshold)
      )
    );

  for (const { id } of stale) {
    console.log(`[SandboxCleanup] Marking stale sandbox ${id} as error`);
    await db
      .update(sandboxEnvironments)
      .set({ status: "error", notes: "Timed out during cloning" })
      .where(eq(sandboxEnvironments.id, id));
    // Clean up any partial files
    await teardownSandbox(id).catch(() => {});
  }
}

// ─── Stale Scans ──────────────────────────────────────────────────────────────

/**
 * Scans stuck in "running" for >30 minutes are marked as failed.
 */
async function recoverStaleScans(): Promise<void> {
  const db = await getDb();
  if (!db) return;

  const staleThreshold = new Date(Date.now() - STALE_SCAN_THRESHOLD_MS);

  await db
    .update(sandboxScans)
    .set({ status: "failed", completedAt: new Date() })
    .where(
      and(
        eq(sandboxScans.status, "running"),
        lt(sandboxScans.startedAt, staleThreshold)
      )
    );
}

// ─── Disk Quota ───────────────────────────────────────────────────────────────

/**
 * If /tmp/sandboxes exceeds MAX_DISK_BYTES, tear down oldest sandboxes
 * until we're back under the limit.
 */
async function enforceDiskQuota(): Promise<void> {
  try {
    const { stdout } = await execAsync(
      `du -sb /tmp/sandboxes 2>/dev/null | awk '{print $1}' || echo "0"`,
      { timeout: 10_000 }
    );
    const usedBytes = parseInt(stdout.trim(), 10) || 0;

    if (usedBytes <= MAX_DISK_BYTES) return;

    console.warn(
      `[SandboxCleanup] Disk quota exceeded: ${Math.round(usedBytes / 1024 / 1024)}MB / ${Math.round(MAX_DISK_BYTES / 1024 / 1024)}MB`
    );

    const db = await getDb();
    if (!db) return;

    // Get sandboxes ordered by oldest first
    const all = await db
      .select({ id: sandboxEnvironments.id, createdAt: sandboxEnvironments.createdAt })
      .from(sandboxEnvironments)
      .where(
        inArray(sandboxEnvironments.status, ["ready", "completed", "error"])
      );

    // Sort oldest first
    all.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

    for (const { id } of all) {
      await teardownAndMarkDeleted(id, "Disk quota exceeded");
      // Re-check disk usage
      const { stdout: newUsage } = await execAsync(
        `du -sb /tmp/sandboxes 2>/dev/null | awk '{print $1}' || echo "0"`,
        { timeout: 5000 }
      );
      if ((parseInt(newUsage.trim(), 10) || 0) <= MAX_DISK_BYTES) break;
    }
  } catch (err) {
    console.error("[SandboxCleanup] Disk quota check error:", err);
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function teardownAndMarkDeleted(sandboxId: number, reason: string): Promise<void> {
  console.log(`[SandboxCleanup] Tearing down sandbox ${sandboxId}: ${reason}`);

  // Tear down Docker containers and files
  const result = await teardownSandbox(sandboxId);

  // Update DB
  const db = await getDb();
  if (db) {
    await db
      .update(sandboxEnvironments)
      .set({
        status: "error",
        sandboxUrl: null,
        sandboxPort: null,
        notes: `Auto-deleted: ${reason} at ${new Date().toISOString()}`,
      })
      .where(eq(sandboxEnvironments.id, sandboxId))
      .catch(() => {});
  }

  if (!result.success) {
    console.error(`[SandboxCleanup] Teardown error for sandbox ${sandboxId}:`, result.error);
  }
}
