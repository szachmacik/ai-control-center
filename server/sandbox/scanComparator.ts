/**
 * Sentinel Scan Comparator
 * Compares two scan results to identify new, resolved, and persisting vulnerabilities.
 * Provides trend analysis and risk score delta.
 */

export type SeverityLevel = "critical" | "high" | "medium" | "low" | "info";

export interface FindingSnapshot {
  id: string;
  title: string;
  severity: SeverityLevel;
  category: string;
  affectedUrl?: string;
  cvssScore?: string;
  cwe?: string;
  owasp?: string;
}

export interface ScanSnapshot {
  scanId: number;
  createdAt: string;
  scanType: string;
  riskScore: number;
  summary: {
    critical: number;
    high: number;
    medium: number;
    low: number;
    info: number;
    total: number;
  };
  findings: FindingSnapshot[];
}

export interface FindingDiff {
  finding: FindingSnapshot;
  status: "new" | "resolved" | "persisting";
}

export interface ScanComparisonResult {
  baselineScanId: number;
  compareScanId: number;
  baselineDate: string;
  compareDate: string;

  // Risk score change
  riskScoreDelta: number;
  riskScoreBaseline: number;
  riskScoreCompare: number;
  riskTrend: "improved" | "worsened" | "unchanged";

  // Finding counts
  newFindings: FindingDiff[];
  resolvedFindings: FindingDiff[];
  persistingFindings: FindingDiff[];

  // Summary deltas
  summaryDelta: {
    critical: number;
    high: number;
    medium: number;
    low: number;
    info: number;
    total: number;
  };

  // Category breakdown
  newByCategory: Record<string, number>;
  resolvedByCategory: Record<string, number>;

  // Overall assessment
  overallStatus: "regression" | "improvement" | "stable";
  assessment: string;
}

/**
 * Generate a stable fingerprint for a finding to match across scans.
 * We use title + category + affectedUrl (normalized) as the key.
 */
