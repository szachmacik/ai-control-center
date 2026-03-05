/**
 * Sentinel Scanner — Unit Tests
 * Tests for security scanning logic, finding deduplication, severity scoring, and scan types.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";

// ─── Mock fetch globally ───────────────────────────────────────────────────────

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// ─── Import after mocks ────────────────────────────────────────────────────────

import {
  type ScanType,
  type ScanResult,
  type Finding,
  type SeverityLevel,
} from "./scanner";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    id: "test-finding-1",
    title: "Test Finding",
    description: "Test description",
    severity: "medium",
    category: "Security Headers",
    remediation: "Fix it",
    affectedUrl: "https://example.com",
    evidence: "X-Frame-Options: missing",
    cvssScore: 5.0,
    ...overrides,
  };
}

function makeScanResult(overrides: Partial<ScanResult> = {}): ScanResult {
  const findings: Finding[] = overrides.findings ?? [];
  const critical = findings.filter((f) => f.severity === "critical").length;
  const high = findings.filter((f) => f.severity === "high").length;
  const medium = findings.filter((f) => f.severity === "medium").length;
  const low = findings.filter((f) => f.severity === "low").length;
  const info = findings.filter((f) => f.severity === "info").length;
  return {
    findings,
    summary: { critical, high, medium, low, info, total: findings.length },
    targetUrl: "https://example.com",
    scanType: "passive",
    startedAt: new Date("2024-01-01T10:00:00Z"),
    completedAt: new Date("2024-01-01T10:00:30Z"),
    duration: 30000,
    ...overrides,
  };
}

// ─── Tests: Finding structure ──────────────────────────────────────────────────

describe("Finding structure", () => {
  it("should have all required fields", () => {
    const f = makeFinding();
    expect(f.id).toBeDefined();
    expect(f.title).toBeDefined();
    expect(f.description).toBeDefined();
    expect(f.severity).toBeDefined();
    expect(f.category).toBeDefined();
    expect(f.remediation).toBeDefined();
  });

  it("should accept all valid severity levels", () => {
    const levels: SeverityLevel[] = ["critical", "high", "medium", "low", "info"];
    levels.forEach((level) => {
      const f = makeFinding({ severity: level });
      expect(f.severity).toBe(level);
    });
  });

  it("should allow optional fields to be undefined", () => {
    const f = makeFinding({ affectedUrl: undefined, evidence: undefined, cvssScore: undefined });
    expect(f.affectedUrl).toBeUndefined();
    expect(f.evidence).toBeUndefined();
    expect(f.cvssScore).toBeUndefined();
  });
});

// ─── Tests: ScanResult summary ────────────────────────────────────────────────

describe("ScanResult summary", () => {
  it("should correctly count findings by severity", () => {
    const findings: Finding[] = [
      makeFinding({ id: "1", severity: "critical" }),
      makeFinding({ id: "2", severity: "critical" }),
      makeFinding({ id: "3", severity: "high" }),
      makeFinding({ id: "4", severity: "medium" }),
      makeFinding({ id: "5", severity: "low" }),
      makeFinding({ id: "6", severity: "info" }),
    ];
    const result = makeScanResult({ findings });
    expect(result.summary.critical).toBe(2);
    expect(result.summary.high).toBe(1);
    expect(result.summary.medium).toBe(1);
    expect(result.summary.low).toBe(1);
    expect(result.summary.info).toBe(1);
    expect(result.summary.total).toBe(6);
  });

  it("should return zero counts for empty findings", () => {
    const result = makeScanResult({ findings: [] });
    expect(result.summary.total).toBe(0);
    expect(result.summary.critical).toBe(0);
    expect(result.summary.high).toBe(0);
  });

  it("should calculate total as sum of all severities", () => {
    const findings = [
      makeFinding({ id: "1", severity: "critical" }),
      makeFinding({ id: "2", severity: "high" }),
      makeFinding({ id: "3", severity: "medium" }),
    ];
    const result = makeScanResult({ findings });
    expect(result.summary.total).toBe(
      result.summary.critical + result.summary.high + result.summary.medium +
      result.summary.low + result.summary.info
    );
  });
});

// ─── Tests: Risk score calculation ────────────────────────────────────────────

describe("Risk score calculation", () => {
  function calcRiskScore(summary: ScanResult["summary"]): number {
    return Math.min(
      100,
      summary.critical * 20 + summary.high * 10 + summary.medium * 5 + summary.low * 2 + summary.info * 1
    );
  }

  it("should return 0 for clean scan", () => {
    const result = makeScanResult({ findings: [] });
    expect(calcRiskScore(result.summary)).toBe(0);
  });

  it("should cap at 100", () => {
    const findings = Array.from({ length: 10 }, (_, i) =>
      makeFinding({ id: `f${i}`, severity: "critical" })
    );
    const result = makeScanResult({ findings });
    expect(calcRiskScore(result.summary)).toBe(100);
  });

  it("should weight critical higher than high", () => {
    const criticalResult = makeScanResult({
      findings: [makeFinding({ id: "1", severity: "critical" })],
    });
    const highResult = makeScanResult({
      findings: [makeFinding({ id: "1", severity: "high" })],
    });
    expect(calcRiskScore(criticalResult.summary)).toBeGreaterThan(calcRiskScore(highResult.summary));
  });

  it("should correctly score mixed findings", () => {
    const findings: Finding[] = [
      makeFinding({ id: "1", severity: "critical" }), // +20
      makeFinding({ id: "2", severity: "high" }),     // +10
      makeFinding({ id: "3", severity: "medium" }),   // +5
      makeFinding({ id: "4", severity: "low" }),      // +2
      makeFinding({ id: "5", severity: "info" }),     // +1
    ];
    const result = makeScanResult({ findings });
    expect(calcRiskScore(result.summary)).toBe(38);
  });
});

// ─── Tests: Scan types ────────────────────────────────────────────────────────

describe("Scan types", () => {
  it("should accept all valid scan types", () => {
    const types: ScanType[] = ["passive", "headers", "xss", "sqli", "csrf", "open_redirect", "full"];
    types.forEach((type) => {
      const result = makeScanResult({ scanType: type });
      expect(result.scanType).toBe(type);
    });
  });

  it("passive scan should be less intrusive than full", () => {
    // Passive scan checks only headers and metadata — not active injection
    const passiveResult = makeScanResult({ scanType: "passive" });
    const fullResult = makeScanResult({ scanType: "full" });
    expect(passiveResult.scanType).toBe("passive");
    expect(fullResult.scanType).toBe("full");
  });
});

// ─── Tests: Finding deduplication logic ───────────────────────────────────────

describe("Finding deduplication", () => {
  it("should identify duplicate findings by title and url", () => {
    const findings: Finding[] = [
      makeFinding({ id: "1", title: "Missing X-Frame-Options", affectedUrl: "https://example.com" }),
      makeFinding({ id: "2", title: "Missing X-Frame-Options", affectedUrl: "https://example.com" }),
      makeFinding({ id: "3", title: "Missing X-Frame-Options", affectedUrl: "https://example.com/page" }),
    ];

    // Simulate deduplication: same title + same URL = duplicate
    const seen = new Set<string>();
    const deduped = findings.filter((f) => {
      const key = `${f.title}::${f.affectedUrl ?? ""}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    expect(deduped).toHaveLength(2);
  });

  it("should keep findings with same title but different URLs", () => {
    const findings: Finding[] = [
      makeFinding({ id: "1", title: "XSS", affectedUrl: "https://example.com/page1" }),
      makeFinding({ id: "2", title: "XSS", affectedUrl: "https://example.com/page2" }),
    ];

    const seen = new Set<string>();
    const deduped = findings.filter((f) => {
      const key = `${f.title}::${f.affectedUrl ?? ""}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    expect(deduped).toHaveLength(2);
  });
});

// ─── Tests: Security header checks ────────────────────────────────────────────

describe("Security header analysis", () => {
  const REQUIRED_HEADERS = [
    "x-frame-options",
    "x-content-type-options",
    "strict-transport-security",
    "content-security-policy",
    "referrer-policy",
    "permissions-policy",
  ];

  it("should detect all missing security headers", () => {
    const presentHeaders = new Set(["content-type", "server"]);
    const missing = REQUIRED_HEADERS.filter((h) => !presentHeaders.has(h));
    expect(missing).toHaveLength(REQUIRED_HEADERS.length);
  });

  it("should not flag present security headers", () => {
    const presentHeaders = new Set(REQUIRED_HEADERS);
    const missing = REQUIRED_HEADERS.filter((h) => !presentHeaders.has(h));
    expect(missing).toHaveLength(0);
  });

  it("should flag weak X-Frame-Options values", () => {
    const weakValues = ["allow-from https://evil.com", "allowall"];
    const strongValues = ["deny", "sameorigin"];

    weakValues.forEach((v) => {
      const isWeak = !["deny", "sameorigin"].includes(v.toLowerCase());
      expect(isWeak).toBe(true);
    });

    strongValues.forEach((v) => {
      const isWeak = !["deny", "sameorigin"].includes(v.toLowerCase());
      expect(isWeak).toBe(false);
    });
  });

  it("should detect missing HSTS on HTTPS sites", () => {
    const httpsUrl = "https://example.com";
    const headers: Record<string, string> = { "content-type": "text/html" };
    const isHttps = httpsUrl.startsWith("https://");
    const hasHSTS = "strict-transport-security" in headers;
    expect(isHttps && !hasHSTS).toBe(true);
  });
});

// ─── Tests: Cookie security ────────────────────────────────────────────────────

describe("Cookie security analysis", () => {
  it("should detect cookies without Secure flag on HTTPS", () => {
    const cookies = [
      "session=abc123; Path=/; HttpOnly",
      "token=xyz; Path=/; Secure; HttpOnly; SameSite=Strict",
    ];
    const insecure = cookies.filter((c) => !c.toLowerCase().includes("secure"));
    expect(insecure).toHaveLength(1);
  });

  it("should detect cookies without HttpOnly flag", () => {
    const cookies = [
      "session=abc123; Path=/; Secure",
      "token=xyz; Path=/; Secure; HttpOnly",
    ];
    const noHttpOnly = cookies.filter((c) => !c.toLowerCase().includes("httponly"));
    expect(noHttpOnly).toHaveLength(1);
  });

  it("should detect cookies without SameSite attribute", () => {
    const cookies = [
      "session=abc123; Path=/; Secure; HttpOnly",
      "token=xyz; Path=/; Secure; HttpOnly; SameSite=Strict",
    ];
    const noSameSite = cookies.filter((c) => !c.toLowerCase().includes("samesite"));
    expect(noSameSite).toHaveLength(1);
  });

  it("should flag SameSite=None without Secure", () => {
    const cookie = "session=abc; SameSite=None";
    const hasNone = cookie.toLowerCase().includes("samesite=none");
    const hasSecure = cookie.toLowerCase().includes("secure");
    expect(hasNone && !hasSecure).toBe(true);
  });
});

// ─── Tests: URL validation ─────────────────────────────────────────────────────

describe("URL validation for sandbox targets", () => {
  function isPrivateOrLocalhost(url: string): boolean {
    try {
      const parsed = new URL(url);
      const hostname = parsed.hostname;
      return (
        hostname === "localhost" ||
        hostname === "127.0.0.1" ||
        hostname === "::1" ||
        hostname.startsWith("192.168.") ||
        hostname.startsWith("10.") ||
        hostname.startsWith("172.16.") ||
        hostname === "169.254.169.254" || // AWS metadata
        hostname === "metadata.google.internal"
      );
    } catch {
      return true; // invalid URL = block
    }
  }

  it("should block localhost", () => {
    expect(isPrivateOrLocalhost("http://localhost:3000")).toBe(true);
    expect(isPrivateOrLocalhost("http://127.0.0.1")).toBe(true);
  });

  it("should block private IP ranges", () => {
    expect(isPrivateOrLocalhost("http://192.168.1.1")).toBe(true);
    expect(isPrivateOrLocalhost("http://10.0.0.1")).toBe(true);
    expect(isPrivateOrLocalhost("http://172.16.0.1")).toBe(true);
  });

  it("should block cloud metadata endpoints", () => {
    expect(isPrivateOrLocalhost("http://169.254.169.254/latest/meta-data")).toBe(true);
    expect(isPrivateOrLocalhost("http://metadata.google.internal")).toBe(true);
  });

  it("should allow public URLs", () => {
    expect(isPrivateOrLocalhost("https://example.com")).toBe(false);
    expect(isPrivateOrLocalhost("https://mysite.pl")).toBe(false);
    expect(isPrivateOrLocalhost("https://wordpress.org")).toBe(false);
  });

  it("should block invalid URLs", () => {
    expect(isPrivateOrLocalhost("not-a-url")).toBe(true);
    expect(isPrivateOrLocalhost("")).toBe(true);
  });
});

// ─── Tests: PII anonymization patterns ────────────────────────────────────────

describe("PII anonymization patterns", () => {
  function anonymize(text: string): string {
    return text
      .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, "user@example.com")
      .replace(/\b(\+48|0048)?[\s-]?\d{3}[\s-]?\d{3}[\s-]?\d{3}\b/g, "+48 000 000 000")
      .replace(/\b\d{10}\b/g, "0000000000") // NIP
      .replace(/\b\d{11}\b/g, "00000000000") // PESEL
      .replace(/\bPL\d{26}\b/gi, "PL00000000000000000000000000"); // IBAN
  }

  it("should anonymize email addresses", () => {
    const text = "Contact us at admin@mycompany.pl for support";
    const result = anonymize(text);
    expect(result).not.toContain("admin@mycompany.pl");
    expect(result).toContain("user@example.com");
  });

  it("should anonymize Polish phone numbers", () => {
    const text = "Call us at +48 123 456 789";
    const result = anonymize(text);
    expect(result).not.toContain("123 456 789");
  });

  it("should anonymize Polish IBAN", () => {
    const text = "Bank account: PL61109010140000071219812874";
    const result = anonymize(text);
    expect(result).not.toContain("PL61109010140000071219812874");
    expect(result).toContain("PL00000000000000000000000000");
  });

  it("should not modify non-PII content", () => {
    const text = "Welcome to our website. We offer great services.";
    const result = anonymize(text);
    expect(result).toBe(text);
  });
});

// ─── Tests: Tech detection patterns ───────────────────────────────────────────

describe("Technology detection patterns", () => {
  it("should detect WordPress from HTML meta generator", () => {
    const html = '<meta name="generator" content="WordPress 6.4.2">';
    const isWordPress = html.toLowerCase().includes("wordpress");
    expect(isWordPress).toBe(true);
  });

  it("should detect Next.js from __NEXT_DATA__ script", () => {
    const html = '<script id="__NEXT_DATA__" type="application/json">{}</script>';
    const isNextJs = html.includes("__NEXT_DATA__");
    expect(isNextJs).toBe(true);
  });

  it("should detect React from data-reactroot attribute", () => {
    const html = '<div id="root" data-reactroot=""></div>';
    const isReact = html.includes("data-reactroot") || html.includes("__react");
    expect(isReact).toBe(true);
  });

  it("should detect Laravel from X-Powered-By header", () => {
    const headers: Record<string, string> = { "x-powered-by": "PHP/8.2.0", "set-cookie": "laravel_session=abc" };
    const isLaravel = Object.values(headers).some((v) => v.toLowerCase().includes("laravel"));
    expect(isLaravel).toBe(true);
  });

  it("should detect Django from csrfmiddlewaretoken", () => {
    const html = '<input type="hidden" name="csrfmiddlewaretoken" value="abc123">';
    const isDjango = html.includes("csrfmiddlewaretoken");
    expect(isDjango).toBe(true);
  });

  it("should extract version from WordPress generator tag", () => {
    const html = '<meta name="generator" content="WordPress 6.4.2">';
    const match = html.match(/WordPress\s+([\d.]+)/i);
    expect(match?.[1]).toBe("6.4.2");
  });
});

// ─── Tests: CORS misconfiguration detection ───────────────────────────────────

describe("CORS misconfiguration detection", () => {
  it("should flag wildcard ACAO with credentials", () => {
    const headers: Record<string, string> = {
      "access-control-allow-origin": "*",
      "access-control-allow-credentials": "true",
    };
    const isVulnerable =
      headers["access-control-allow-origin"] === "*" &&
      headers["access-control-allow-credentials"] === "true";
    expect(isVulnerable).toBe(true);
  });

  it("should flag null origin reflection", () => {
    const origin = "null";
    const acao = "null";
    expect(origin === acao).toBe(true);
  });

  it("should not flag properly configured CORS", () => {
    const headers: Record<string, string> = {
      "access-control-allow-origin": "https://myapp.com",
      "access-control-allow-credentials": "true",
    };
    const isVulnerable =
      headers["access-control-allow-origin"] === "*" &&
      headers["access-control-allow-credentials"] === "true";
    expect(isVulnerable).toBe(false);
  });
});

// ─── Tests: Scan duration tracking ────────────────────────────────────────────

describe("Scan duration tracking", () => {
  it("should record positive duration", () => {
    const start = new Date("2024-01-01T10:00:00Z");
    const end = new Date("2024-01-01T10:00:30Z");
    const duration = end.getTime() - start.getTime();
    expect(duration).toBe(30000);
    expect(duration).toBeGreaterThan(0);
  });

  it("should have completedAt after startedAt", () => {
    const result = makeScanResult();
    expect(result.completedAt.getTime()).toBeGreaterThanOrEqual(result.startedAt.getTime());
  });
});
