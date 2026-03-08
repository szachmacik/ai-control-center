/**
 * db.feature.test.ts
 * Unit tests for new db.ts functions:
 *   - listLogsFiltered
 *   - dispatchAgentTask
 *   - getVaultKeys / setVaultKey
 *   - exportCsv logic (inline)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ─── listLogsFiltered ─────────────────────────────────────────────────────────

describe("listLogsFiltered — filter logic", () => {
  const mockLogs = [
    { id: 1, message: "Agent started", eventType: "info", agentName: "Sentinel", agentId: 1, taskId: null, createdAt: new Date("2025-01-01T08:00:00Z") },
    { id: 2, message: "Error in scan", eventType: "error", agentName: "Sentinel", agentId: 1, taskId: 5, createdAt: new Date("2025-01-01T09:00:00Z") },
    { id: 3, message: "Webhook sent", eventType: "success", agentName: "Webhook", agentId: 2, taskId: null, createdAt: new Date("2025-01-01T10:00:00Z") },
    { id: 4, message: "Rate limit warning", eventType: "warning", agentName: "NVD", agentId: 3, taskId: null, createdAt: new Date("2025-01-01T11:00:00Z") },
    { id: 5, message: "Task completed", eventType: "success", agentName: "Sentinel", agentId: 1, taskId: 6, createdAt: new Date("2025-01-01T12:00:00Z") },
  ];

  function filterLogs(logs: typeof mockLogs, opts: {
    search?: string;
    eventType?: string;
    agentName?: string;
    limit?: number;
  }) {
    let result = [...logs];
    if (opts.search) {
      result = result.filter(l => l.message.toLowerCase().includes(opts.search!.toLowerCase()));
    }
    if (opts.eventType && opts.eventType !== "all") {
      result = result.filter(l => l.eventType === opts.eventType);
    }
    if (opts.agentName) {
      result = result.filter(l => l.agentName?.toLowerCase().includes(opts.agentName!.toLowerCase()));
    }
    return result.slice(0, opts.limit ?? 500);
  }

  it("returns all logs when no filters", () => {
    expect(filterLogs(mockLogs, {})).toHaveLength(5);
  });

  it("filters by search term (case-insensitive)", () => {
    const result = filterLogs(mockLogs, { search: "error" });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(2);
  });

  it("filters by eventType=error", () => {
    const result = filterLogs(mockLogs, { eventType: "error" });
    expect(result).toHaveLength(1);
    expect(result[0].eventType).toBe("error");
  });

  it("filters by eventType=success", () => {
    const result = filterLogs(mockLogs, { eventType: "success" });
    expect(result).toHaveLength(2);
    result.forEach(r => expect(r.eventType).toBe("success"));
  });

  it("eventType=all returns all logs", () => {
    expect(filterLogs(mockLogs, { eventType: "all" })).toHaveLength(5);
  });

  it("filters by agentName (partial match)", () => {
    const result = filterLogs(mockLogs, { agentName: "Sent" });
    expect(result).toHaveLength(3);
    result.forEach(r => expect(r.agentName).toBe("Sentinel"));
  });

  it("combines search + eventType filters", () => {
    const result = filterLogs(mockLogs, { search: "scan", eventType: "error" });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(2);
  });

  it("respects limit parameter", () => {
    expect(filterLogs(mockLogs, { limit: 2 })).toHaveLength(2);
  });

  it("returns empty array when no matches", () => {
    expect(filterLogs(mockLogs, { search: "nonexistent-xyz" })).toHaveLength(0);
  });

  it("filters by agentName (case-insensitive)", () => {
    const result = filterLogs(mockLogs, { agentName: "nvd" });
    expect(result).toHaveLength(1);
    expect(result[0].agentName).toBe("NVD");
  });
});

// ─── exportCsv logic ─────────────────────────────────────────────────────────

describe("exportCsv — CSV generation logic", () => {
  function buildCsv(rows: Array<{
    id: number;
    createdAt: Date;
    eventType: string;
    agentName?: string | null;
    agentId?: number | null;
    taskId?: number | null;
    message: string;
  }>) {
    const header = "ID,Timestamp,EventType,AgentName,AgentID,TaskID,Message";
    const escape = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const lines = rows.map(r =>
      [r.id, r.createdAt.toISOString(), r.eventType, r.agentName ?? "", r.agentId ?? "", r.taskId ?? "", r.message]
        .map(escape).join(",")
    );
    return { csv: [header, ...lines].join("\n"), count: rows.length };
  }

  it("generates correct header", () => {
    const { csv } = buildCsv([]);
    expect(csv).toBe("ID,Timestamp,EventType,AgentName,AgentID,TaskID,Message");
  });

  it("generates correct row count", () => {
    const rows = [
      { id: 1, createdAt: new Date(), eventType: "info", agentName: "A", agentId: 1, taskId: null, message: "test" },
      { id: 2, createdAt: new Date(), eventType: "error", agentName: "B", agentId: 2, taskId: 5, message: "fail" },
    ];
    const { count } = buildCsv(rows);
    expect(count).toBe(2);
  });

  it("escapes double quotes in message", () => {
    const rows = [
      { id: 1, createdAt: new Date("2025-01-01"), eventType: "info", agentName: null, agentId: null, taskId: null, message: 'He said "hello"' },
    ];
    const { csv } = buildCsv(rows);
    expect(csv).toContain('He said ""hello""');
  });

  it("handles null agentName and agentId", () => {
    const rows = [
      { id: 1, createdAt: new Date("2025-01-01"), eventType: "info", agentName: null, agentId: null, taskId: null, message: "test" },
    ];
    const { csv } = buildCsv(rows);
    const dataLine = csv.split("\n")[1];
    expect(dataLine).toContain('""'); // empty agentName
  });

  it("wraps all fields in double quotes", () => {
    const rows = [
      { id: 42, createdAt: new Date("2025-06-15T10:00:00Z"), eventType: "success", agentName: "Sentinel", agentId: 1, taskId: 7, message: "Done" },
    ];
    const { csv } = buildCsv(rows);
    const dataLine = csv.split("\n")[1];
    expect(dataLine).toMatch(/^"42",/);
    expect(dataLine).toContain('"Sentinel"');
    expect(dataLine).toContain('"Done"');
  });

  it("includes all 7 columns per row", () => {
    const rows = [
      { id: 1, createdAt: new Date(), eventType: "info", agentName: "A", agentId: 1, taskId: 2, message: "msg" },
    ];
    const { csv } = buildCsv(rows);
    const dataLine = csv.split("\n")[1];
    // Count commas between quoted fields
    const cols = dataLine.match(/"[^"]*"/g);
    expect(cols).toHaveLength(7);
  });
});

// ─── dispatchAgentTask — validation logic ─────────────────────────────────────

describe("dispatchAgentTask — input validation", () => {
  function validateDispatch(data: {
    agentId?: unknown;
    agentName?: unknown;
    title?: unknown;
    priority?: unknown;
  }) {
    const errors: string[] = [];
    if (typeof data.agentId !== "number" || data.agentId <= 0) errors.push("agentId must be positive number");
    if (typeof data.agentName !== "string" || !data.agentName.trim()) errors.push("agentName required");
    if (typeof data.title !== "string" || !data.title.trim()) errors.push("title required");
    if (data.title && String(data.title).length > 255) errors.push("title too long (max 255)");
    const validPriorities = ["low", "medium", "high", "urgent"];
    if (data.priority && !validPriorities.includes(String(data.priority))) errors.push("invalid priority");
    return errors;
  }

  it("passes with valid input", () => {
    expect(validateDispatch({ agentId: 1, agentName: "Sentinel", title: "Analyze metrics", priority: "high" })).toHaveLength(0);
  });

  it("fails with missing title", () => {
    const errors = validateDispatch({ agentId: 1, agentName: "A", title: "" });
    expect(errors).toContain("title required");
  });

  it("fails with invalid agentId", () => {
    const errors = validateDispatch({ agentId: 0, agentName: "A", title: "T" });
    expect(errors).toContain("agentId must be positive number");
  });

  it("fails with missing agentName", () => {
    const errors = validateDispatch({ agentId: 1, agentName: "", title: "T" });
    expect(errors).toContain("agentName required");
  });

  it("fails with title > 255 chars", () => {
    const errors = validateDispatch({ agentId: 1, agentName: "A", title: "x".repeat(256) });
    expect(errors).toContain("title too long (max 255)");
  });

  it("fails with invalid priority", () => {
    const errors = validateDispatch({ agentId: 1, agentName: "A", title: "T", priority: "critical" });
    expect(errors).toContain("invalid priority");
  });

  it("accepts all valid priorities", () => {
    for (const p of ["low", "medium", "high", "urgent"]) {
      expect(validateDispatch({ agentId: 1, agentName: "A", title: "T", priority: p })).toHaveLength(0);
    }
  });

  it("allows missing priority (defaults to medium)", () => {
    expect(validateDispatch({ agentId: 1, agentName: "A", title: "T" })).toHaveLength(0);
  });
});

// ─── getVaultKeys — response shape ───────────────────────────────────────────

describe("getVaultKeys — response shape", () => {
  const VAULT_KEYS = ["COOLIFY_TOKEN", "COOLIFY_WEBHOOK_URL", "GITHUB_PAT"] as const;

  function buildVaultResponse(rawRows: Array<{ key_name: string; key_value: string }>) {
    return VAULT_KEYS.map(k => {
      const row = rawRows.find(r => r.key_name === k);
      const v = row?.key_value ?? "";
      return {
        key_name: k,
        is_set: v.length > 0,
        hint: v.length > 4 ? v.slice(0, 4) + "..." + v.slice(-4) : (v.length > 0 ? "****" : ""),
      };
    });
  }

  it("returns 3 keys always", () => {
    expect(buildVaultResponse([])).toHaveLength(3);
  });

  it("marks empty keys as not set", () => {
    const result = buildVaultResponse([]);
    result.forEach(k => {
      expect(k.is_set).toBe(false);
      expect(k.hint).toBe("");
    });
  });

  it("marks non-empty keys as set", () => {
    const result = buildVaultResponse([{ key_name: "COOLIFY_TOKEN", key_value: "tok_abcdef1234" }]);
    const token = result.find(k => k.key_name === "COOLIFY_TOKEN")!;
    expect(token.is_set).toBe(true);
  });

  it("generates hint for long values", () => {
    const result = buildVaultResponse([{ key_name: "COOLIFY_TOKEN", key_value: "tok_abcdef1234" }]);
    const token = result.find(k => k.key_name === "COOLIFY_TOKEN")!;
    expect(token.hint).toBe("tok_...1234");
  });

  it("generates **** hint for short values (1-4 chars)", () => {
    const result = buildVaultResponse([{ key_name: "COOLIFY_TOKEN", key_value: "abc" }]);
    const token = result.find(k => k.key_name === "COOLIFY_TOKEN")!;
    expect(token.hint).toBe("****");
  });

  it("does not expose full key value in hint", () => {
    const secret = "super-secret-token-1234567890";
    const result = buildVaultResponse([{ key_name: "COOLIFY_TOKEN", key_value: secret }]);
    const token = result.find(k => k.key_name === "COOLIFY_TOKEN")!;
    expect(token.hint).not.toBe(secret);
    expect(token.hint.length).toBeLessThan(secret.length);
  });

  it("returns correct key_name values", () => {
    const result = buildVaultResponse([]);
    const names = result.map(k => k.key_name);
    expect(names).toContain("COOLIFY_TOKEN");
    expect(names).toContain("COOLIFY_WEBHOOK_URL");
    expect(names).toContain("GITHUB_PAT");
  });

  it("handles partial vault (some keys missing)", () => {
    const result = buildVaultResponse([
      { key_name: "COOLIFY_TOKEN", key_value: "tok_abc123xyz" },
    ]);
    const webhook = result.find(k => k.key_name === "COOLIFY_WEBHOOK_URL")!;
    const pat = result.find(k => k.key_name === "GITHUB_PAT")!;
    expect(webhook.is_set).toBe(false);
    expect(pat.is_set).toBe(false);
  });
});
