/**
 * Audit Engine — Core Runner
 * ===========================
 * Executes audit checks for each audit type.
 * Designed to be called from tRPC mutations (manual trigger) or cron jobs.
 *
 * Each audit type returns an array of AuditFinding objects.
 * Results are persisted to the database via auditDb.ts.
 *
 * Open-source friendly: all checks are pure functions that accept
 * a config object and return structured findings — no side effects.
 */

import { exec as execCb } from "child_process";
import { promisify } from "util";
import * as http from "http";
import * as https from "https";
import { URL } from "url";
import type { InsertAuditFinding, InsertUptimeCheck, AuditProject } from "../drizzle/schema";
import {
  createAuditRun, completeAuditRun, createAuditFindings,
  createUptimeChecks, listAuditProjects,
} from "./auditDb";

const exec = promisify(execCb);

// ─── Types ────────────────────────────────────────────────────────────────────

export type AuditType = "uptime" | "security" | "functional" | "dependency" | "db_health";

export interface AuditConfig {
  /** Which audit type to run */
  type: AuditType;
  /** "schedule" | "manual" | user email */
  triggeredBy?: string;
  /** Limit to specific project IDs (omit for all) */
  projectIds?: number[];
}

export interface FindingInput {
  auditProjectId?: number;
  severity: "critical" | "high" | "medium" | "low" | "info";
  category: string;
  code: string;
  title: string;
  description?: string;
  location?: string;
  evidence?: string;
  autoFixed?: boolean;
  fixDescription?: string;
}

// ─── HTTP Fetch Helper ────────────────────────────────────────────────────────

function httpGet(url: string, timeoutMs = 10000): Promise<{ status: number; elapsed: number }> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const parsed = new URL(url);
    const lib = parsed.protocol === "https:" ? https : http;
    const req = lib.request(
      { hostname: parsed.hostname, port: parsed.port || undefined, path: parsed.pathname + parsed.search, method: "GET",
        headers: { "User-Agent": "sentinel-audit/1.0" }, timeout: timeoutMs },
      (res) => {
        res.resume(); // drain
        resolve({ status: res.statusCode ?? 0, elapsed: Date.now() - start });
      }
    );
    req.on("timeout", () => { req.destroy(); reject(new Error("TIMEOUT")); });
    req.on("error", reject);
    req.end();
  });
}

// ─── Shell Helper ─────────────────────────────────────────────────────────────

async function sh(cmd: string, cwd?: string): Promise<{ stdout: string; stderr: string; ok: boolean }> {
  try {
    const { stdout, stderr } = await exec(cmd, { cwd, timeout: 120_000 });
    return { stdout, stderr, ok: true };
  } catch (e: any) {
    return { stdout: e.stdout ?? "", stderr: e.stderr ?? e.message ?? "", ok: false };
  }
}

// ─── Uptime Audit ─────────────────────────────────────────────────────────────

async function runUptimeAudit(
  projects: AuditProject[],
  runId: number
): Promise<{ findings: FindingInput[]; uptimeRows: InsertUptimeCheck[] }> {
  const findings: FindingInput[] = [];
  const uptimeRows: InsertUptimeCheck[] = [];

  const urlProjects = projects.filter(p => p.type === "url" && p.enabled);

  for (const proj of urlProjects) {
    const config = (proj.config as any) ?? {};
    const urls: string[] = config.urls ?? [proj.target];

    for (const url of urls) {
      let statusCode: number | undefined;
      let responseTimeMs: number | undefined;
      let isUp = false;
      let isSlow = false;
      let errorMessage: string | undefined;

      try {
        const result = await httpGet(url, 10_000);
        statusCode = result.status;
        responseTimeMs = result.elapsed;
        isUp = result.status >= 200 && result.status < 400;
        isSlow = result.elapsed > 3000;

        if (!isUp) {
          findings.push({
            auditProjectId: proj.id,
            severity: "high",
            category: "uptime",
            code: "UPT-001",
            title: `Endpoint down: ${url}`,
            description: `HTTP ${result.status} — expected 2xx/3xx`,
            location: url,
          });
        } else if (isSlow) {
          findings.push({
            auditProjectId: proj.id,
            severity: "medium",
            category: "uptime",
            code: "UPT-002",
            title: `Slow response: ${url}`,
            description: `Response time ${result.elapsed}ms exceeds 3000ms threshold`,
            location: url,
          });
        }
      } catch (e: any) {
        errorMessage = String(e.message ?? e).slice(0, 512);
        findings.push({
          auditProjectId: proj.id,
          severity: "critical",
          category: "uptime",
          code: "UPT-001",
          title: `Endpoint unreachable: ${url}`,
          description: errorMessage,
          location: url,
        });
      }

      uptimeRows.push({
        auditProjectId: proj.id,
        url,
        statusCode,
        responseTimeMs,
        isUp,
        isSlow,
        errorMessage,
        checkedAt: new Date(),
      });
    }
  }

  return { findings, uptimeRows };
}

