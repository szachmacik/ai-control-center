/**
 * Security Sandbox — Vulnerability Scanner Engine
 *
 * Implements passive and active security checks against sandbox environments.
 * IMPORTANT: Active checks MUST only run against sandbox URLs, never production.
 */

import * as https from "https";
import * as http from "http";
import { URL } from "url";

// ─── Types ────────────────────────────────────────────────────────────────────

export type SeverityLevel = "critical" | "high" | "medium" | "low" | "info";
export type ScanType = "passive" | "active" | "xss" | "sqli" | "headers" | "ssl" | "csrf" | "open_redirect" | "full";

export interface Finding {
  severity: SeverityLevel;
  category: string;
  title: string;
  description: string;
  evidence?: string;
  affectedUrl?: string;
  remediation: string;
  cvssScore?: string;
}

export interface ScanSummary {
  critical: number;
  high: number;
  medium: number;
  low: number;
  info: number;
  total: number;
}

export interface ScanResult {
  findings: Finding[];
  summary: ScanSummary;
  scanType: ScanType;
  targetUrl: string;
  duration: number; // ms
}

// ─── HTTP Helpers ─────────────────────────────────────────────────────────────

interface HttpResponse {
  statusCode: number;
  headers: Record<string, string | string[] | undefined>;
  body: string;
  url: string;
}

async function fetchUrl(url: string, options: {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  timeout?: number;
  followRedirects?: boolean;
} = {}): Promise<HttpResponse> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const lib = parsed.protocol === "https:" ? https : http;
    const timeout = options.timeout ?? 10_000;

    const reqOptions = {
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === "https:" ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method: options.method ?? "GET",
      headers: {
        "User-Agent": "Sentinel-SecurityScanner/1.0 (sandbox-only)",
        ...options.headers,
      },
      rejectUnauthorized: false, // Allow self-signed certs in sandbox
    };

    const req = lib.request(reqOptions, (res) => {
      let body = "";
      res.on("data", (chunk) => { body += chunk; });
      res.on("end", () => {
        resolve({
          statusCode: res.statusCode ?? 0,
          headers: res.headers as Record<string, string | string[] | undefined>,
          body,
          url,
        });
      });
    });

    req.setTimeout(timeout, () => {
      req.destroy();
      reject(new Error(`Request timeout: ${url}`));
    });

    req.on("error", reject);

    if (options.body) {
      req.write(options.body);
    }
    req.end();
  });
}

// ─── Security Header Checks ───────────────────────────────────────────────────

