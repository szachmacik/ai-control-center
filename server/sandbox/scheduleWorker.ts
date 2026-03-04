/**
 * Sentinel — Schedule Worker
 * Runs recurring security scans based on user-defined schedules.
 * Checks every hour for sandboxes that need a new scan.
 */

import { getDb } from "../db";
import { sandboxEnvironments, sandboxScans, sandboxSchedules } from "../../drizzle/schema";
import { eq, and, lte } from "drizzle-orm";
import { runScan } from "./scanner";

const SCHEDULE_INTERVAL_MS = 60 * 60 * 1000; // check every hour

// ─── Schedule interval in ms ──────────────────────────────────────────────────

function scheduleToMs(schedule: string): number {
  switch (schedule) {
    case "daily":   return 24 * 60 * 60 * 1000;
    case "weekly":  return 7 * 24 * 60 * 60 * 1000;
    case "monthly": return 30 * 24 * 60 * 60 * 1000;
    default:        return 0;
  }
}

// ─── Run due scheduled scans ──────────────────────────────────────────────────

async function runDueSchedules(): Promise<void> {
  const now = new Date();
  const db = await getDb();
  if (!db) return;

  try {
    // Find all active schedules where next_run_at <= now
    const dueSchedules = await db
      .select()
      .from(sandboxSchedules)
      .where(
        and(
          eq(sandboxSchedules.isActive, true),
          lte(sandboxSchedules.nextRunAt, now)
        )
      );

    if (dueSchedules.length === 0) return;

    console.log(`[ScheduleWorker] Found ${dueSchedules.length} due schedule(s)`);

    for (const schedule of dueSchedules) {
      try {
        // Get the sandbox
        const [sandbox] = await db
          .select()
          .from(sandboxEnvironments)
          .where(eq(sandboxEnvironments.id, schedule.sandboxId))
          .limit(1);

        if (!sandbox) {
          // Sandbox deleted — deactivate schedule
          const db2 = await getDb();
          if (!db2) continue;
          await db2
            .update(sandboxSchedules)
            .set({ isActive: false })
            .where(eq(sandboxSchedules.id, schedule.id));
          continue;
        }

        if (sandbox.status !== "ready") {
        // Sandbox not ready — skip this run, update next_run_at
        const intervalMs = scheduleToMs(schedule.schedule);
        const nextRun = new Date(now.getTime() + intervalMs);
        await (await getDb())!
            .update(sandboxSchedules)
            .set({ nextRunAt: nextRun, lastRunAt: now })
            .where(eq(sandboxSchedules.id, schedule.id));
          continue;
        }

        // Check if there's already a running scan for this sandbox
        const [runningScan] = await db
          .select()
          .from(sandboxScans)
          .where(
            and(
              eq(sandboxScans.sandboxId, schedule.sandboxId),
              eq(sandboxScans.status, "running")
            )
          )
          .limit(1);

        if (runningScan) {
          // Already scanning — skip, try again next cycle
          continue;
        }

        // Create a new scan record
        const [newScan] = await db
          .insert(sandboxScans)
          .values({
            sandboxId: schedule.sandboxId,
            scanType: schedule.scanType as any,
            status: "running",
            startedAt: now,
          })
          .$returningId();

        const scanId = newScan.id;

        console.log(`[ScheduleWorker] Starting scheduled scan ${scanId} for sandbox ${schedule.sandboxId} (${schedule.schedule})`);

        // Run scan asynchronously (fire and forget — results saved to DB)
        runScan(
          sandbox.sandboxUrl ?? sandbox.targetUrl,
          schedule.scanType as any,
          async (progress: number, _msg: string) => {
            const dbInner = await getDb();
            if (dbInner) {
              await dbInner
                .update(sandboxScans)
                .set({ progress } as any)
                .where(eq(sandboxScans.id, scanId));
            }
          }
        )
          .then(async (result) => {
            const dbAfter = await getDb();
            if (dbAfter) {
              await dbAfter
                .update(sandboxScans)
                .set({
                  status: "completed",
                  completedAt: new Date(),
                  summary: result.summary as any,
                } as any)
                .where(eq(sandboxScans.id, scanId));
            }
            console.log(`[ScheduleWorker] Scan ${scanId} completed: ${JSON.stringify(result.summary)}`);
          })
          .catch(async (err) => {
            const dbAfter = await getDb();
            if (dbAfter) {
              await dbAfter
                .update(sandboxScans)
                .set({
                  status: "failed",
                  completedAt: new Date(),
                } as any)
                .where(eq(sandboxScans.id, scanId));
            }
            console.error(`[ScheduleWorker] Scan ${scanId} failed:`, err);
          });

        // Update schedule: set last_run_at and compute next_run_at
        const intervalMs = scheduleToMs(schedule.schedule);
        const nextRun = new Date(now.getTime() + intervalMs);

        await db
          .update(sandboxSchedules)
          .set({
            lastRunAt: now,
            nextRunAt: nextRun,
            runCount: (schedule.runCount ?? 0) + 1,
          })
          .where(eq(sandboxSchedules.id, schedule.id));

      } catch (err) {
        console.error(`[ScheduleWorker] Error processing schedule ${schedule.id}:`, err);
      }
    }
  } catch (err) {
    console.error("[ScheduleWorker] Error fetching due schedules:", err);
  }
}

// ─── Cleanup stale schedules for deleted sandboxes ────────────────────────────

async function cleanupOrphanedSchedules(): Promise<void> {
  const db = await getDb();
  if (!db) return;
  try {
    // Find schedules whose sandbox no longer exists
    const allSchedules = await db
      .select({ id: sandboxSchedules.id, sandboxId: sandboxSchedules.sandboxId })
      .from(sandboxSchedules)
      .where(eq(sandboxSchedules.isActive, true));

    for (const schedule of allSchedules) {
      const [sandbox] = await db
        .select({ id: sandboxEnvironments.id })
        .from(sandboxEnvironments)
        .where(eq(sandboxEnvironments.id, schedule.sandboxId))
        .limit(1);

      if (!sandbox) {
        await db
          .update(sandboxSchedules)
          .set({ isActive: false })
          .where(eq(sandboxSchedules.id, schedule.id));
      }
    }
  } catch (err) {
    console.error("[ScheduleWorker] Error cleaning orphaned schedules:", err);
  }
}

// ─── Worker start ─────────────────────────────────────────────────────────────

let workerInterval: NodeJS.Timeout | null = null;

export function startScheduleWorker(): void {
  if (workerInterval) return; // already running

  console.log("[ScheduleWorker] Starting — checking every hour for due scans");

  // Run immediately on startup
  runDueSchedules().catch(console.error);
  cleanupOrphanedSchedules().catch(console.error);

  // Then run every hour
  workerInterval = setInterval(() => {
    runDueSchedules().catch(console.error);
    // Cleanup orphans once per day (every 24 cycles)
    const hour = new Date().getHours();
    if (hour === 3) {
      cleanupOrphanedSchedules().catch(console.error);
    }
  }, SCHEDULE_INTERVAL_MS);
}

export function stopScheduleWorker(): void {
  if (workerInterval) {
    clearInterval(workerInterval);
    workerInterval = null;
    console.log("[ScheduleWorker] Stopped");
  }
}
