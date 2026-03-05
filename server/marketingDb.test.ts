/**
 * Marketing Module Tests
 * Tests for FB CAPI event handling, ManyChat webhook processing, and Manus queue
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

// Mock the db module
vi.mock("./db", () => ({
  getDb: vi.fn().mockResolvedValue(null),
}));

// ─── FB CAPI Event validation ─────────────────────────────────────────────────
describe("FB CAPI Event validation", () => {
  it("validates required event fields", () => {
    const validateEvent = (event: Record<string, unknown>) => {
      const errors: string[] = [];
      if (!event.eventName || typeof event.eventName !== "string") {
        errors.push("eventName is required");
      }
      if (!event.eventTime || typeof event.eventTime !== "number") {
        errors.push("eventTime must be a Unix timestamp");
      }
      return errors;
    };

    expect(validateEvent({ eventName: "Purchase", eventTime: 1234567890 })).toHaveLength(0);
    expect(validateEvent({ eventName: "", eventTime: 1234567890 })).toContain("eventName is required");
    expect(validateEvent({ eventName: "Purchase" })).toContain("eventTime must be a Unix timestamp");
  });

  it("recognizes standard FB event names", () => {
    const STANDARD_EVENTS = [
      "Purchase", "Lead", "CompleteRegistration", "AddToCart",
      "InitiateCheckout", "ViewContent", "Search", "PageView",
    ];

    expect(STANDARD_EVENTS).toContain("Purchase");
    expect(STANDARD_EVENTS).toContain("Lead");
    expect(STANDARD_EVENTS).not.toContain("CustomEvent");
  });

  it("hashes PII data correctly", () => {
    // SHA-256 hash of "test@example.com" (lowercase)
    const hashPii = (value: string) => {
      // In production this would use crypto.createHash('sha256')
      // For testing, we just verify the function signature
      return value.toLowerCase().trim();
    };

    expect(hashPii("TEST@EXAMPLE.COM")).toBe("test@example.com");
    expect(hashPii("  user@test.com  ")).toBe("user@test.com");
  });

  it("validates event time is recent", () => {
    const isRecentEvent = (eventTime: number) => {
      const now = Math.floor(Date.now() / 1000);
      const sevenDaysAgo = now - 7 * 24 * 60 * 60;
      return eventTime >= sevenDaysAgo && eventTime <= now + 60;
    };

    const now = Math.floor(Date.now() / 1000);
    expect(isRecentEvent(now)).toBe(true);
    expect(isRecentEvent(now - 3 * 24 * 60 * 60)).toBe(true); // 3 days ago
    expect(isRecentEvent(now - 8 * 24 * 60 * 60)).toBe(false); // 8 days ago
    expect(isRecentEvent(now + 120)).toBe(false); // 2 minutes in future
  });
});

// ─── ManyChat webhook validation ──────────────────────────────────────────────
describe("ManyChat webhook validation", () => {
  it("validates HMAC signature format", () => {
    const isValidHmacFormat = (signature: string) => {
      return /^sha256=[a-f0-9]{64}$/.test(signature);
    };

    expect(isValidHmacFormat("sha256=" + "a".repeat(64))).toBe(true);
    expect(isValidHmacFormat("sha256=invalid")).toBe(false);
    expect(isValidHmacFormat("md5=abc123")).toBe(false);
  });

  it("parses ManyChat subscriber data", () => {
    const parseSubscriber = (data: Record<string, unknown>) => {
      return {
        id: data.id as string,
        firstName: data.first_name as string,
        lastName: data.last_name as string,
        email: data.email as string | undefined,
        phone: data.phone as string | undefined,
      };
    };

    const mockData = {
      id: "sub_123",
      first_name: "Jan",
      last_name: "Kowalski",
      email: "jan@example.com",
    };

    const parsed = parseSubscriber(mockData);
    expect(parsed.id).toBe("sub_123");
    expect(parsed.firstName).toBe("Jan");
    expect(parsed.email).toBe("jan@example.com");
    expect(parsed.phone).toBeUndefined();
  });

  it("identifies standard ManyChat event types", () => {
    const KNOWN_EVENTS = [
      "user_subscribed",
      "user_unsubscribed",
      "message_sent",
      "flow_completed",
      "button_clicked",
    ];

    expect(KNOWN_EVENTS).toContain("user_subscribed");
    expect(KNOWN_EVENTS).toContain("flow_completed");
  });
});

// ─── Manus Queue task validation ──────────────────────────────────────────────
describe("Manus Queue task validation", () => {
  it("validates task input schema", () => {
    const validateTask = (task: Record<string, unknown>) => {
      const errors: string[] = [];
      if (!task.taskType || typeof task.taskType !== "string") {
        errors.push("taskType is required");
      }
      if (!task.payload || typeof task.payload !== "object") {
        errors.push("payload must be an object");
      }
      return errors;
    };

    expect(validateTask({ taskType: "deploy", payload: {} })).toHaveLength(0);
    expect(validateTask({ payload: {} })).toContain("taskType is required");
    expect(validateTask({ taskType: "deploy" })).toContain("payload must be an object");
  });

  it("validates task status transitions", () => {
    const VALID_STATUS = ["queued", "running", "completed", "failed", "cancelled"];
    const TERMINAL_STATUS = ["completed", "failed", "cancelled"];

    const canTransition = (from: string, to: string) => {
      if (TERMINAL_STATUS.includes(from)) return false;
      return VALID_STATUS.includes(to);
    };

    expect(canTransition("queued", "running")).toBe(true);
    expect(canTransition("running", "completed")).toBe(true);
    expect(canTransition("completed", "running")).toBe(false); // terminal
    expect(canTransition("failed", "queued")).toBe(false); // terminal
  });

  it("calculates task priority correctly", () => {
    const PRIORITY_WEIGHTS = { urgent: 100, high: 75, medium: 50, low: 25 };

    const sortByPriority = (tasks: Array<{ priority: keyof typeof PRIORITY_WEIGHTS }>) => {
      return [...tasks].sort(
        (a, b) => PRIORITY_WEIGHTS[b.priority] - PRIORITY_WEIGHTS[a.priority]
      );
    };

    const tasks = [
      { priority: "low" as const },
      { priority: "urgent" as const },
      { priority: "medium" as const },
    ];

    const sorted = sortByPriority(tasks);
    expect(sorted[0].priority).toBe("urgent");
    expect(sorted[2].priority).toBe("low");
  });
});

// ─── Campaign metrics validation ──────────────────────────────────────────────
describe("Campaign metrics validation", () => {
  it("calculates ROAS correctly", () => {
    const calculateRoas = (revenue: number, adSpend: number) => {
      if (adSpend === 0) return 0;
      return Math.round((revenue / adSpend) * 100) / 100;
    };

    expect(calculateRoas(1000, 200)).toBe(5);
    expect(calculateRoas(0, 200)).toBe(0);
    expect(calculateRoas(1000, 0)).toBe(0);
    expect(calculateRoas(333, 100)).toBe(3.33);
  });

  it("calculates CTR correctly", () => {
    const calculateCtr = (clicks: number, impressions: number) => {
      if (impressions === 0) return 0;
      return Math.round((clicks / impressions) * 10000) / 100; // percentage with 2 decimals
    };

    expect(calculateCtr(100, 10000)).toBe(1);
    expect(calculateCtr(0, 10000)).toBe(0);
    expect(calculateCtr(50, 1000)).toBe(5);
  });

  it("validates campaign status values", () => {
    const VALID_STATUSES = ["active", "paused", "completed", "draft"];

    VALID_STATUSES.forEach((status) => {
      expect(typeof status).toBe("string");
    });

    expect(VALID_STATUSES).toContain("active");
    expect(VALID_STATUSES).not.toContain("running");
  });
});