function fingerprintFinding(f: FindingSnapshot): string {
  const url = (f.affectedUrl || "").replace(/[?#].*$/, "").toLowerCase();
  return [f.category.toLowerCase(), f.title.toLowerCase(), url].join("::");
}

/**
 * Calculate risk score from summary (0-100).
 * Weights: critical=10, high=5, medium=2, low=1, info=0
 */
function calcRiskScore(summary: ScanSnapshot["summary"]): number {
  const raw =
    summary.critical * 10 +
    summary.high * 5 +
    summary.medium * 2 +
    summary.low * 1;
  return Math.min(100, raw);
}

/**
 * Compare two scan snapshots and return a detailed diff.
 */
export function compareScans(
  baseline: ScanSnapshot,
  compare: ScanSnapshot
): ScanComparisonResult {
  const baselineMap = new Map<string, FindingSnapshot>();
  const compareMap = new Map<string, FindingSnapshot>();

  for (const f of baseline.findings) {
    baselineMap.set(fingerprintFinding(f), f);
  }
  for (const f of compare.findings) {
    compareMap.set(fingerprintFinding(f), f);
  }

  const newFindings: FindingDiff[] = [];
  const resolvedFindings: FindingDiff[] = [];
  const persistingFindings: FindingDiff[] = [];

  // New findings: in compare but not in baseline
  Array.from(compareMap.entries()).forEach(([key, f]) => {
    if (!baselineMap.has(key)) {
      newFindings.push({ finding: f, status: "new" });
    } else {
      persistingFindings.push({ finding: f, status: "persisting" });
    }
  });

  // Resolved findings: in baseline but not in compare
  Array.from(baselineMap.entries()).forEach(([key, f]) => {
    if (!compareMap.has(key)) {
      resolvedFindings.push({ finding: f, status: "resolved" });
    }
  });

  // Sort by severity weight
  const severityOrder: Record<SeverityLevel, number> = {
    critical: 0,
    high: 1,
    medium: 2,
    low: 3,
    info: 4,
  };
  const sortBySeverity = (a: FindingDiff, b: FindingDiff) =>
    severityOrder[a.finding.severity] - severityOrder[b.finding.severity];

  newFindings.sort(sortBySeverity);
  resolvedFindings.sort(sortBySeverity);
  persistingFindings.sort(sortBySeverity);

  // Summary deltas
  const summaryDelta = {
    critical: compare.summary.critical - baseline.summary.critical,
    high: compare.summary.high - baseline.summary.high,
    medium: compare.summary.medium - baseline.summary.medium,
    low: compare.summary.low - baseline.summary.low,
    info: compare.summary.info - baseline.summary.info,
    total: compare.summary.total - baseline.summary.total,
  };

  // Risk score
  const riskScoreBaseline = baseline.riskScore ?? calcRiskScore(baseline.summary);
  const riskScoreCompare = compare.riskScore ?? calcRiskScore(compare.summary);
  const riskScoreDelta = riskScoreCompare - riskScoreBaseline;

  const riskTrend: ScanComparisonResult["riskTrend"] =
    riskScoreDelta < -2 ? "improved" : riskScoreDelta > 2 ? "worsened" : "unchanged";

  // Category breakdowns
  const newByCategory: Record<string, number> = {};
  for (const { finding } of newFindings) {
    newByCategory[finding.category] = (newByCategory[finding.category] || 0) + 1;
  }

  const resolvedByCategory: Record<string, number> = {};
  for (const { finding } of resolvedFindings) {
    resolvedByCategory[finding.category] =
      (resolvedByCategory[finding.category] || 0) + 1;
  }

  // Overall status
  const hasCriticalNew = newFindings.some((f) => f.finding.severity === "critical");
  const hasHighNew = newFindings.some((f) => f.finding.severity === "high");

  let overallStatus: ScanComparisonResult["overallStatus"];
  if (hasCriticalNew || (hasHighNew && newFindings.length > resolvedFindings.length)) {
    overallStatus = "regression";
  } else if (resolvedFindings.length > newFindings.length || riskScoreDelta < -5) {
    overallStatus = "improvement";
  } else {
    overallStatus = "stable";
  }

  // Human-readable assessment
  const assessmentParts: string[] = [];
  if (newFindings.length > 0) {
    assessmentParts.push(
      newFindings.length + " new finding(s) detected" +
      (hasCriticalNew ? " including CRITICAL issues" : hasHighNew ? " including HIGH severity issues" : "")
    );
  }
  if (resolvedFindings.length > 0) {
    assessmentParts.push(resolvedFindings.length + " finding(s) resolved since last scan");
  }
  if (newFindings.length === 0 && resolvedFindings.length === 0) {
    assessmentParts.push("No changes detected — security posture unchanged");
  }
  if (riskScoreDelta !== 0) {
    assessmentParts.push(
      "Risk score " + (riskScoreDelta > 0 ? "increased" : "decreased") +
      " by " + Math.abs(riskScoreDelta) + " points (" +
      riskScoreBaseline + " → " + riskScoreCompare + ")"
    );
  }

  const assessment = assessmentParts.join(". ") + ".";

  return {
    baselineScanId: baseline.scanId,
    compareScanId: compare.scanId,
    baselineDate: baseline.createdAt,
    compareDate: compare.createdAt,
    riskScoreDelta,
    riskScoreBaseline,
    riskScoreCompare,
    riskTrend,
    newFindings,
    resolvedFindings,
    persistingFindings,
    summaryDelta,
    newByCategory,
    resolvedByCategory,
    overallStatus,
    assessment,
  };
}

/**
 * Build a trend series from multiple scans (sorted by date).
 * Returns data suitable for charting.
 */
export interface TrendPoint {
  scanId: number;
  date: string;
  riskScore: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
  info: number;
  total: number;
}

export function buildTrendSeries(scans: ScanSnapshot[]): TrendPoint[] {
  return scans
    .slice()
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    .map((s) => ({
      scanId: s.scanId,
      date: s.createdAt,
      riskScore: s.riskScore ?? calcRiskScore(s.summary),
      critical: s.summary.critical,
      high: s.summary.high,
      medium: s.summary.medium,
      low: s.summary.low,
      info: s.summary.info,
      total: s.summary.total,
    }));
}
