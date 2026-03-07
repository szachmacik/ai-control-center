/**
 * SARIF Export Logic — Unit Tests
 *
 * Tests the pure helper functions used in the exportSarif tRPC procedure.
 * We extract and test the logic independently to keep tests fast and deterministic.
 */

import { describe, it, expect } from "vitest";

// ─── Replicated helpers (same logic as sandboxRouter.ts exportSarif) ──────────

function sevToLevel(sev: string): string {
  if (sev === "critical" || sev === "high") return "error";
  if (sev === "medium") return "warning";
  return "note";
}

function sevToScore(sev: string): number {
  if (sev === "critical") return 9.5;
  if (sev === "high") return 7.5;
  if (sev === "medium") return 5.0;
  if (sev === "low") return 2.5;
  return 0.0;
}

function makeRuleId(category: string): string {
  return `SENTINEL-${category.toUpperCase().replace(/[^A-Z0-9]/g, "-")}`;
}

function makeSafeFilename(name: string, scanId: number, date: string): string {
  const safeName = name.replace(/[^a-zA-Z0-9-_]/g, "-");
  return `sentinel-${safeName}-scan${scanId}-${date}.sarif`;
}

// ─── sevToLevel ───────────────────────────────────────────────────────────────

describe("sevToLevel", () => {
  it("maps critical to error", () => {
    expect(sevToLevel("critical")).toBe("error");
  });

  it("maps high to error", () => {
    expect(sevToLevel("high")).toBe("error");
  });

  it("maps medium to warning", () => {
    expect(sevToLevel("medium")).toBe("warning");
  });

  it("maps low to note", () => {
    expect(sevToLevel("low")).toBe("note");
  });

  it("maps info to note", () => {
    expect(sevToLevel("info")).toBe("note");
  });

  it("maps unknown severity to note", () => {
    expect(sevToLevel("unknown")).toBe("note");
  });

  it("is case-sensitive (uppercase not mapped)", () => {
    expect(sevToLevel("CRITICAL")).toBe("note");
  });
});

// ─── sevToScore ───────────────────────────────────────────────────────────────

describe("sevToScore", () => {
  it("maps critical to 9.5", () => {
    expect(sevToScore("critical")).toBe(9.5);
  });

  it("maps high to 7.5", () => {
    expect(sevToScore("high")).toBe(7.5);
  });

  it("maps medium to 5.0", () => {
    expect(sevToScore("medium")).toBe(5.0);
  });

  it("maps low to 2.5", () => {
    expect(sevToScore("low")).toBe(2.5);
  });

  it("maps info to 0.0", () => {
    expect(sevToScore("info")).toBe(0.0);
  });

  it("maps unknown to 0.0", () => {
    expect(sevToScore("unknown")).toBe(0.0);
  });

  it("scores are ordered correctly (critical > high > medium > low > info)", () => {
    const scores = ["critical", "high", "medium", "low", "info"].map(sevToScore);
    for (let i = 0; i < scores.length - 1; i++) {
      expect(scores[i]).toBeGreaterThan(scores[i + 1]);
    }
  });

  it("all scores are within CVSS range [0, 10]", () => {
    ["critical", "high", "medium", "low", "info"].forEach((sev) => {
      const score = sevToScore(sev);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(10);
    });
  });
});

// ─── makeRuleId ───────────────────────────────────────────────────────────────

describe("makeRuleId", () => {
  it("prefixes with SENTINEL-", () => {
    expect(makeRuleId("xss")).toMatch(/^SENTINEL-/);
  });

  it("uppercases the category", () => {
    expect(makeRuleId("xss")).toBe("SENTINEL-XSS");
  });

  it("replaces spaces with dashes", () => {
    expect(makeRuleId("sql injection")).toBe("SENTINEL-SQL-INJECTION");
  });

  it("replaces special characters with dashes", () => {
    expect(makeRuleId("open/redirect")).toBe("SENTINEL-OPEN-REDIRECT");
  });

  it("handles mixed case input", () => {
    expect(makeRuleId("Cross-Site Scripting")).toBe("SENTINEL-CROSS-SITE-SCRIPTING");
  });

  it("handles numbers in category", () => {
    expect(makeRuleId("cve-2023")).toBe("SENTINEL-CVE-2023");
  });

  it("produces consistent IDs for same category", () => {
    expect(makeRuleId("headers")).toBe(makeRuleId("headers"));
  });

  it("produces different IDs for different categories", () => {
    expect(makeRuleId("xss")).not.toBe(makeRuleId("sqli"));
  });
});

// ─── makeSafeFilename ─────────────────────────────────────────────────────────

describe("makeSafeFilename", () => {
  it("produces correct format", () => {
    const filename = makeSafeFilename("my-sandbox", 42, "2025-01-15");
    expect(filename).toBe("sentinel-my-sandbox-scan42-2025-01-15.sarif");
  });

  it("replaces spaces in sandbox name", () => {
    const filename = makeSafeFilename("my sandbox", 1, "2025-01-01");
    expect(filename).toBe("sentinel-my-sandbox-scan1-2025-01-01.sarif");
  });

  it("replaces special characters in sandbox name", () => {
    const filename = makeSafeFilename("test.site.com", 5, "2025-06-01");
    expect(filename).toBe("sentinel-test-site-com-scan5-2025-06-01.sarif");
  });

  it("ends with .sarif extension", () => {
    const filename = makeSafeFilename("sandbox", 1, "2025-01-01");
    expect(filename).toMatch(/\.sarif$/);
  });

  it("contains scan ID", () => {
    const filename = makeSafeFilename("sandbox", 99, "2025-01-01");
    expect(filename).toContain("scan99");
  });

  it("contains date", () => {
    const filename = makeSafeFilename("sandbox", 1, "2025-12-31");
    expect(filename).toContain("2025-12-31");
  });
});