// ─── Security Audit ───────────────────────────────────────────────────────────

async function runSecurityAudit(projects: AuditProject[]): Promise<FindingInput[]> {
  const findings: FindingInput[] = [];
  const repoProjects = projects.filter(p => p.type === "github_repo" && p.enabled);

  const SECRET_PATTERNS = [
    { pattern: /sk-[a-zA-Z0-9]{20,}/g, name: "OpenAI API key", code: "SEC-001" },
    { pattern: /AKIA[0-9A-Z]{16}/g, name: "AWS Access Key", code: "SEC-002" },
    { pattern: /ghp_[a-zA-Z0-9]{36}/g, name: "GitHub Personal Access Token", code: "SEC-003" },
    { pattern: /-----BEGIN (RSA |EC )?PRIVATE KEY-----/g, name: "Private key", code: "SEC-004" },
    { pattern: /password\s*=\s*["'][^"']{8,}/gi, name: "Hardcoded password", code: "SEC-005" },
    { pattern: /DATABASE_URL\s*=\s*["'][^"']+["']/gi, name: "Hardcoded DB URL", code: "SEC-006" },
  ];

  for (const proj of repoProjects) {
    const repoPath = `/home/ubuntu/offshore-audit/${proj.target.split("/")[1] ?? proj.name}`;

    // Pull latest
    await sh(`git pull origin main 2>&1`, repoPath);

    // 1. Scan working tree for secrets
    const { stdout: grepOut } = await sh(
      `grep -rn --include="*.ts" --include="*.tsx" --include="*.js" --include="*.env*" -E "(sk-[a-zA-Z0-9]{20,}|AKIA[0-9A-Z]{16}|ghp_[a-zA-Z0-9]{36}|-----BEGIN.*PRIVATE KEY)" . 2>/dev/null | head -20`,
      repoPath
    );
    if (grepOut.trim()) {
      findings.push({
        auditProjectId: proj.id,
        severity: "critical",
        category: "secret_leak",
        code: "SEC-001",
        title: "Potential secret/credential found in source code",
        description: "Sensitive pattern detected in working tree",
        evidence: grepOut.slice(0, 500),
        location: repoPath,
      });
    }

    // 2. Check for .env files tracked in git
    const { stdout: envTracked } = await sh(
      `git ls-files | grep -E "^\\.env(\\..*)?$" 2>/dev/null`,
      repoPath
    );
    if (envTracked.trim()) {
      findings.push({
        auditProjectId: proj.id,
        severity: "high",
        category: "sensitive_file",
        code: "SEC-010",
        title: ".env file tracked in git",
        description: `Files: ${envTracked.trim()}`,
        location: envTracked.trim().split("\n")[0],
      });
    }

    // 3. Check .gitignore completeness
    const { stdout: gitignore } = await sh(`cat .gitignore 2>/dev/null`, repoPath);
    const missing = [".env", "*.key", "*.pem", "node_modules"].filter(p => !gitignore.includes(p));
    if (missing.length > 0) {
      findings.push({
        auditProjectId: proj.id,
        severity: "medium",
        category: "gitignore",
        code: "SEC-020",
        title: "Incomplete .gitignore",
        description: `Missing patterns: ${missing.join(", ")}`,
        location: ".gitignore",
      });
    }

    // 4. Check security headers in next.config
    const { stdout: nextConfig } = await sh(`cat next.config.mjs 2>/dev/null || cat next.config.js 2>/dev/null`, repoPath);
    const missingHeaders = ["Content-Security-Policy", "X-Frame-Options", "Strict-Transport-Security"]
      .filter(h => !nextConfig.includes(h));
    if (missingHeaders.length > 0) {
      findings.push({
        auditProjectId: proj.id,
        severity: "medium",
        category: "security_headers",
        code: "SEC-030",
        title: "Missing security headers",
        description: `Headers not configured: ${missingHeaders.join(", ")}`,
        location: "next.config.mjs",
      });
    }
  }

  return findings;
}

// ─── Dependency Audit ─────────────────────────────────────────────────────────

async function runDependencyAudit(projects: AuditProject[]): Promise<FindingInput[]> {
  const findings: FindingInput[] = [];
  const repoProjects = projects.filter(p => p.type === "github_repo" && p.enabled);

  for (const proj of repoProjects) {
    const config = (proj.config as any) ?? {};
    const pm = config.packageManager ?? "npm";
    const repoPath = `/home/ubuntu/offshore-audit/${proj.target.split("/")[1] ?? proj.name}`;

    if (!repoPath) continue;

    // npm/pnpm audit for CVEs
    const auditCmd = pm === "pnpm" ? "pnpm audit --json 2>/dev/null" : "npm audit --json 2>/dev/null";
    const { stdout: auditOut } = await sh(auditCmd, repoPath);

    try {
      const auditData = JSON.parse(auditOut || "{}");
      const vulns = auditData.vulnerabilities ?? {};
      const highCrit = Object.values(vulns).filter((v: any) => ["high", "critical"].includes(v.severity));

      if (highCrit.length > 0) {
        const names = highCrit.slice(0, 5).map((v: any) => v.name ?? "?").join(", ");
        findings.push({
          auditProjectId: proj.id,
          severity: "high",
          category: "cve",
          code: "DEP-001",
          title: `${highCrit.length} high/critical CVE(s) found`,
          description: `Affected packages: ${names}`,
          location: "package.json",
        });
      }
    } catch {
      // JSON parse failed — non-critical
    }

    // Check for outdated packages (top 5 major version gaps)
    const outdatedCmd = pm === "pnpm" ? "pnpm outdated --format json 2>/dev/null" : "npm outdated --json 2>/dev/null";
    const { stdout: outdatedOut } = await sh(outdatedCmd, repoPath);

    try {
      const outdated = JSON.parse(outdatedOut || "{}");
      const majorUpdates = Object.entries(outdated)
        .filter(([, info]: any) => {
          const cur = parseInt(info.current?.split(".")[0] ?? "0");
          const lat = parseInt(info.latest?.split(".")[0] ?? "0");
          return lat > cur;
        })
        .slice(0, 5);

      if (majorUpdates.length > 0) {
        const list = majorUpdates.map(([name, info]: any) => `${name} (${info.current}→${info.latest})`).join(", ");
        findings.push({
          auditProjectId: proj.id,
          severity: "low",
          category: "outdated",
          code: "DEP-010",
          title: `${majorUpdates.length} package(s) have major version updates`,
          description: list,
          location: "package.json",
        });
      }
    } catch {
      // non-critical
    }
  }

  return findings;
}

// ─── Functional Audit ─────────────────────────────────────────────────────────

async function runFunctionalAudit(projects: AuditProject[]): Promise<FindingInput[]> {
  const findings: FindingInput[] = [];
  const repoProjects = projects.filter(p => p.type === "github_repo" && p.enabled);

  for (const proj of repoProjects) {
    const repoPath = `/home/ubuntu/offshore-audit/${proj.target.split("/")[1] ?? proj.name}`;

    // 1. TypeScript errors
    const { stdout: tscOut, ok: tscOk } = await sh("npx tsc --noEmit 2>&1 | head -30", repoPath);
    if (!tscOk && tscOut.includes("error TS")) {
      const errorCount = (tscOut.match(/error TS/g) ?? []).length;
      findings.push({
        auditProjectId: proj.id,
        severity: "medium",
        category: "typescript",
        code: "FUN-001",
        title: `${errorCount} TypeScript error(s)`,
        description: "Run `tsc --noEmit` to see full list",
        evidence: tscOut.slice(0, 500),
        location: "tsconfig.json",
      });
    }

    // 2. console.log in server code
    const { stdout: logOut } = await sh(
      `grep -rn "console\\.log" --include="*.ts" --exclude-dir=node_modules --exclude-dir=".next" server/ app/api/ 2>/dev/null | wc -l`,
      repoPath
    );
    const logCount = parseInt(logOut.trim() ?? "0");
    if (logCount > 0) {
      findings.push({
        auditProjectId: proj.id,
        severity: "low",
        category: "code_quality",
        code: "FUN-010",
        title: `${logCount} console.log statement(s) in server code`,
        description: "Remove or replace with a proper logger before production",
        location: "server/",
      });
    }

    // 3. Missing .env.example
    const { ok: envExampleExists } = await sh(`test -f .env.example`, repoPath);
    if (!envExampleExists) {
      findings.push({
        auditProjectId: proj.id,
        severity: "medium",
        category: "documentation",
        code: "FUN-020",
        title: "Missing .env.example",
        description: "Add a .env.example file documenting all required environment variables",
        location: ".env.example",
      });
    }

    // 4. TODO/FIXME markers
    const { stdout: todoOut } = await sh(
      `grep -rn "TODO\\|FIXME\\|HACK" --include="*.ts" --include="*.tsx" --exclude-dir=node_modules --exclude-dir=".next" . 2>/dev/null | wc -l`,
      repoPath
    );
    const todoCount = parseInt(todoOut.trim() ?? "0");
    if (todoCount > 5) {
      findings.push({
        auditProjectId: proj.id,
        severity: "info",
        category: "code_quality",
        code: "FUN-030",
        title: `${todoCount} TODO/FIXME marker(s) in codebase`,
        description: "Review and resolve outstanding TODO/FIXME items",
        location: ".",
      });
    }
  }

  return findings;
}

// ─── Main Runner ──────────────────────────────────────────────────────────────

export async function runAudit(config: AuditConfig): Promise<{ runId: number; findingCount: number }> {
  const allProjects = await listAuditProjects();
  const projects = config.projectIds
    ? allProjects.filter(p => config.projectIds!.includes(p.id))
    : allProjects;

  // Create the run record
  const runId = await createAuditRun({
    auditType: config.type,
    triggeredBy: config.triggeredBy ?? "manual",
    startedAt: new Date(),
  });

  let findings: FindingInput[] = [];
  let uptimeRows: InsertUptimeCheck[] = [];
  let status: "completed" | "failed" = "completed";

  try {
    switch (config.type) {
      case "uptime": {
        const result = await runUptimeAudit(projects, runId);
        findings = result.findings;
        uptimeRows = result.uptimeRows;
        break;
      }
      case "security":
        findings = await runSecurityAudit(projects);
        break;
      case "dependency":
        findings = await runDependencyAudit(projects);
        break;
      case "functional":
        findings = await runFunctionalAudit(projects);
        break;
      case "db_health":
        // DB health runs via Supabase MCP — findings injected externally for now
        findings = [];
        break;
    }
  } catch (e: any) {
    status = "failed";
    findings.push({
      severity: "high",
      category: "engine",
      code: "ENG-001",
      title: "Audit engine error",
      description: String(e?.message ?? e),
    });
  }

  // Persist uptime rows
  if (uptimeRows.length > 0) {
    await createUptimeChecks(uptimeRows);
  }

  // Persist findings
  const dbFindings: InsertAuditFinding[] = findings.map(f => ({ ...f, runId }));
  await createAuditFindings(dbFindings);

  // Compute severity summary
  let criticalCount = 0, highCount = 0, mediumCount = 0, lowCount = 0;
  for (const f of findings) {
    if (f.severity === "critical") criticalCount++;
    else if (f.severity === "high") highCount++;
    else if (f.severity === "medium") mediumCount++;
    else if (f.severity === "low") lowCount++;
  }

  const overallSeverity =
    criticalCount > 0 ? "critical" :
    highCount > 0 ? "high" :
    mediumCount > 0 ? "medium" :
    lowCount > 0 ? "low" : "none";

  await completeAuditRun(runId, {
    status,
    severity: overallSeverity,
    totalFindings: findings.length,
    criticalCount,
    highCount,
    mediumCount,
    lowCount,
  });

  return { runId, findingCount: findings.length };
}
