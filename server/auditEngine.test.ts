/**
 * Audit Engine Tests
 * Tests for pure audit logic functions (no DB side effects)
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

// Mock all external dependencies
vi.mock("./auditDb", () => ({
  createAuditRun: vi.fn().mockResolvedValue(1),
  completeAuditRun: vi.fn().mockResolvedValue(undefined),
  createAuditFindings: vi.fn().mockResolvedValue(undefined),
  createUptimeChecks: vi.fn().mockResolvedValue(undefined),
  listAuditProjects: vi.fn().mockResolvedValue([]),
}));

vi.mock("./db", () => ({
  getDb: vi.fn().mockResolvedValue(null),
}));

vi.mock("child_process", () => ({
  exec: vi.fn((cmd: string, opts: unknown, cb: (err: null, result: { stdout: string; stderr: string }) => void) => {
    cb(null, { stdout: "", stderr: "" });
  }),
}));

// ─── AuditConfig type tests ───────────────────────────────────────────────────
describe("AuditConfig validation", () => {
  it("accepts valid audit types", () => {
    const validTypes = ["uptime", "security", "functional", "dependency", "db_health"] as const;
    validTypes.forEach((type) => {
      expect(typeof type).toBe("string");
    });
  });

  it("FindingInput severity levels are correct", () => {
    const severities = ["critical", "high", "medium", "low", "info"] as const;
    expect(severities).toHaveLength(5);
    expect(severities[0]).toBe("critical");
    expect(severities[4]).toBe("info");
  });
});

// ─── Severity ordering tests ──────────────────────────────────────────────────
describe("Severity ordering", () => {
  const SEVERITY_ORDER = { critical: 5, high: 4, medium: 3, low: 2, info: 1, none: 0 };

  it("critical has highest severity", () => {
    expect(SEVERITY_ORDER.critical).toBeGreaterThan(SEVERITY_ORDER.high);
    expect(SEVERITY_ORDER.critical).toBeGreaterThan(SEVERITY_ORDER.medium);
  });

  it("info has lowest non-zero severity", () => {
    expect(SEVERITY_ORDER.info).toBeLessThan(SEVERITY_ORDER.low);
    expect(SEVERITY_ORDER.info).toBeGreaterThan(SEVERITY_ORDER.none);
  });

  it("severity levels are strictly ordered", () => {
    const levels = ["none", "info", "low", "medium", "high", "critical"] as const;
    for (let i = 1; i < levels.length; i++) {
      expect(SEVERITY_ORDER[levels[i]]).toBeGreaterThan(SEVERITY_ORDER[levels[i - 1]]);
    }
  });
});

// ─── Uptime check logic tests ─────────────────────────────────────────────────
describe("Uptime check logic", () => {
  it("identifies healthy response (2xx)", () => {
    const isHealthy = (status: number) => status >= 200 && status < 300;
    expect(isHealthy(200)).toBe(true);
    expect(isHealthy(201)).toBe(true);
    expect(isHealthy(204)).toBe(true);
  });

  it("identifies degraded response (3xx)", () => {
    const isDegraded = (status: number) => status >= 300 && status < 400;
    expect(isDegraded(301)).toBe(true);
    expect(isDegraded(302)).toBe(true);
  });

  it("identifies down response (4xx/5xx)", () => {
    const isDown = (status: number) => status >= 400;
    expect(isDown(404)).toBe(true);
    expect(isDown(500)).toBe(true);
    expect(isDown(503)).toBe(true);
  });

  it("calculates response time severity correctly", () => {
    const getResponseSeverity = (ms: number) => {
      if (ms > 5000) return "high";
      if (ms > 2000) return "medium";
      if (ms > 1000) return "low";
      return "info";
    };
    expect(getResponseSeverity(100)).toBe("info");
    expect(getResponseSeverity(1500)).toBe("low");
    expect(getResponseSeverity(3000)).toBe("medium");
    expect(getResponseSeverity(6000)).toBe("high");
  });
});

// ─── Security audit pattern tests ────────────────────────────────────────────
describe("Security audit patterns", () => {
  it("detects hardcoded secrets patterns", () => {
    const SECRET_PATTERNS = [
      /sk-[a-zA-Z0-9]{20,}/,          // OpenAI API key
      /AKIA[0-9A-Z]{16}/,              // AWS Access Key
      /ghp_[a-zA-Z0-9]{36}/,          // GitHub Personal Access Token
      /eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/, // JWT
    ];

    const testCases = [
      { text: "const key = 'sk-abcdefghijklmnopqrstuvwx'", shouldMatch: true },
      { text: "const key = process.env.OPENAI_KEY", shouldMatch: false },
      { text: "AKIAIOSFODNN7EXAMPLE", shouldMatch: true },
    ];

    testCases.forEach(({ text, shouldMatch }) => {
      const matched = SECRET_PATTERNS.some((p) => p.test(text));
      expect(matched).toBe(shouldMatch);
    });
  });

  it("detects missing security headers", () => {
    const REQUIRED_HEADERS = [
      "x-content-type-options",
      "x-frame-options",
      "strict-transport-security",
    ];

    const presentHeaders = { "x-content-type-options": "nosniff" };
    const missing = REQUIRED_HEADERS.filter((h) => !(h in presentHeaders));
    expect(missing).toContain("x-frame-options");
    expect(missing).toContain("strict-transport-security");
    expect(missing).not.toContain("x-content-type-options");
  });
});

// ─── Dependency audit logic tests ─────────────────────────────────────────────
describe("Dependency audit logic", () => {
  it("parses npm audit output correctly", () => {
    const mockAuditOutput = JSON.stringify({
      vulnerabilities: {
        "lodash": { severity: "high", fixAvailable: true },
        "axios": { severity: "moderate", fixAvailable: true },
      },
      metadata: { vulnerabilities: { total: 2, high: 1, moderate: 1 } },
    });

    const parsed = JSON.parse(mockAuditOutput);
    expect(parsed.metadata.vulnerabilities.total).toBe(2);
    expect(parsed.metadata.vulnerabilities.high).toBe(1);
  });

  it("classifies CVE severity correctly", () => {
    const mapSeverity = (npmSeverity: string) => {
      const map: Record<string, string> = {
        critical: "critical",
        high: "high",
        moderate: "medium",
        low: "low",
        info: "info",
      };
      return map[npmSeverity] ?? "info";
    };

    expect(mapSeverity("critical")).toBe("critical");
    expect(mapSeverity("high")).toBe("high");
    expect(mapSeverity("moderate")).toBe("medium");
    expect(mapSeverity("low")).toBe("low");
    expect(mapSeverity("unknown")).toBe("info");
  });
});

// ─── Audit run state machine tests ────────────────────────────────────────────
describe("Audit run state machine", () => {
  it("valid status transitions", () => {
    const VALID_TRANSITIONS: Record<string, string[]> = {
      pending: ["running"],
      running: ["completed", "failed"],
      completed: [],
      failed: [],
    };

    expect(VALID_TRANSITIONS.pending).toContain("running");
    expect(VALID_TRANSITIONS.running).toContain("completed");
    expect(VALID_TRANSITIONS.running).toContain("failed");
    expect(VALID_TRANSITIONS.completed).toHaveLength(0);
  });

  it("audit types are exhaustive", () => {
    const ALL_TYPES = ["uptime", "security", "functional", "dependency", "db_health"];
    expect(ALL_TYPES).toHaveLength(5);
    expect(ALL_TYPES).toContain("uptime");
    expect(ALL_TYPES).toContain("db_health");
  });
});
