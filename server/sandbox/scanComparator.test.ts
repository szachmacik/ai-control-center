import { describe, it, expect } from "vitest";
import { compareScans, buildTrendSeries, type ScanSnapshot } from "./scanComparator";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeSnapshot(overrides: Partial<ScanSnapshot> = {}): ScanSnapshot {
  return {
    scanId: 1,
    scanType: "full",
    riskScore: 50,
    findings: [],
    createdAt: "2025-01-01T00:00:00.000Z",
    summary: { critical: 0, high: 0, medium: 0, low: 0, info: 0, total: 0 },
    ...overrides,
  };
}

function makeFinding(title: string, severity: string, category: string) {
  return { title, severity, category, description: "", evidence: "", remediation: "" };
}

// ─── compareScans ─────────────────────────────────────────────────────────────

describe("compareScans", () => {
  it("returns empty diff when both scans have no findings", () => {
    const a = makeSnapshot({ scanId: 1 });
    const b = makeSnapshot({ scanId: 2 });
    const result = compareScans(a, b);
    expect(result.newFindings).toHaveLength(0);
    expect(result.resolvedFindings).toHaveLength(0);
    expect(result.persistingFindings).toHaveLength(0);
    expect(result.overallStatus).toBe("stable");
  });

  it("detects new findings in scan B that were not in scan A", () => {
    const a = makeSnapshot({ scanId: 1, findings: [] });
    const b = makeSnapshot({
      scanId: 2,
      summary: { critical: 0, high: 1, medium: 0, low: 0, info: 0, total: 1 },
      findings: [makeFinding("XSS Reflected", "high", "xss")],
    });
    const result = compareScans(a, b);
    expect(result.newFindings).toHaveLength(1);
    expect(result.newFindings[0].finding.title).toBe("XSS Reflected");
    expect(result.resolvedFindings).toHaveLength(0);
  });

  it("detects fixed findings that were in scan A but not in scan B", () => {
    const a = makeSnapshot({
      scanId: 1,
      summary: { critical: 1, high: 0, medium: 0, low: 0, info: 0, total: 1 },
      findings: [makeFinding("SQL Injection", "critical", "sqli")],
    });
    const b = makeSnapshot({ scanId: 2, findings: [] });
    const result = compareScans(a, b);
    expect(result.resolvedFindings).toHaveLength(1);
    expect(result.resolvedFindings[0].finding.title).toBe("SQL Injection");
    expect(result.newFindings).toHaveLength(0);
  });

  it("detects persisting findings present in both scans", () => {
    const finding = makeFinding("Missing HSTS", "medium", "headers");
    const a = makeSnapshot({
      scanId: 1,
      summary: { critical: 0, high: 0, medium: 1, low: 0, info: 0, total: 1 },
      findings: [finding],
    });
    const b = makeSnapshot({
      scanId: 2,
      summary: { critical: 0, high: 0, medium: 1, low: 0, info: 0, total: 1 },
      findings: [finding],
    });
    const result = compareScans(a, b);
    expect(result.persistingFindings).toHaveLength(1);
    expect(result.newFindings).toHaveLength(0);
    expect(result.resolvedFindings).toHaveLength(0);
  });

  it("calculates overallStatus as improvement when risk score drops", () => {
    const a = makeSnapshot({
      scanId: 1,
      riskScore: 80,
      summary: { critical: 1, high: 1, medium: 1, low: 0, info: 0, total: 3 },
      findings: [
        makeFinding("SQLi", "critical", "sqli"),
        makeFinding("XSS", "high", "xss"),
        makeFinding("CSRF", "medium", "csrf"),
      ],
    });
    const b = makeSnapshot({
      scanId: 2,
      riskScore: 30,
      summary: { critical: 0, high: 0, medium: 1, low: 0, info: 0, total: 1 },
      findings: [makeFinding("CSRF", "medium", "csrf")],
    });
    const result = compareScans(a, b);
    expect(result.overallStatus).toBe("improvement");
    expect(result.riskScoreDelta).toBe(-50);
  });

  it("calculates overallStatus as regression when risk score rises", () => {
    const a = makeSnapshot({ scanId: 1, riskScore: 20, findings: [] });
    const b = makeSnapshot({
      scanId: 2,
      riskScore: 75,
      summary: { critical: 1, high: 1, medium: 0, low: 0, info: 0, total: 2 },
      findings: [
        makeFinding("SQLi", "critical", "sqli"),
        makeFinding("XSS", "high", "xss"),
      ],
    });
    const result = compareScans(a, b);
    expect(result.overallStatus).toBe("regression");
    expect(result.riskScoreDelta).toBe(55);
  });

  it("calculates overallStatus as stable when risk score unchanged", () => {
    const a = makeSnapshot({
      scanId: 1,
      riskScore: 50,
      summary: { critical: 1, high: 0, medium: 0, low: 0, info: 0, total: 1 },
      findings: [makeFinding("SQLi", "critical", "sqli")],
    });
    const b = makeSnapshot({
      scanId: 2,
      riskScore: 50,
      summary: { critical: 0, high: 1, medium: 0, low: 0, info: 0, total: 1 },
      findings: [makeFinding("XSS", "high", "xss")],
    });
    const result = compareScans(a, b);
    expect(result.overallStatus).toBe("stable");
  });

  it("handles findings with same title+category as persisting", () => {
    const f1 = makeFinding("Open Redirect", "medium", "open_redirect");
    const f2 = makeFinding("Open Redirect", "medium", "open_redirect");
    const a = makeSnapshot({
      scanId: 1,
      summary: { critical: 0, high: 0, medium: 1, low: 0, info: 0, total: 1 },
      findings: [f1],
    });
    const b = makeSnapshot({
      scanId: 2,
      summary: { critical: 0, high: 0, medium: 1, low: 0, info: 0, total: 1 },
      findings: [f2],
    });
    const result = compareScans(a, b);
    expect(result.persistingFindings).toHaveLength(1);
    expect(result.newFindings).toHaveLength(0);
    expect(result.resolvedFindings).toHaveLength(0);
  });

  it("includes baseline and compare scan IDs in result", () => {
    const a = makeSnapshot({ scanId: 10, riskScore: 40 });
    const b = makeSnapshot({ scanId: 20, riskScore: 60 });
    const result = compareScans(a, b);
    expect(result.baselineScanId).toBe(10);
    expect(result.compareScanId).toBe(20);
    expect(result.riskScoreBaseline).toBe(40);
    expect(result.riskScoreCompare).toBe(60);
  });

  it("correctly computes summaryDelta", () => {
    const a = makeSnapshot({
      scanId: 1,
      summary: { critical: 2, high: 3, medium: 1, low: 0, info: 0, total: 6 },
      findings: [],
    });
    const b = makeSnapshot({
      scanId: 2,
      summary: { critical: 1, high: 1, medium: 2, low: 1, info: 0, total: 5 },
      findings: [],
    });
    const result = compareScans(a, b);
    expect(result.summaryDelta.critical).toBe(-1);
    expect(result.summaryDelta.high).toBe(-2);
    expect(result.summaryDelta.medium).toBe(1);
    expect(result.summaryDelta.low).toBe(1);
  });
});