export async function checkSecurityHeaders(targetUrl: string): Promise<Finding[]> {
  const findings: Finding[] = [];

  let response: HttpResponse;
  try {
    response = await fetchUrl(targetUrl);
  } catch (err) {
    findings.push({
      severity: "info",
      category: "Connectivity",
      title: "Could not connect to target",
      description: `Failed to fetch ${targetUrl}: ${err instanceof Error ? err.message : String(err)}`,
      remediation: "Ensure the sandbox environment is running and accessible.",
    });
    return findings;
  }

  const headers = response.headers;

  // Content-Security-Policy
  if (!headers["content-security-policy"]) {
    findings.push({
      severity: "high",
      category: "Missing Security Header",
      title: "Content-Security-Policy header missing",
      description: "The Content-Security-Policy (CSP) header is not set. This leaves the application vulnerable to Cross-Site Scripting (XSS) and data injection attacks.",
      affectedUrl: targetUrl,
      remediation: "Add a strict CSP header: `Content-Security-Policy: default-src 'self'; script-src 'self'; object-src 'none';`",
      cvssScore: "6.1",
    });
  }

  // Strict-Transport-Security
  if (!headers["strict-transport-security"]) {
    findings.push({
      severity: "medium",
      category: "Missing Security Header",
      title: "Strict-Transport-Security (HSTS) header missing",
      description: "HSTS is not configured. Without it, browsers may connect over insecure HTTP, enabling downgrade attacks.",
      affectedUrl: targetUrl,
      remediation: "Add: `Strict-Transport-Security: max-age=31536000; includeSubDomains; preload`",
      cvssScore: "4.3",
    });
  }

  // X-Frame-Options / CSP frame-ancestors
  const hasFrameOptions = headers["x-frame-options"];
  const csp = (headers["content-security-policy"] as string) ?? "";
  const hasFrameAncestors = csp.includes("frame-ancestors");
  if (!hasFrameOptions && !hasFrameAncestors) {
    findings.push({
      severity: "medium",
      category: "Clickjacking",
      title: "Clickjacking protection missing (X-Frame-Options / CSP frame-ancestors)",
      description: "The page can be embedded in an iframe on any domain, enabling clickjacking attacks.",
      affectedUrl: targetUrl,
      remediation: "Add: `X-Frame-Options: DENY` or use CSP `frame-ancestors 'none'`",
      cvssScore: "4.3",
    });
  }

  // X-Content-Type-Options
  if (!headers["x-content-type-options"]) {
    findings.push({
      severity: "low",
      category: "Missing Security Header",
      title: "X-Content-Type-Options header missing",
      description: "Without this header, browsers may MIME-sniff the content type, potentially executing malicious content.",
      affectedUrl: targetUrl,
      remediation: "Add: `X-Content-Type-Options: nosniff`",
      cvssScore: "3.7",
    });
  }

  // Referrer-Policy
  if (!headers["referrer-policy"]) {
    findings.push({
      severity: "low",
      category: "Missing Security Header",
      title: "Referrer-Policy header missing",
      description: "Without Referrer-Policy, sensitive URL parameters may be leaked to third-party sites via the Referer header.",
      affectedUrl: targetUrl,
      remediation: "Add: `Referrer-Policy: strict-origin-when-cross-origin`",
      cvssScore: "3.1",
    });
  }

  // Permissions-Policy
  if (!headers["permissions-policy"]) {
    findings.push({
      severity: "info",
      category: "Missing Security Header",
      title: "Permissions-Policy header missing",
      description: "Permissions-Policy controls access to browser features (camera, microphone, geolocation). Not setting it leaves defaults in place.",
      affectedUrl: targetUrl,
      remediation: "Add: `Permissions-Policy: camera=(), microphone=(), geolocation=()`",
      cvssScore: "2.3",
    });
  }

  // Server header disclosure
  const serverHeader = headers["server"] as string | undefined;
  if (serverHeader && (serverHeader.includes("/") || /\d/.test(serverHeader))) {
    findings.push({
      severity: "low",
      category: "Information Disclosure",
      title: "Server version disclosed in response headers",
      description: `The Server header reveals version information: "${serverHeader}". Attackers can use this to target known vulnerabilities.`,
      evidence: `Server: ${serverHeader}`,
      affectedUrl: targetUrl,
      remediation: "Configure your web server to hide version information. For nginx: `server_tokens off;` For Apache: `ServerTokens Prod`",
      cvssScore: "3.1",
    });
  }

  // X-Powered-By disclosure
  const poweredBy = headers["x-powered-by"] as string | undefined;
  if (poweredBy) {
    findings.push({
      severity: "low",
      category: "Information Disclosure",
      title: "Technology stack disclosed via X-Powered-By header",
      description: `X-Powered-By header reveals: "${poweredBy}". This helps attackers identify the technology stack.`,
      evidence: `X-Powered-By: ${poweredBy}`,
      affectedUrl: targetUrl,
      remediation: "Remove the X-Powered-By header. For Express.js: `app.disable('x-powered-by')`",
      cvssScore: "3.1",
    });
  }

  return findings;
}

// ─── Cookie Security Checks ───────────────────────────────────────────────────

