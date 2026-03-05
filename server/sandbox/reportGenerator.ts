/**
 * Sentinel Report Generator v1.0
 * Generates HTML and structured JSON reports from scan results.
 * HTML reports are self-contained and can be opened in any browser or printed to PDF.
 */

import type { ScanResult, Finding, SeverityLevel } from "./scanner";

const SEVERITY_COLORS: Record<SeverityLevel, string> = {
  critical: "#dc2626",
  high: "#ea580c",
  medium: "#d97706",
  low: "#2563eb",
  info: "#6b7280",
};

const SEVERITY_BG: Record<SeverityLevel, string> = {
  critical: "#fef2f2",
  high: "#fff7ed",
  medium: "#fffbeb",
  low: "#eff6ff",
  info: "#f9fafb",
};

const SEVERITY_LABELS: Record<SeverityLevel, string> = {
  critical: "CRITICAL",
  high: "HIGH",
  medium: "MEDIUM",
  low: "LOW",
  info: "INFO",
};

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function severityBadge(severity: SeverityLevel): string {
  const color = SEVERITY_COLORS[severity];
  const bg = SEVERITY_BG[severity];
  const label = SEVERITY_LABELS[severity];
  return `<span style="display:inline-block;padding:2px 10px;border-radius:12px;font-size:11px;font-weight:700;letter-spacing:0.5px;color:${color};background:${bg};border:1px solid ${color}30;">${label}</span>`;
}

function donutChart(summary: ScanResult["summary"]): string {
  const total = summary.total || 1;
  const segments = [
    { key: "critical" as SeverityLevel, count: summary.critical },
    { key: "high" as SeverityLevel, count: summary.high },
    { key: "medium" as SeverityLevel, count: summary.medium },
    { key: "low" as SeverityLevel, count: summary.low },
    { key: "info" as SeverityLevel, count: summary.info },
  ].filter((s) => s.count > 0);

  if (segments.length === 0) {
    return `<svg width="160" height="160" viewBox="0 0 160 160"><circle cx="80" cy="80" r="60" fill="none" stroke="#e5e7eb" stroke-width="20"/><text x="80" y="86" text-anchor="middle" font-size="22" font-weight="bold" fill="#6b7280">0</text></svg>`;
  }

  let offset = 0;
  const circumference = 2 * Math.PI * 60;
  const paths: string[] = [];

  for (const seg of segments) {
    const pct = seg.count / total;
    const dash = pct * circumference;
    const gap = circumference - dash;
    paths.push(
      `<circle cx="80" cy="80" r="60" fill="none" stroke="${SEVERITY_COLORS[seg.key]}" stroke-width="20" stroke-dasharray="${dash.toFixed(2)} ${gap.toFixed(2)}" stroke-dashoffset="${(-offset * circumference).toFixed(2)}" transform="rotate(-90 80 80)"/>`
    );
    offset += pct;
  }

  return `<svg width="160" height="160" viewBox="0 0 160 160">
    ${paths.join("\n    ")}
    <text x="80" y="76" text-anchor="middle" font-size="26" font-weight="bold" fill="#111827">${total}</text>
    <text x="80" y="96" text-anchor="middle" font-size="12" fill="#6b7280">findings</text>
  </svg>`;
}

// ─── OWASP Top 10 coverage table ──────────────────────────────────────────────

const OWASP_TOP_10: Array<{ id: string; name: string; categories: string[] }> = [
  { id: "A01", name: "Broken Access Control",           categories: ["Access Control", "Directory Traversal", "Path Traversal"] },
  { id: "A02", name: "Cryptographic Failures",          categories: ["SSL/TLS", "HTTPS", "Cryptography"] },
  { id: "A03", name: "Injection",                       categories: ["SQL Injection", "Command Injection", "XXE", "LDAP Injection"] },
  { id: "A04", name: "Insecure Design",                 categories: ["CSRF", "Business Logic"] },
  { id: "A05", name: "Security Misconfiguration",       categories: ["Security Headers", "CORS", "Server Info", "Debug Endpoints", "Admin Panel"] },
  { id: "A06", name: "Vulnerable Components",           categories: ["CVE", "Outdated Libraries", "Dependency"] },
  { id: "A07", name: "Auth Failures",                   categories: ["Authentication", "Session", "JWT", "Cookie Security"] },
  { id: "A08", name: "Software Integrity Failures",     categories: ["Subresource Integrity", "Supply Chain"] },
  { id: "A09", name: "Logging & Monitoring Failures",   categories: ["Information Disclosure", "Error Handling"] },
  { id: "A10", name: "SSRF",                            categories: ["SSRF", "Server-Side Request Forgery"] },
];