// ─── buildTrendSeries ─────────────────────────────────────────────────────────

describe("buildTrendSeries", () => {
  it("returns empty array for empty input", () => {
    expect(buildTrendSeries([])).toEqual([]);
  });

  it("returns single point for single snapshot", () => {
    const snap = makeSnapshot({ scanId: 1, riskScore: 55, createdAt: "2025-01-01T00:00:00.000Z" });
    const series = buildTrendSeries([snap]);
    expect(series).toHaveLength(1);
    expect(series[0].riskScore).toBe(55);
  });

  it("returns series in chronological order", () => {
    const snaps = [
      makeSnapshot({ scanId: 3, riskScore: 30, createdAt: "2025-01-03T00:00:00.000Z" }),
      makeSnapshot({ scanId: 1, riskScore: 70, createdAt: "2025-01-01T00:00:00.000Z" }),
      makeSnapshot({ scanId: 2, riskScore: 50, createdAt: "2025-01-02T00:00:00.000Z" }),
    ];
    const series = buildTrendSeries(snaps);
    expect(series[0].riskScore).toBe(70);
    expect(series[1].riskScore).toBe(50);
    expect(series[2].riskScore).toBe(30);
  });

  it("includes finding counts per severity in each point", () => {
    const snap = makeSnapshot({
      scanId: 1,
      riskScore: 80,
      summary: { critical: 2, high: 1, medium: 1, low: 0, info: 1, total: 5 },
      findings: [
        makeFinding("A", "critical", "sqli"),
        makeFinding("B", "critical", "xss"),
        makeFinding("C", "high", "headers"),
        makeFinding("D", "medium", "csrf"),
        makeFinding("E", "info", "info"),
      ],
    });
    const series = buildTrendSeries([snap]);
    expect(series[0].critical).toBe(2);
    expect(series[0].high).toBe(1);
    expect(series[0].medium).toBe(1);
    expect(series[0].info).toBe(1);
  });
});