export async function checkCookieSecurity(targetUrl: string): Promise<Finding[]> {
  const findings: Finding[] = [];

  let response: HttpResponse;
  try {
    response = await fetchUrl(targetUrl);
  } catch {
    return findings;
  }

  const setCookieHeaders = response.headers["set-cookie"];
  if (!setCookieHeaders) return findings;

  const cookies = Array.isArray(setCookieHeaders) ? setCookieHeaders : [setCookieHeaders];

  for (const cookie of cookies) {
    const cookieName = cookie.split("=")[0].trim();
    const cookieLower = cookie.toLowerCase();

    if (!cookieLower.includes("httponly")) {
      findings.push({
        severity: "high",
        category: "Cookie Security",
        title: `Cookie "${cookieName}" missing HttpOnly flag`,
        description: "Without the HttpOnly flag, this cookie can be accessed by JavaScript, making it vulnerable to XSS-based session hijacking.",
        evidence: `Set-Cookie: ${cookie}`,
        affectedUrl: targetUrl,
        remediation: "Add the HttpOnly flag to all session cookies: `Set-Cookie: session=...; HttpOnly; Secure; SameSite=Strict`",
        cvssScore: "6.1",
      });
    }

    if (!cookieLower.includes("secure")) {
      findings.push({
        severity: "medium",
        category: "Cookie Security",
        title: `Cookie "${cookieName}" missing Secure flag`,
        description: "Without the Secure flag, this cookie may be transmitted over unencrypted HTTP connections.",
        evidence: `Set-Cookie: ${cookie}`,
        affectedUrl: targetUrl,
        remediation: "Add the Secure flag to all cookies: `Set-Cookie: ...; Secure`",
        cvssScore: "4.3",
      });
    }

    if (!cookieLower.includes("samesite")) {
      findings.push({
        severity: "medium",
        category: "CSRF / Cookie Security",
        title: `Cookie "${cookieName}" missing SameSite attribute`,
        description: "Without SameSite, this cookie is sent with cross-site requests, potentially enabling CSRF attacks.",
        evidence: `Set-Cookie: ${cookie}`,
        affectedUrl: targetUrl,
        remediation: "Add SameSite=Strict or SameSite=Lax: `Set-Cookie: ...; SameSite=Strict`",
        cvssScore: "4.3",
      });
    }
  }

  return findings;
}

// ─── Sensitive File Exposure ───────────────────────────────────────────────────

const SENSITIVE_PATHS = [
  { path: "/.env", severity: "critical" as SeverityLevel, title: "Environment file exposed" },
  { path: "/.git/config", severity: "critical" as SeverityLevel, title: "Git repository exposed" },
  { path: "/.git/HEAD", severity: "critical" as SeverityLevel, title: "Git repository exposed" },
  { path: "/wp-config.php", severity: "critical" as SeverityLevel, title: "WordPress config exposed" },
  { path: "/config.php", severity: "critical" as SeverityLevel, title: "PHP config file exposed" },
  { path: "/database.yml", severity: "high" as SeverityLevel, title: "Database config exposed" },
  { path: "/backup.sql", severity: "high" as SeverityLevel, title: "Database backup exposed" },
  { path: "/dump.sql", severity: "high" as SeverityLevel, title: "Database dump exposed" },
  { path: "/.htpasswd", severity: "high" as SeverityLevel, title: "Password file exposed" },
  { path: "/phpinfo.php", severity: "high" as SeverityLevel, title: "PHP info page exposed" },
  { path: "/server-status", severity: "medium" as SeverityLevel, title: "Apache server-status exposed" },
  { path: "/robots.txt", severity: "info" as SeverityLevel, title: "Robots.txt found (review for sensitive paths)" },
  { path: "/sitemap.xml", severity: "info" as SeverityLevel, title: "Sitemap found" },
  { path: "/.DS_Store", severity: "low" as SeverityLevel, title: "macOS .DS_Store file exposed" },
  { path: "/Thumbs.db", severity: "low" as SeverityLevel, title: "Windows Thumbs.db exposed" },
];