function owaspCoverageTable(findings: Finding[]): string {
  const foundCategories = new Set(findings.map((f) => f.category));
  const rows = OWASP_TOP_10.map((item) => {
    const hit = item.categories.some((c) =>
      Array.from(foundCategories).some((fc) => fc.toLowerCase().includes(c.toLowerCase()))
    );
    const relatedFindings = findings.filter((f) =>
      item.categories.some((c) => f.category.toLowerCase().includes(c.toLowerCase()))
    );
    const maxSev = relatedFindings.length > 0
      ? ["critical", "high", "medium", "low", "info"].find((s) =>
          relatedFindings.some((f) => f.severity === s)
        ) as SeverityLevel | undefined
      : undefined;
    return `<tr style="border-bottom:1px solid #f3f4f6;">
      <td style="padding:8px 12px;font-size:12px;color:#6b7280;white-space:nowrap;">${item.id}</td>
      <td style="padding:8px 12px;font-size:13px;color:#374151;">${escapeHtml(item.name)}</td>
      <td style="padding:8px 12px;text-align:center;">
        ${hit
          ? `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${maxSev ? SEVERITY_COLORS[maxSev] : "#dc2626"};"></span>`
          : `<span style="font-size:11px;color:#9ca3af;">—</span>`}
      </td>
      <td style="padding:8px 12px;text-align:center;font-size:12px;font-weight:600;color:${relatedFindings.length > 0 ? SEVERITY_COLORS[maxSev ?? "info"] : "#9ca3af"}">
        ${relatedFindings.length > 0 ? relatedFindings.length : "—"}
      </td>
    </tr>`;
  });
  return `
  <div style="background:white;border:1px solid #e5e7eb;border-radius:12px;padding:24px;margin-bottom:32px;">
    <h2 style="font-size:16px;font-weight:700;margin:0 0 16px;color:#111827;">OWASP Top 10 Coverage</h2>
    <table style="width:100%;border-collapse:collapse;">
      <thead>
        <tr style="background:#f9fafb;">
          <th style="padding:8px 12px;text-align:left;font-size:11px;color:#6b7280;font-weight:600;">ID</th>
          <th style="padding:8px 12px;text-align:left;font-size:11px;color:#6b7280;font-weight:600;">CATEGORY</th>
          <th style="padding:8px 12px;text-align:center;font-size:11px;color:#6b7280;font-weight:600;">DETECTED</th>
          <th style="padding:8px 12px;text-align:center;font-size:11px;color:#6b7280;font-weight:600;">FINDINGS</th>
        </tr>
      </thead>
      <tbody>${rows.join("")}</tbody>
    </table>
  </div>`;
}

// ─── Category bar chart ────────────────────────────────────────────────────────

function categoryBarChart(findings: Finding[]): string {
  if (findings.length === 0) return "";
  const counts: Record<string, { count: number; maxSev: SeverityLevel }> = {};
  for (const f of findings) {
    if (!counts[f.category]) counts[f.category] = { count: 0, maxSev: f.severity };
    counts[f.category].count++;
    const sevOrder: SeverityLevel[] = ["critical", "high", "medium", "low", "info"];
    if (sevOrder.indexOf(f.severity) < sevOrder.indexOf(counts[f.category].maxSev)) {
      counts[f.category].maxSev = f.severity;
    }
  }
  const sorted = Object.entries(counts).sort((a, b) => b[1].count - a[1].count).slice(0, 10);
  const maxCount = sorted[0]?.[1].count ?? 1;
  const bars = sorted.map(([cat, { count, maxSev }]) => `
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:8px;">
      <div style="width:160px;font-size:12px;color:#374151;text-align:right;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="${escapeHtml(cat)}">${escapeHtml(cat)}</div>
      <div style="flex:1;background:#f3f4f6;border-radius:4px;height:20px;overflow:hidden;">
        <div style="height:100%;background:${SEVERITY_COLORS[maxSev]};width:${(count / maxCount) * 100}%;border-radius:4px;transition:width 0.3s;"></div>
      </div>
      <div style="width:24px;font-size:12px;font-weight:600;color:#111827;">${count}</div>
    </div>`).join("");
  return `
  <div style="background:white;border:1px solid #e5e7eb;border-radius:12px;padding:24px;margin-bottom:32px;">
    <h2 style="font-size:16px;font-weight:700;margin:0 0 16px;color:#111827;">Findings by Category</h2>
    ${bars}
  </div>`;
}

// ─── Executive summary ─────────────────────────────────────────────────────────

function executiveSummary(findings: Finding[], summary: ScanResult["summary"], riskScore: number, riskLevel: string, riskColor: string): string {
  const criticalTitles = findings.filter((f) => f.severity === "critical").map((f) => f.title).slice(0, 3);
  const highTitles = findings.filter((f) => f.severity === "high").map((f) => f.title).slice(0, 3);

  const nextSteps: string[] = [];
  if (summary.critical > 0) nextSteps.push(`Address ${summary.critical} critical issue${summary.critical > 1 ? "s" : ""} immediately before any production deployment.`);
  if (summary.high > 0) nextSteps.push(`Remediate ${summary.high} high-severity finding${summary.high > 1 ? "s" : ""} within 7 days.`);
  if (summary.medium > 0) nextSteps.push(`Schedule remediation of ${summary.medium} medium-severity issue${summary.medium > 1 ? "s" : ""} within 30 days.`);
  if (summary.total === 0) nextSteps.push("No issues found. Schedule regular scans to maintain security posture.");
  nextSteps.push("Re-run a full scan after applying fixes to verify remediation.");

  return `
  <div style="background:white;border:1px solid #e5e7eb;border-radius:12px;padding:24px;margin-bottom:32px;">
    <h2 style="font-size:16px;font-weight:700;margin:0 0 16px;color:#111827;">Executive Summary</h2>
    <p style="font-size:14px;color:#374151;line-height:1.7;margin:0 0 16px;">
      The security assessment identified <strong>${summary.total} finding${summary.total !== 1 ? "s" : ""}</strong> across the scanned target,
      resulting in an overall risk score of <strong style="color:${riskColor};">${riskScore}/100 (${riskLevel})</strong>.
      ${summary.critical > 0 ? `<span style="color:#dc2626;">There ${summary.critical === 1 ? "is" : "are"} <strong>${summary.critical} critical vulnerability${summary.critical > 1 ? " vulnerabilities" : ""}</strong> requiring immediate attention.</span>` : "No critical vulnerabilities were detected."}
    </p>
    ${criticalTitles.length > 0 ? `
    <div style="margin-bottom:16px;">
      <div style="font-size:12px;font-weight:600;color:#dc2626;margin-bottom:8px;text-transform:uppercase;letter-spacing:0.5px;">Critical Issues</div>
      <ul style="margin:0;padding-left:20px;">${criticalTitles.map((t) => `<li style="font-size:13px;color:#374151;margin-bottom:4px;">${escapeHtml(t)}</li>`).join("")}</ul>
    </div>` : ""}
    ${highTitles.length > 0 ? `
    <div style="margin-bottom:16px;">
      <div style="font-size:12px;font-weight:600;color:#ea580c;margin-bottom:8px;text-transform:uppercase;letter-spacing:0.5px;">High Severity Issues</div>
      <ul style="margin:0;padding-left:20px;">${highTitles.map((t) => `<li style="font-size:13px;color:#374151;margin-bottom:4px;">${escapeHtml(t)}</li>`).join("")}</ul>
    </div>` : ""}
    <div style="background:#f0f9ff;border:1px solid #bae6fd;border-radius:8px;padding:16px;">
      <div style="font-size:12px;font-weight:600;color:#0369a1;margin-bottom:8px;text-transform:uppercase;letter-spacing:0.5px;">Recommended Next Steps</div>
      <ol style="margin:0;padding-left:20px;">${nextSteps.map((s) => `<li style="font-size:13px;color:#0c4a6e;margin-bottom:4px;line-height:1.5;">${escapeHtml(s)}</li>`).join("")}</ol>
    </div>
  </div>`;
}

function findingCard(f: Finding, index: number): string {
  const color = SEVERITY_COLORS[f.severity];
  return `
  <div style="margin-bottom:16px;border:1px solid #e5e7eb;border-left:4px solid ${color};border-radius:8px;overflow:hidden;page-break-inside:avoid;">
    <div style="padding:14px 18px;background:#fafafa;display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
      <span style="color:#9ca3af;font-size:12px;min-width:24px;">#${index + 1}</span>
      ${severityBadge(f.severity)}
      <span style="font-weight:600;font-size:14px;color:#111827;flex:1;">${escapeHtml(f.title)}</span>
      ${f.cvssScore ? `<span style="font-size:12px;color:#6b7280;white-space:nowrap;">CVSS: <strong>${f.cvssScore}</strong></span>` : ""}
    </div>
    <div style="padding:14px 18px;">
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px;">
        <span style="font-size:11px;background:#f3f4f6;padding:2px 8px;border-radius:4px;color:#374151;">${escapeHtml(f.category)}</span>
        ${f.cwe ? `<span style="font-size:11px;background:#f3f4f6;padding:2px 8px;border-radius:4px;color:#374151;">${escapeHtml(f.cwe)}</span>` : ""}
        ${f.owasp ? `<span style="font-size:11px;background:#f3f4f6;padding:2px 8px;border-radius:4px;color:#374151;">${escapeHtml(f.owasp)}</span>` : ""}
      </div>
      <p style="margin:0 0 10px;font-size:13px;color:#374151;line-height:1.6;">${escapeHtml(f.description)}</p>
      ${
        f.affectedUrl
          ? `<p style="margin:0 0 10px;font-size:12px;"><strong style="color:#6b7280;">Affected URL:</strong> <code style="background:#f3f4f6;padding:1px 6px;border-radius:3px;font-size:11px;">${escapeHtml(f.affectedUrl)}</code></p>`
          : ""
      }
      ${
        f.evidence
          ? `<div style="margin:0 0 10px;"><strong style="font-size:12px;color:#6b7280;">Evidence:</strong><pre style="margin:4px 0 0;background:#1e1e1e;color:#d4d4d4;padding:10px 14px;border-radius:6px;font-size:11px;overflow-x:auto;white-space:pre-wrap;word-break:break-all;">${escapeHtml(f.evidence)}</pre></div>`
          : ""
      }
      <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:6px;padding:10px 14px;">
        <strong style="font-size:12px;color:#15803d;">Remediation:</strong>
        <p style="margin:4px 0 0;font-size:12px;color:#166534;line-height:1.5;">${escapeHtml(f.remediation)}</p>
      </div>
    </div>
  </div>`;
}

export function generateHtmlReport(
  result: ScanResult,
  sandboxName: string,
  techStack?: string
): string {
  const { findings, summary, targetUrl, scanType, duration, startedAt, completedAt } = result;

  const durationSec = (duration / 1000).toFixed(1);
  const dateStr = startedAt.toLocaleDateString("en-GB", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const riskScore = Math.min(
    100,
    summary.critical * 20 +
      summary.high * 10 +
      summary.medium * 5 +
      summary.low * 2 +
      summary.info * 1
  );

  const riskLevel =
    riskScore >= 60
      ? "Critical Risk"
      : riskScore >= 40
      ? "High Risk"
      : riskScore >= 20
      ? "Medium Risk"
      : riskScore >= 5
      ? "Low Risk"
      : "Minimal Risk";

  const riskColor =
    riskScore >= 60
      ? "#dc2626"
      : riskScore >= 40
      ? "#ea580c"
      : riskScore >= 20
      ? "#d97706"
      : riskScore >= 5
      ? "#2563eb"
      : "#16a34a";

  const groupedByCategory: Record<string, Finding[]> = {};
  for (const f of findings) {
    if (!groupedByCategory[f.category]) groupedByCategory[f.category] = [];
    groupedByCategory[f.category].push(f);
  }

  const tocItems = Object.keys(groupedByCategory)
    .map(
      (cat, i) =>
        `<li><a href="#cat-${i}" style="color:#2563eb;text-decoration:none;">${escapeHtml(cat)} (${groupedByCategory[cat].length})</a></li>`
    )
    .join("\n");

  let findingsHtml = "";
  let catIndex = 0;
  for (const [category, catFindings] of Object.entries(groupedByCategory)) {
    const catColor = SEVERITY_COLORS[catFindings[0].severity] || "#6b7280";
    findingsHtml += `
    <div id="cat-${catIndex}" style="margin-bottom:32px;">
      <h3 style="font-size:16px;font-weight:700;color:#111827;margin:0 0 12px;padding-bottom:8px;border-bottom:2px solid ${catColor}20;">
        ${escapeHtml(category)}
        <span style="font-size:13px;font-weight:400;color:#6b7280;margin-left:8px;">${catFindings.length} finding${catFindings.length !== 1 ? "s" : ""}</span>
      </h3>
      ${catFindings.map((f, i) => findingCard(f, findings.indexOf(f))).join("")}
    </div>`;
    catIndex++;
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Sentinel Security Report — ${escapeHtml(sandboxName)}</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 0; background: #f9fafb; color: #111827; }
    .page { max-width: 960px; margin: 0 auto; padding: 40px 24px; }
    @media print {
      body { background: white; }
      .page { padding: 20px; }
      .no-print { display: none !important; }
    }
    a { color: #2563eb; }
    code { font-family: 'Courier New', monospace; }
  </style>
</head>
<body>
<div class="page">

  <!-- Header -->
  <div style="background:linear-gradient(135deg,#0f172a 0%,#1e3a5f 100%);color:white;padding:32px;border-radius:12px;margin-bottom:32px;">
    <div style="display:flex;align-items:center;gap:16px;margin-bottom:20px;">
      <div style="width:48px;height:48px;background:rgba(255,255,255,0.15);border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:24px;">🛡️</div>
      <div>
        <div style="font-size:11px;text-transform:uppercase;letter-spacing:1px;opacity:0.7;">Sentinel Security Report</div>
        <div style="font-size:22px;font-weight:700;">${escapeHtml(sandboxName)}</div>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:16px;">
      <div><div style="font-size:11px;opacity:0.6;margin-bottom:4px;">TARGET</div><div style="font-size:13px;word-break:break-all;">${escapeHtml(targetUrl)}</div></div>
      <div><div style="font-size:11px;opacity:0.6;margin-bottom:4px;">SCAN TYPE</div><div style="font-size:13px;text-transform:uppercase;">${escapeHtml(scanType)}</div></div>
      <div><div style="font-size:11px;opacity:0.6;margin-bottom:4px;">DATE</div><div style="font-size:13px;">${dateStr}</div></div>
      <div><div style="font-size:11px;opacity:0.6;margin-bottom:4px;">DURATION</div><div style="font-size:13px;">${durationSec}s</div></div>
      ${techStack ? `<div><div style="font-size:11px;opacity:0.6;margin-bottom:4px;">TECH STACK</div><div style="font-size:13px;">${escapeHtml(techStack)}</div></div>` : ""}
    </div>
  </div>

  <!-- Executive Summary -->
  ${executiveSummary(findings, summary, riskScore, riskLevel, riskColor)}

  <!-- Risk Score + Summary -->
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-bottom:32px;">
    <div style="background:white;border:1px solid #e5e7eb;border-radius:12px;padding:24px;display:flex;align-items:center;gap:24px;">
      ${donutChart(summary)}
      <div>
        <div style="font-size:12px;color:#6b7280;margin-bottom:8px;">SEVERITY BREAKDOWN</div>
        ${(["critical", "high", "medium", "low", "info"] as SeverityLevel[])
          .map(
            (s) =>
              `<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
                <div style="width:10px;height:10px;border-radius:50%;background:${SEVERITY_COLORS[s]};flex-shrink:0;"></div>
                <span style="font-size:12px;color:#374151;width:60px;">${SEVERITY_LABELS[s]}</span>
                <span style="font-size:13px;font-weight:600;color:#111827;">${summary[s]}</span>
              </div>`
          )
          .join("")}
      </div>
    </div>
    <div style="background:white;border:1px solid #e5e7eb;border-radius:12px;padding:24px;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;">
      <div style="font-size:12px;color:#6b7280;margin-bottom:12px;text-transform:uppercase;letter-spacing:0.5px;">Overall Risk Score</div>
      <div style="font-size:64px;font-weight:800;color:${riskColor};line-height:1;">${riskScore}</div>
      <div style="font-size:14px;font-weight:600;color:${riskColor};margin-top:8px;">${riskLevel}</div>
      <div style="font-size:11px;color:#9ca3af;margin-top:8px;">Score = Critical×20 + High×10 + Medium×5 + Low×2 + Info×1</div>
    </div>
  </div>

  <!-- OWASP Coverage + Category Chart -->
  ${owaspCoverageTable(findings)}
  ${categoryBarChart(findings)}

  ${
    findings.length === 0
      ? `<div style="background:white;border:1px solid #e5e7eb;border-radius:12px;padding:48px;text-align:center;">
          <div style="font-size:48px;margin-bottom:16px;">✅</div>
          <div style="font-size:18px;font-weight:600;color:#16a34a;">No vulnerabilities detected</div>
          <div style="font-size:14px;color:#6b7280;margin-top:8px;">The ${escapeHtml(scanType)} scan completed without finding any issues.</div>
        </div>`
      : `
  <!-- Table of Contents -->
  <div style="background:white;border:1px solid #e5e7eb;border-radius:12px;padding:24px;margin-bottom:32px;">
    <h2 style="font-size:16px;font-weight:700;margin:0 0 16px;color:#111827;">Table of Contents</h2>
    <ol style="margin:0;padding-left:20px;columns:2;column-gap:32px;">
      ${tocItems}
    </ol>
  </div>

  <!-- Findings -->
  <div style="background:white;border:1px solid #e5e7eb;border-radius:12px;padding:24px;">
    <h2 style="font-size:18px;font-weight:700;margin:0 0 24px;color:#111827;">Detailed Findings</h2>
    ${findingsHtml}
  </div>`
  }

  <!-- Footer -->
  <div style="margin-top:32px;padding:20px;text-align:center;font-size:12px;color:#9ca3af;border-top:1px solid #e5e7eb;">
    Generated by <strong>Sentinel Security Scanner v2.0</strong> — AI Control Center<br>
    This report was generated on a sandboxed copy of the target. All data is anonymized.
  </div>

</div>
</body>
</html>`;
}

export interface ReportData {
  html: string;
  json: string;
  summary: {
    sandboxName: string;
    targetUrl: string;
    scanType: string;
    riskScore: number;
    riskLevel: string;
    totalFindings: number;
    critical: number;
    high: number;
    medium: number;
    low: number;
    info: number;
    duration: number;
    generatedAt: string;
  };
}

export function generateReport(
  result: ScanResult,
  sandboxName: string,
  techStack?: string
): ReportData {
  const riskScore = Math.min(
    100,
    result.summary.critical * 20 +
      result.summary.high * 10 +
      result.summary.medium * 5 +
      result.summary.low * 2 +
      result.summary.info * 1
  );

  const riskLevel =
    riskScore >= 60
      ? "Critical Risk"
      : riskScore >= 40
      ? "High Risk"
      : riskScore >= 20
      ? "Medium Risk"
      : riskScore >= 5
      ? "Low Risk"
      : "Minimal Risk";

  const html = generateHtmlReport(result, sandboxName, techStack);
  const json = JSON.stringify(
    {
      meta: {
        tool: "Sentinel Security Scanner",
        version: "2.0",
        generatedAt: new Date().toISOString(),
        sandboxName,
        techStack,
      },
      scan: {
        targetUrl: result.targetUrl,
        scanType: result.scanType,
        startedAt: result.startedAt.toISOString(),
        completedAt: result.completedAt.toISOString(),
        durationMs: result.duration,
      },
      summary: {
        ...result.summary,
        riskScore,
        riskLevel,
      },
      findings: result.findings,
    },
    null,
    2
  );

  return {
    html,
    json,
    summary: {
      sandboxName,
      targetUrl: result.targetUrl,
      scanType: result.scanType,
      riskScore,
      riskLevel,
      totalFindings: result.summary.total,
      critical: result.summary.critical,
      high: result.summary.high,
      medium: result.summary.medium,
      low: result.summary.low,
      info: result.summary.info,
      duration: result.duration,
      generatedAt: new Date().toISOString(),
    },
  };
}
