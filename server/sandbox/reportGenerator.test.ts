import { describe, it, expect } from "vitest";
import { generateReport, generateHtmlReport, type ReportData } from "./reportGenerator";
import type { ScanResult, Finding, SeverityLevel } from "./scanner";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    id: "test-id",
    severity: "medium" as SeverityLevel,
    category: "headers",
    title: "Missing Security Header",
    description: "A security header is missing",
    remediation: "Add the header to your server configuration",
    ...overrides,
  };
}

function makeScanResult(overrides: Partial<ScanResult> = {}): ScanResult {
  return {
    findings: [],
    summary: { critical: 0, high: 0, medium: 0, low: 0, info: 0, total: 0 },
    scanType: "passive",
    targetUrl: "https://example.com",
    duration: 5000,
    startedAt: new Date("2025-01-01T10:00:00Z"),
    completedAt: new Date("2025-01-01T10:00:05Z"),
    ...overrides,
  };
}

// ─── generateReport ───────────────────────────────────────────────────────────

describe("generateReport", () => {
  it("returns ReportData with html, json and summary fields", () => {
    const result = makeScanResult();
    const report = generateReport(result, "Test Sandbox");
    expect(report).toHaveProperty("html");
    expect(report).toHaveProperty("json");
    expect(report).toHaveProperty("summary");
  });

  it("summary contains correct sandboxName and targetUrl", () => {
    const result = makeScanResult({ targetUrl: "https://mysite.com" });
    const report = generateReport(result, "My Sandbox");
    expect(report.summary.sandboxName).toBe("My Sandbox");
    expect(report.summary.targetUrl).toBe("https://mysite.com");
  });

  it("calculates riskScore=0 for empty findings", () => {
    const result = makeScanResult();
    const report = generateReport(result, "Empty Sandbox");
    expect(report.summary.riskScore).toBe(0);
  });

  it("calculates riskScore correctly for mixed severity findings", () => {
    const result = makeScanResult({
      summary: { critical: 1, high: 2, medium: 3, low: 1, info: 2, total: 9 },
      findings: [
        makeFinding({ severity: "critical" }),
        makeFinding({ severity: "high" }),
        makeFinding({ severity: "high" }),
        makeFinding({ severity: "medium" }),
        makeFinding({ severity: "medium" }),
        makeFinding({ severity: "medium" }),
        makeFinding({ severity: "low" }),
        makeFinding({ severity: "info" }),
        makeFinding({ severity: "info" }),
      ],
    });
    const report = generateReport(result, "Mixed Sandbox");
    // critical*20 + high*10 + medium*5 + low*2 + info*1 = 20+20+15+2+2 = 59
    expect(report.summary.riskScore).toBe(59);
  });

  it("caps riskScore at 100", () => {
    const result = makeScanResult({
      summary: { critical: 10, high: 10, medium: 10, low: 10, info: 10, total: 50 },
      findings: Array(50).fill(makeFinding({ severity: "critical" })),
    });
    const report = generateReport(result, "High Risk Sandbox");
    expect(report.summary.riskScore).toBeLessThanOrEqual(100);
  });

  it("assigns riskLevel=Minimal Risk for zero findings", () => {
    const result = makeScanResult();
    const report = generateReport(result, "Clean Sandbox");
    expect(report.summary.riskLevel).toBe("Minimal Risk");
  });

  it("assigns riskLevel=Critical Risk for high risk score", () => {
    const result = makeScanResult({
      summary: { critical: 5, high: 0, medium: 0, low: 0, info: 0, total: 5 },
      findings: Array(5).fill(makeFinding({ severity: "critical" })),
    });
    const report = generateReport(result, "Critical Sandbox");
    expect(report.summary.riskLevel).toBe("Critical Risk");
  });

  it("json output is valid JSON", () => {
    const result = makeScanResult({
      findings: [makeFinding({ severity: "high", title: "XSS" })],
      summary: { critical: 0, high: 1, medium: 0, low: 0, info: 0, total: 1 },
    });
    const report = generateReport(result, "JSON Test");
    expect(() => JSON.parse(report.json)).not.toThrow();
  });

  it("json output contains findings array", () => {
    const result = makeScanResult({
      findings: [makeFinding({ severity: "high", title: "XSS Reflected" })],
      summary: { critical: 0, high: 1, medium: 0, low: 0, info: 0, total: 1 },
    });
    const report = generateReport(result, "JSON Test");
    const parsed = JSON.parse(report.json);
    expect(parsed.findings).toBeDefined();
    expect(Array.isArray(parsed.findings)).toBe(true);
  });

  it("summary totalFindings matches findings array length", () => {
    const findings = [
      makeFinding({ severity: "critical" }),
      makeFinding({ severity: "high" }),
      makeFinding({ severity: "medium" }),
    ];
    const result = makeScanResult({
      findings,
      summary: { critical: 1, high: 1, medium: 1, low: 0, info: 0, total: 3 },
    });
    const report = generateReport(result, "Count Test");
    expect(report.summary.totalFindings).toBe(3);
    expect(report.summary.critical).toBe(1);
    expect(report.summary.high).toBe(1);
    expect(report.summary.medium).toBe(1);
  });

  it("includes techStack in report when provided", () => {
    const result = makeScanResult();
    const report = generateReport(result, "WP Sandbox", "WordPress 6.4.2");
    expect(report.html).toContain("WordPress 6.4.2");
  });

  it("html output contains sandbox name", () => {
    const result = makeScanResult();
    const report = generateReport(result, "My Test Sandbox");
    expect(report.html).toContain("My Test Sandbox");
  });

  it("html output contains target URL", () => {
    const result = makeScanResult({ targetUrl: "https://target.example.com" });
    const report = generateReport(result, "URL Test");
    expect(report.html).toContain("https://target.example.com");
  });

  it("html output is valid HTML with doctype", () => {
    const result = makeScanResult();
    const report = generateReport(result, "HTML Test");
    expect(report.html.toLowerCase()).toContain("<!doctype html>");
  });

  it("html output contains severity badges for findings", () => {
    const result = makeScanResult({
      findings: [
        makeFinding({ severity: "critical", title: "Critical Issue" }),
        makeFinding({ severity: "high", title: "High Issue" }),
      ],
      summary: { critical: 1, high: 1, medium: 0, low: 0, info: 0, total: 2 },
    });
    const report = generateReport(result, "Severity Test");
    expect(report.html).toContain("Critical Issue");
    expect(report.html).toContain("High Issue");
  });

  it("summary duration matches scan result duration", () => {
    const result = makeScanResult({ duration: 12345 });
    const report = generateReport(result, "Duration Test");
    expect(report.summary.duration).toBe(12345);
  });
});

// ─── generateHtmlReport ───────────────────────────────────────────────────────

describe("generateHtmlReport", () => {
  it("returns non-empty HTML string", () => {
    const result = makeScanResult();
    const html = generateHtmlReport(result, "Test");
    expect(typeof html).toBe("string");
    expect(html.length).toBeGreaterThan(100);
  });

  it("includes risk score section", () => {
    const result = makeScanResult({
      summary: { critical: 1, high: 0, medium: 0, low: 0, info: 0, total: 1 },
      findings: [makeFinding({ severity: "critical" })],
    });
    const html = generateHtmlReport(result, "Risk Test");
    // Should contain some numeric risk score
    expect(html).toMatch(/\d+/);
  });

  it("includes remediation text for each finding", () => {
    const result = makeScanResult({
      findings: [
        makeFinding({
          severity: "high",
          title: "SQL Injection",
          remediation: "Use parameterized queries",
        }),
      ],
      summary: { critical: 0, high: 1, medium: 0, low: 0, info: 0, total: 1 },
    });
    const html = generateHtmlReport(result, "Remediation Test");
    expect(html).toContain("Use parameterized queries");
  });
});