export async function checkSensitiveFiles(targetUrl: string): Promise<Finding[]> {
  const findings: Finding[] = [];
  const base = targetUrl.replace(/\/$/, "");

  await Promise.all(
    SENSITIVE_PATHS.map(async ({ path: filePath, severity, title }) => {
      try {
        const url = `${base}${filePath}`;
        const response = await fetchUrl(url, { timeout: 5_000 });
        if (response.statusCode === 200 && response.body.length > 0) {
          findings.push({
            severity,
            category: "Sensitive File Exposure",
            title,
            description: `The file at ${filePath} is publicly accessible. This may expose sensitive configuration, credentials, or system information.`,
            evidence: `HTTP 200 OK — ${url} (${response.body.length} bytes)`,
            affectedUrl: url,
            remediation: `Restrict access to ${filePath} via server configuration or remove the file from the web root.`,
            cvssScore: severity === "critical" ? "9.8" : severity === "high" ? "7.5" : severity === "medium" ? "5.3" : "3.1",
          });
        }
      } catch {
        // Ignore connection errors for individual paths
      }
    })
  );

  return findings;
}

// ─── XSS Detection ────────────────────────────────────────────────────────────

const XSS_PAYLOADS = [
  "<script>alert('xss')</script>",
  "<img src=x onerror=alert(1)>",
  "javascript:alert(1)",
  "'><script>alert(1)</script>",
  "\"><script>alert(1)</script>",
];

export async function checkXSS(targetUrl: string): Promise<Finding[]> {
  const findings: Finding[] = [];

  // Test URL parameters with XSS payloads
  const parsed = new URL(targetUrl);
  const params = Array.from(parsed.searchParams.keys());

  if (params.length === 0) {
    // Add a test parameter
    params.push("q", "search", "id", "name");
  }

  for (const param of params.slice(0, 5)) { // Limit to 5 params
    for (const payload of XSS_PAYLOADS.slice(0, 2)) { // Limit payloads
      try {
        const testUrl = new URL(targetUrl);
        testUrl.searchParams.set(param, payload);

        const response = await fetchUrl(testUrl.toString(), { timeout: 8_000 });

        // Check if payload is reflected in response (basic reflection check)
        if (response.body.includes(payload) || response.body.includes("<script>alert")) {
          findings.push({
            severity: "high",
            category: "XSS",
            title: `Reflected XSS vulnerability in parameter "${param}"`,
            description: `The parameter "${param}" reflects user input without proper sanitization, potentially allowing Cross-Site Scripting attacks.`,
            evidence: `Payload: ${payload}\nReflected in response body at: ${testUrl.toString()}`,
            affectedUrl: testUrl.toString(),
            remediation: "Encode all user-supplied input before rendering in HTML. Use a Content Security Policy. Consider using a framework with built-in XSS protection.",
            cvssScore: "6.1",
          });
          break; // One finding per param is enough
        }
      } catch {
        // Ignore
      }
    }
  }

  return findings;
}

// ─── SQL Injection Detection ───────────────────────────────────────────────────

const SQLI_PAYLOADS = [
  "'",
  "' OR '1'='1",
  "' OR 1=1--",
  "1; DROP TABLE users--",
];

const SQLI_ERROR_PATTERNS = [
  /sql syntax/i,
  /mysql_fetch/i,
  /ORA-\d{5}/i,
  /PostgreSQL.*ERROR/i,
  /Warning.*mysql/i,
  /Unclosed quotation mark/i,
  /Microsoft OLE DB Provider for SQL Server/i,
  /SQLite.*error/i,
  /syntax error.*near/i,
];

export async function checkSQLInjection(targetUrl: string): Promise<Finding[]> {
  const findings: Finding[] = [];
  const parsed = new URL(targetUrl);
  const params = Array.from(parsed.searchParams.keys());

  if (params.length === 0) {
    params.push("id", "user", "search", "category");
  }

  for (const param of params.slice(0, 5)) {
    for (const payload of SQLI_PAYLOADS.slice(0, 2)) {
      try {
        const testUrl = new URL(targetUrl);
        testUrl.searchParams.set(param, payload);

        const response = await fetchUrl(testUrl.toString(), { timeout: 8_000 });

        const hasError = SQLI_ERROR_PATTERNS.some((p) => p.test(response.body));
        if (hasError) {
          findings.push({
            severity: "critical",
            category: "SQL Injection",
            title: `SQL Injection vulnerability in parameter "${param}"`,
            description: `The parameter "${param}" appears to be vulnerable to SQL injection. Database error messages were detected in the response.`,
            evidence: `Payload: ${payload}\nURL: ${testUrl.toString()}\nError detected in response body`,
            affectedUrl: testUrl.toString(),
            remediation: "Use parameterized queries or prepared statements. Never concatenate user input into SQL queries. Use an ORM with built-in SQL injection protection.",
            cvssScore: "9.8",
          });
          break;
        }
      } catch {
        // Ignore
      }
    }
  }

  return findings;
}