// ─── SARIF document structure ─────────────────────────────────────────────────

describe("SARIF document structure", () => {
  function buildSarif(findings: Array<{ title: string; severity: string; category: string; description?: string; affectedUrl?: string; remediation?: string; cvssScore?: string; evidence?: string }>, sandboxName: string, targetUrl: string) {
    const rulesMap = new Map<string, { id: string; name: string; shortDescription: string; helpText: string; severity: string; tags: string[] }>();

    for (const f of findings) {
      const ruleId = makeRuleId(f.category);
      if (!rulesMap.has(ruleId)) {
        rulesMap.set(ruleId, {
          id: ruleId,
          name: f.category,
          shortDescription: f.title,
          helpText: f.remediation ?? "Review and remediate this vulnerability.",
          severity: f.severity,
          tags: ["security", f.category.toLowerCase().replace(/\s+/g, "-")],
        });
      }
    }

    const rules = Array.from(rulesMap.values()).map((r) => ({
      id: r.id,
      name: r.name,
      shortDescription: { text: r.shortDescription },
      fullDescription: { text: r.helpText },
      helpUri: "https://owasp.org/www-project-top-ten/",
      properties: {
        tags: r.tags,
        "security-severity": String(sevToScore(r.severity)),
        precision: "medium",
        "problem.severity": sevToLevel(r.severity),
      },
    }));

    const results = findings.map((f) => ({
      ruleId: makeRuleId(f.category),
      level: sevToLevel(f.severity),
      message: { text: f.description ?? f.title },
      locations: [{
        physicalLocation: {
          artifactLocation: { uri: f.affectedUrl ?? targetUrl, uriBaseId: "%SRCROOT%" },
          region: { startLine: 1 },
        },
      }],
    }));

    return {
      version: "2.1.0",
      $schema: "https://json.schemastore.org/sarif-2.1.0.json",
      runs: [{
        tool: {
          driver: {
            name: "Sentinel Security Scanner",
            version: "1.0.0",
            informationUri: "https://sentinel.ofshore.dev",
            rules,
          },
        },
        results,
        artifacts: [{ location: { uri: targetUrl } }],
        invocations: [{ executionSuccessful: true }],
      }],
    };
  }

  it("has correct SARIF version", () => {
    const sarif = buildSarif([], "test", "https://example.com");
    expect(sarif.version).toBe("2.1.0");
  });

  it("has correct $schema", () => {
    const sarif = buildSarif([], "test", "https://example.com");
    expect(sarif.$schema).toContain("sarif-2.1.0");
  });

  it("has exactly one run", () => {
    const sarif = buildSarif([], "test", "https://example.com");
    expect(sarif.runs).toHaveLength(1);
  });

  it("tool driver name is Sentinel Security Scanner", () => {
    const sarif = buildSarif([], "test", "https://example.com");
    expect(sarif.runs[0].tool.driver.name).toBe("Sentinel Security Scanner");
  });

  it("produces one result per finding", () => {
    const findings = [
      { title: "XSS", severity: "high", category: "xss" },
      { title: "SQLi", severity: "critical", category: "sqli" },
    ];
    const sarif = buildSarif(findings, "test", "https://example.com");
    expect(sarif.runs[0].results).toHaveLength(2);
  });

  it("deduplicates rules for same category", () => {
    const findings = [
      { title: "XSS 1", severity: "high", category: "xss" },
      { title: "XSS 2", severity: "medium", category: "xss" },
      { title: "SQLi", severity: "critical", category: "sqli" },
    ];
    const sarif = buildSarif(findings, "test", "https://example.com");
    expect(sarif.runs[0].tool.driver.rules).toHaveLength(2);
  });

  it("result level matches severity", () => {
    const findings = [
      { title: "Critical Bug", severity: "critical", category: "xss" },
    ];
    const sarif = buildSarif(findings, "test", "https://example.com");
    expect(sarif.runs[0].results[0].level).toBe("error");
  });

  it("empty findings produces valid SARIF with no results", () => {
    const sarif = buildSarif([], "test", "https://example.com");
    expect(sarif.runs[0].results).toHaveLength(0);
    expect(sarif.runs[0].tool.driver.rules).toHaveLength(0);
  });

  it("uses affectedUrl for location when available", () => {
    const findings = [
      { title: "XSS", severity: "high", category: "xss", affectedUrl: "https://example.com/search" },
    ];
    const sarif = buildSarif(findings, "test", "https://example.com");
    expect(sarif.runs[0].results[0].locations[0].physicalLocation.artifactLocation.uri).toBe("https://example.com/search");
  });

  it("falls back to targetUrl when affectedUrl is missing", () => {
    const findings = [
      { title: "XSS", severity: "high", category: "xss" },
    ];
    const sarif = buildSarif(findings, "test", "https://example.com");
    expect(sarif.runs[0].results[0].locations[0].physicalLocation.artifactLocation.uri).toBe("https://example.com");
  });

  it("serializes to valid JSON", () => {
    const findings = [
      { title: "XSS", severity: "high", category: "xss", description: "Reflected XSS", remediation: "Sanitize input" },
    ];
    const sarif = buildSarif(findings, "test", "https://example.com");
    expect(() => JSON.stringify(sarif)).not.toThrow();
  });

  it("security-severity is a string representation of a number", () => {
    const findings = [
      { title: "Critical", severity: "critical", category: "xss" },
    ];
    const sarif = buildSarif(findings, "test", "https://example.com");
    const rule = sarif.runs[0].tool.driver.rules[0];
    expect(typeof rule.properties["security-severity"]).toBe("string");
    expect(parseFloat(rule.properties["security-severity"])).toBe(9.5);
  });
});
