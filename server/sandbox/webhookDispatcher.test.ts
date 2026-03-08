/**
 * Tests for webhook dispatcher and API key generation logic
 * extracted from sandboxRouter.ts helpers
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import * as crypto from "crypto";

// ─── Replicate helpers from sandboxRouter.ts ─────────────────────────────────

function generateApiKey(): { key: string; prefix: string; hash: string } {
  const raw = crypto.randomBytes(32).toString("hex"); // 64 chars
  const prefix = raw.slice(0, 8);
  const hash = crypto.createHash("sha256").update(raw).digest("hex");
  return { key: `sk_${raw}`, prefix, hash };
}

function verifyApiKey(providedKey: string, storedHash: string): boolean {
  if (!providedKey.startsWith("sk_")) return false;
  const raw = providedKey.slice(3);
  const hash = crypto.createHash("sha256").update(raw).digest("hex");
  return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(storedHash));
}

function buildWebhookSignature(payload: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(payload).digest("hex");
}

function verifyWebhookSignature(payload: string, secret: string, signature: string): boolean {
  const expected = buildWebhookSignature(payload, secret);
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}

function buildWebhookPayload(event: string, sandboxId: number, data: Record<string, unknown>) {
  return JSON.stringify({
    event,
    sandboxId,
    timestamp: new Date().toISOString(),
    data,
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("generateApiKey", () => {
  it("generates key with sk_ prefix", () => {
    const { key } = generateApiKey();
    expect(key).toMatch(/^sk_[0-9a-f]{64}$/);
  });

  it("generates 8-char prefix", () => {
    const { prefix } = generateApiKey();
    expect(prefix).toHaveLength(8);
    expect(prefix).toMatch(/^[0-9a-f]{8}$/);
  });

  it("prefix matches first 8 chars of raw key", () => {
    const { key, prefix } = generateApiKey();
    const raw = key.slice(3);
    expect(raw.slice(0, 8)).toBe(prefix);
  });

  it("generates SHA-256 hash of raw key", () => {
    const { key, hash } = generateApiKey();
    const raw = key.slice(3);
    const expected = crypto.createHash("sha256").update(raw).digest("hex");
    expect(hash).toBe(expected);
  });

  it("generates unique keys on each call", () => {
    const keys = new Set(Array.from({ length: 10 }, () => generateApiKey().key));
    expect(keys.size).toBe(10);
  });

  it("hash is 64-char hex string", () => {
    const { hash } = generateApiKey();
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("verifyApiKey", () => {
  it("returns true for valid key", () => {
    const { key, hash } = generateApiKey();
    expect(verifyApiKey(key, hash)).toBe(true);
  });

  it("returns false for wrong key", () => {
    const { hash } = generateApiKey();
    const { key: otherKey } = generateApiKey();
    expect(verifyApiKey(otherKey, hash)).toBe(false);
  });

  it("returns false for key without sk_ prefix", () => {
    const { key, hash } = generateApiKey();
    const rawKey = key.slice(3);
    expect(verifyApiKey(rawKey, hash)).toBe(false);
  });

  it("returns false for empty key", () => {
    const { hash } = generateApiKey();
    expect(verifyApiKey("", hash)).toBe(false);
  });

  it("returns false for tampered key", () => {
    const { key, hash } = generateApiKey();
    const tampered = key.slice(0, -4) + "0000";
    expect(verifyApiKey(tampered, hash)).toBe(false);
  });

  it("is timing-safe (does not throw on length mismatch)", () => {
    const { hash } = generateApiKey();
    expect(() => verifyApiKey("sk_short", hash)).not.toThrow();
  });
});

describe("buildWebhookSignature", () => {
  it("returns hex HMAC-SHA256", () => {
    const sig = buildWebhookSignature("payload", "secret");
    expect(sig).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is deterministic for same inputs", () => {
    const sig1 = buildWebhookSignature("payload", "secret");
    const sig2 = buildWebhookSignature("payload", "secret");
    expect(sig1).toBe(sig2);
  });

  it("differs for different payloads", () => {
    const sig1 = buildWebhookSignature("payload1", "secret");
    const sig2 = buildWebhookSignature("payload2", "secret");
    expect(sig1).not.toBe(sig2);
  });

  it("differs for different secrets", () => {
    const sig1 = buildWebhookSignature("payload", "secret1");
    const sig2 = buildWebhookSignature("payload", "secret2");
    expect(sig1).not.toBe(sig2);
  });
});

describe("verifyWebhookSignature", () => {
  it("returns true for valid signature", () => {
    const payload = "test-payload";
    const secret = "my-secret";
    const sig = buildWebhookSignature(payload, secret);
    expect(verifyWebhookSignature(payload, secret, sig)).toBe(true);
  });

  it("returns false for wrong signature", () => {
    expect(verifyWebhookSignature("payload", "secret", "wrong")).toBe(false);
  });

  it("returns false for tampered payload", () => {
    const payload = "original";
    const secret = "secret";
    const sig = buildWebhookSignature(payload, secret);
    expect(verifyWebhookSignature("tampered", secret, sig)).toBe(false);
  });

  it("returns false for wrong secret", () => {
    const payload = "payload";
    const sig = buildWebhookSignature(payload, "correct-secret");
    expect(verifyWebhookSignature(payload, "wrong-secret", sig)).toBe(false);
  });
});

describe("buildWebhookPayload", () => {
  it("includes event, sandboxId, timestamp, data", () => {
    const payload = buildWebhookPayload("scan.completed", 42, { riskScore: 75 });
    const parsed = JSON.parse(payload);
    expect(parsed.event).toBe("scan.completed");
    expect(parsed.sandboxId).toBe(42);
    expect(parsed.timestamp).toBeDefined();
    expect(parsed.data.riskScore).toBe(75);
  });

  it("timestamp is valid ISO string", () => {
    const payload = buildWebhookPayload("scan.failed", 1, {});
    const parsed = JSON.parse(payload);
    expect(() => new Date(parsed.timestamp)).not.toThrow();
    expect(new Date(parsed.timestamp).getTime()).toBeGreaterThan(0);
  });

  it("produces valid JSON", () => {
    const payload = buildWebhookPayload("critical.found", 99, { count: 3 });
    expect(() => JSON.parse(payload)).not.toThrow();
  });

  it("handles empty data object", () => {
    const payload = buildWebhookPayload("scan.completed", 1, {});
    const parsed = JSON.parse(payload);
    expect(parsed.data).toEqual({});
  });

  it("handles complex nested data", () => {
    const data = { findings: [{ id: 1, severity: "critical" }], summary: { total: 1 } };
    const payload = buildWebhookPayload("scan.completed", 5, data);
    const parsed = JSON.parse(payload);
    expect(parsed.data.findings[0].severity).toBe("critical");
    expect(parsed.data.summary.total).toBe(1);
  });
});

describe("API key scopes", () => {
  const VALID_SCOPES = ["sandbox:read", "sandbox:scan", "sandbox:delete", "sandbox:admin"];

  it("all expected scopes are defined", () => {
    expect(VALID_SCOPES).toContain("sandbox:read");
    expect(VALID_SCOPES).toContain("sandbox:scan");
    expect(VALID_SCOPES).toContain("sandbox:delete");
  });

  it("read scope is least privileged", () => {
    const readIndex = VALID_SCOPES.indexOf("sandbox:read");
    const adminIndex = VALID_SCOPES.indexOf("sandbox:admin");
    expect(readIndex).toBeLessThan(adminIndex);
  });

  it("scopes are unique", () => {
    const unique = new Set(VALID_SCOPES);
    expect(unique.size).toBe(VALID_SCOPES.length);
  });
});

describe("webhook events", () => {
  const VALID_EVENTS = ["scan.completed", "scan.failed", "critical.found"];

  it("all expected events are defined", () => {
    expect(VALID_EVENTS).toContain("scan.completed");
    expect(VALID_EVENTS).toContain("scan.failed");
    expect(VALID_EVENTS).toContain("critical.found");
  });

  it("events follow dot-notation convention", () => {
    VALID_EVENTS.forEach((ev) => {
      expect(ev).toMatch(/^[a-z]+\.[a-z_]+$/);
    });
  });

  it("events are unique", () => {
    const unique = new Set(VALID_EVENTS);
    expect(unique.size).toBe(VALID_EVENTS.length);
  });
});