// ─── Open Redirect Detection ──────────────────────────────────────────────────

export async function checkOpenRedirect(targetUrl: string): Promise<Finding[]> {
  const findings: Finding[] = [];
  const redirectParams = ["redirect", "url", "next", "return", "returnUrl", "goto", "destination", "redir"];
  const maliciousUrl = "https://evil-attacker.example.com";

  for (const param of redirectParams) {
    try {
      const testUrl = new URL(targetUrl);
      testUrl.searchParams.set(param, maliciousUrl);

      const response = await fetchUrl(testUrl.toString(), {
        timeout: 5_000,
        followRedirects: false,
      });

      const location = response.headers["location"] as string | undefined;
      if (location && location.includes("evil-attacker.example.com")) {
        findings.push({
          severity: "medium",
          category: "Open Redirect",
          title: `Open Redirect vulnerability via parameter "${param}"`,
          description: `The parameter "${param}" can be used to redirect users to arbitrary external URLs, enabling phishing attacks.`,
          evidence: `Test URL: ${testUrl.toString()}\nLocation header: ${location}`,
          affectedUrl: testUrl.toString(),
          remediation: "Validate redirect URLs against an allowlist of trusted domains. Avoid using user-supplied input for redirect destinations.",
          cvssScore: "4.7",
        });
      }
    } catch {
      // Ignore
    }
  }

  return findings;
}

// ─── Main Scan Orchestrator ───────────────────────────────────────────────────

export async function runScan(
  targetUrl: string,
  scanType: ScanType,
  onProgress?: (progress: number, message: string) => void
): Promise<ScanResult> {
  const startTime = Date.now();
  let allFindings: Finding[] = [];

  onProgress?.(5, "Initializing scan...");

  const runCheck = async (
    name: string,
    progress: number,
    fn: () => Promise<Finding[]>
  ) => {
    onProgress?.(progress, `Running ${name}...`);
    try {
      const results = await fn();
      allFindings = allFindings.concat(results);
    } catch (err) {
      console.warn(`[Scanner] ${name} failed:`, err);
    }
  };

  if (scanType === "headers" || scanType === "passive" || scanType === "full") {
    await runCheck("Security Headers Check", 15, () => checkSecurityHeaders(targetUrl));
    await runCheck("Cookie Security Check", 30, () => checkCookieSecurity(targetUrl));
  }

  if (scanType === "passive" || scanType === "full") {
    await runCheck("Sensitive File Exposure Check", 45, () => checkSensitiveFiles(targetUrl));
  }

  if (scanType === "xss" || scanType === "active" || scanType === "full") {
    await runCheck("XSS Detection", 60, () => checkXSS(targetUrl));
  }

  if (scanType === "sqli" || scanType === "active" || scanType === "full") {
    await runCheck("SQL Injection Detection", 75, () => checkSQLInjection(targetUrl));
  }

  if (scanType === "open_redirect" || scanType === "active" || scanType === "full") {
    await runCheck("Open Redirect Detection", 88, () => checkOpenRedirect(targetUrl));
  }

  onProgress?.(95, "Compiling results...");

  const summary: ScanSummary = {
    critical: allFindings.filter((f) => f.severity === "critical").length,
    high: allFindings.filter((f) => f.severity === "high").length,
    medium: allFindings.filter((f) => f.severity === "medium").length,
    low: allFindings.filter((f) => f.severity === "low").length,
    info: allFindings.filter((f) => f.severity === "info").length,
    total: allFindings.length,
  };

  onProgress?.(100, "Scan complete.");

  return {
    findings: allFindings,
    summary,
    scanType,
    targetUrl,
    duration: Date.now() - startTime,
  };
}
