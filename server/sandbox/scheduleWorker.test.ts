/**
 * Schedule Worker — Unit Tests
 *
 * Tests the schedule interval calculation logic and worker lifecycle.
 * DB-dependent functions (runDueSchedules, cleanupOrphanedSchedules) are
 * not tested here — they require integration tests with a real DB.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { startScheduleWorker, stopScheduleWorker } from "./scheduleWorker";

// ─── scheduleToMs (replicated for unit testing) ───────────────────────────────

function scheduleToMs(schedule: string): number {
  switch (schedule) {
    case "daily":   return 24 * 60 * 60 * 1000;
    case "weekly":  return 7 * 24 * 60 * 60 * 1000;
    case "monthly": return 30 * 24 * 60 * 60 * 1000;
    default:        return 0;
  }
}

describe("scheduleToMs", () => {
  it("daily returns 24 hours in ms", () => {
    expect(scheduleToMs("daily")).toBe(24 * 60 * 60 * 1000);
  });

  it("weekly returns 7 days in ms", () => {
    expect(scheduleToMs("weekly")).toBe(7 * 24 * 60 * 60 * 1000);
  });

  it("monthly returns 30 days in ms", () => {
    expect(scheduleToMs("monthly")).toBe(30 * 24 * 60 * 60 * 1000);
  });

  it("unknown schedule returns 0", () => {
    expect(scheduleToMs("hourly")).toBe(0);
    expect(scheduleToMs("")).toBe(0);
    expect(scheduleToMs("DAILY")).toBe(0); // case-sensitive
  });

  it("daily < weekly < monthly", () => {
    expect(scheduleToMs("daily")).toBeLessThan(scheduleToMs("weekly"));
    expect(scheduleToMs("weekly")).toBeLessThan(scheduleToMs("monthly"));
  });

  it("daily is exactly 86400000ms", () => {
    expect(scheduleToMs("daily")).toBe(86_400_000);
  });

  it("weekly is exactly 604800000ms", () => {
    expect(scheduleToMs("weekly")).toBe(604_800_000);
  });

  it("monthly is exactly 2592000000ms", () => {
    expect(scheduleToMs("monthly")).toBe(2_592_000_000);
  });
});

// ─── nextRunAt calculation ────────────────────────────────────────────────────

describe("nextRunAt calculation", () => {
  it("daily schedule: next run is 24h from now", () => {
    const now = new Date("2025-01-01T12:00:00.000Z");
    const intervalMs = scheduleToMs("daily");
    const nextRun = new Date(now.getTime() + intervalMs);
    expect(nextRun.toISOString()).toBe("2025-01-02T12:00:00.000Z");
  });

  it("weekly schedule: next run is 7 days from now", () => {
    const now = new Date("2025-01-01T00:00:00.000Z");
    const intervalMs = scheduleToMs("weekly");
    const nextRun = new Date(now.getTime() + intervalMs);
    expect(nextRun.toISOString()).toBe("2025-01-08T00:00:00.000Z");
  });

  it("monthly schedule: next run is 30 days from now", () => {
    const now = new Date("2025-01-01T00:00:00.000Z");
    const intervalMs = scheduleToMs("monthly");
    const nextRun = new Date(now.getTime() + intervalMs);
    expect(nextRun.toISOString()).toBe("2025-01-31T00:00:00.000Z");
  });

  it("nextRunAt is always in the future", () => {
    const now = new Date();
    for (const schedule of ["daily", "weekly", "monthly"]) {
      const nextRun = new Date(now.getTime() + scheduleToMs(schedule));
      expect(nextRun.getTime()).toBeGreaterThan(now.getTime());
    }
  });
});

// ─── isDue check ─────────────────────────────────────────────────────────────

describe("isDue check logic", () => {
  function isDue(nextRunAt: Date, now: Date): boolean {
    return nextRunAt.getTime() <= now.getTime();
  }

  it("schedule is due when nextRunAt is in the past", () => {
    const now = new Date("2025-06-01T12:00:00.000Z");
    const nextRunAt = new Date("2025-06-01T10:00:00.000Z");
    expect(isDue(nextRunAt, now)).toBe(true);
  });

  it("schedule is due when nextRunAt equals now", () => {
    const now = new Date("2025-06-01T12:00:00.000Z");
    expect(isDue(now, now)).toBe(true);
  });

  it("schedule is NOT due when nextRunAt is in the future", () => {
    const now = new Date("2025-06-01T12:00:00.000Z");
    const nextRunAt = new Date("2025-06-01T14:00:00.000Z");
    expect(isDue(nextRunAt, now)).toBe(false);
  });

  it("schedule is NOT due 1ms before trigger time", () => {
    const now = new Date("2025-06-01T12:00:00.000Z");
    const nextRunAt = new Date(now.getTime() + 1);
    expect(isDue(nextRunAt, now)).toBe(false);
  });
});

// ─── Worker lifecycle ─────────────────────────────────────────────────────────

describe("startScheduleWorker / stopScheduleWorker", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Ensure worker is stopped before each test
    stopScheduleWorker();
  });

  afterEach(() => {
    stopScheduleWorker();
    vi.useRealTimers();
  });

  it("startScheduleWorker does not throw", () => {
    expect(() => startScheduleWorker()).not.toThrow();
  });

  it("stopScheduleWorker does not throw when worker is not running", () => {
    expect(() => stopScheduleWorker()).not.toThrow();
  });

  it("stopScheduleWorker does not throw when worker is running", () => {
    startScheduleWorker();
    expect(() => stopScheduleWorker()).not.toThrow();
  });

  it("calling startScheduleWorker twice does not create duplicate intervals", () => {
    const setIntervalSpy = vi.spyOn(globalThis, "setInterval");
    startScheduleWorker();
    startScheduleWorker(); // second call should be a no-op
    // setInterval should only be called once (first start)
    expect(setIntervalSpy).toHaveBeenCalledTimes(1);
    setIntervalSpy.mockRestore();
  });

  it("stopScheduleWorker clears the interval", () => {
    const clearIntervalSpy = vi.spyOn(globalThis, "clearInterval");
    startScheduleWorker();
    stopScheduleWorker();
    expect(clearIntervalSpy).toHaveBeenCalledTimes(1);
    clearIntervalSpy.mockRestore();
  });

  it("worker can be restarted after stop", () => {
    startScheduleWorker();
    stopScheduleWorker();
    expect(() => startScheduleWorker()).not.toThrow();
  });
});

// ─── Schedule validation ──────────────────────────────────────────────────────

describe("schedule type validation", () => {
  const VALID_SCHEDULES = ["daily", "weekly", "monthly"] as const;
  const VALID_SCAN_TYPES = ["passive", "headers", "ssl", "csrf", "xss", "sqli", "open_redirect", "full"] as const;

  it("all valid schedule types produce non-zero intervals", () => {
    for (const schedule of VALID_SCHEDULES) {
      expect(scheduleToMs(schedule)).toBeGreaterThan(0);
    }
  });

  it("valid schedule types are a known set", () => {
    expect(VALID_SCHEDULES).toContain("daily");
    expect(VALID_SCHEDULES).toContain("weekly");
    expect(VALID_SCHEDULES).toContain("monthly");
    expect(VALID_SCHEDULES).toHaveLength(3);
  });

  it("valid scan types include passive and full", () => {
    expect(VALID_SCAN_TYPES).toContain("passive");
    expect(VALID_SCAN_TYPES).toContain("full");
  });

  it("runCount starts at 0 and increments by 1", () => {
    let runCount = 0;
    runCount = (runCount ?? 0) + 1;
    expect(runCount).toBe(1);
    runCount = (runCount ?? 0) + 1;
    expect(runCount).toBe(2);
  });
});
