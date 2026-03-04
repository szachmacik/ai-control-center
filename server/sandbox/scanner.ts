/**
 * Sentinel Security Scanner v2.0
 * Full OWASP Top 10 + TLS, CORS, SSRF, Directory Traversal, Auth, Info Disclosure
 * IMPORTANT: Active checks MUST only run against sandbox URLs, never production.
 */

import * as https from "https";
import * as http from "http";
import * as tls from "tls";
import { URL } from "url";

export type SeverityLevel = "critical" | "high" | "medium" | "low" | "info";
export type ScanType =
  | "passive"
  | "active"
  | "xss"
  | "sqli"
  | "headers"
  | "ssl"
  | "csrf"
  | "open_redirect"
  | "full";

export interface Finding {
  id: string;
  severity: SeverityLevel;
  category: string;
  title: string;
  description: string;
  evidence?: string;
  affectedUrl?: string;
  remediation: string;
  cwe?: string;
  owasp?: string;
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
  duration: number;
  startedAt: Date;
  completedAt: Date;
}

interface HttpResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
  url: string;
  redirectUrl?: string;
}

function generateId(): string {
  return Math.random().toString(36).slice(2, 10);
}

async function fetchUrl(
  url: string,
  options: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    timeout?: number;
    followRedirects?: boolean;
    maxRedirects?: number;
  } = {}
): Promise<HttpResponse> {
  const {
    method = "GET",
    headers = {},
    body,
    timeout = 10000,
    followRedirects = true,
    maxRedirects = 5,
  } = options;

  return new Promise((resolve, reject) => {
    let redirectCount = 0;

    const doRequest = (currentUrl: string) => {
      let parsed: URL;
      try {
        parsed = new URL(currentUrl);
      } catch {
        reject(new Error("Invalid URL: " + currentUrl));
        return;
      }

      const isHttps = parsed.protocol === "https:";
      const lib = isHttps ? https : http;
      const port = parsed.port ? parseInt(parsed.port) : isHttps ? 443 : 80;

      const reqOptions: http.RequestOptions = {
        hostname: parsed.hostname,
        port,
        path: parsed.pathname + parsed.search,
        method,
        headers: {
          "User-Agent": "Sentinel-SecurityScanner/2.0 (sandbox-only)",
          Accept: "text/html,application/json,*/*",
          ...headers,
        },
        timeout,
      };

      const req = lib.request(reqOptions, (res) => {
        const responseHeaders: Record<string, string> = {};
        for (const [k, v] of Object.entries(res.headers)) {
          if (v) {
            responseHeaders[k.toLowerCase()] = Array.isArray(v) ? v.join(", ") : String(v);
          }
        }

        const location = responseHeaders["location"];
        if (
          followRedirects &&
          location &&
          [301, 302, 303, 307, 308].includes(res.statusCode ?? 0) &&
          redirectCount < maxRedirects
        ) {
          redirectCount++;
          const nextUrl = location.startsWith("http")
            ? location
            : new URL(location, currentUrl).toString();
          doRequest(nextUrl);
          return;
        }

        let responseBody = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          if (responseBody.length < 300000) responseBody += chunk;
        });
        res.on("end", () => {
          resolve({
            statusCode: res.statusCode ?? 0,
            headers: responseHeaders,
            body: responseBody,
            url: currentUrl,
            redirectUrl: location,
          });
        });
      });

      req.on("timeout", () => {
        req.destroy();
        reject(new Error("Request timeout"));
      });
      req.on("error", reject);
      if (body) req.write(body);
      req.end();
    };

    doRequest(url);
  });
}

// ─── 1. Security Headers ──────────────────────────────────────────────────────

export async function checkSecurityHeaders(targetUrl: string): Promise<Finding[]> {
  const findings: Finding[] = [];
  let response: HttpResponse;
  try {
    response = await fetchUrl(targetUrl, { timeout: 10000 });
  } catch (err) {
    findings.push({
      id: generateId(),
      severity: "info",
      category: "Connectivity",
      title: "Could not connect to target",
      description:
        "Failed to fetch " +
        targetUrl +
        ": " +
        (err instanceof Error ? err.message : String(err)),
      remediation: "Ensure the sandbox environment is running and accessible.",
    });
    return findings;
  }

  const h = response.headers;

  if (!h["strict-transport-security"]) {
    findings.push({
      id: generateId(),
      severity: "medium",
      category: "Missing Security Header",
      title: "Strict-Transport-Security (HSTS) header missing",
      description:
        "HSTS is not configured. Without it, browsers may connect over insecure HTTP, enabling downgrade attacks.",
      affectedUrl: targetUrl,
      remediation:
        "Add: Strict-Transport-Security: max-age=31536000; includeSubDomains; preload",
      cwe: "CWE-319",
      owasp: "A05:2021 - Security Misconfiguration",
      cvssScore: "4.3",
    });
  } else {
    const hsts = h["strict-transport-security"];
    if (!hsts.includes("includeSubDomains")) {
      findings.push({
        id: generateId(),
        severity: "low",
        category: "Security Header Misconfiguration",
        title: "HSTS missing includeSubDomains directive",
        description: "HSTS is set but does not protect subdomains.",
        evidence: "Current: " + hsts,
        remediation: "Add includeSubDomains to your HSTS header.",
        cwe: "CWE-319",
        owasp: "A05:2021 - Security Misconfiguration",
      });
    }
    const maxAgeMatch = hsts.match(/max-age=(\d+)/);
    if (maxAgeMatch && parseInt(maxAgeMatch[1]) < 15768000) {
      findings.push({
        id: generateId(),
        severity: "low",
        category: "Security Header Misconfiguration",
        title: "HSTS max-age too short (< 6 months)",
        description: "HSTS max-age should be at least 1 year (31536000 seconds).",
        evidence: "max-age: " + maxAgeMatch[1],
        remediation: "Set max-age to at least 31536000.",
        cwe: "CWE-319",
        owasp: "A05:2021 - Security Misconfiguration",
      });
    }
  }

  if (!h["content-security-policy"]) {
    findings.push({
      id: generateId(),
      severity: "high",
      category: "Missing Security Header",
      title: "Content-Security-Policy (CSP) header missing",
      description:
        "No CSP header. This significantly increases XSS risk by allowing inline scripts and external resources.",
      affectedUrl: targetUrl,
      remediation:
        "Add: Content-Security-Policy: default-src 'self'; script-src 'self'; object-src 'none'; base-uri 'self'",
      cwe: "CWE-693",
      owasp: "A03:2021 - Injection",
      cvssScore: "6.1",
    });
  } else {
    const csp = h["content-security-policy"];
    if (csp.includes("unsafe-inline") || csp.includes("unsafe-eval")) {
      findings.push({
        id: generateId(),
        severity: "medium",
        category: "Security Header Misconfiguration",
        title: "Weak CSP: unsafe-inline or unsafe-eval present",
        description: "CSP uses unsafe directives that negate most XSS protections.",
        evidence: "CSP: " + csp.substring(0, 200),
        remediation:
          "Remove 'unsafe-inline' and 'unsafe-eval'. Use nonces or hashes instead.",
        cwe: "CWE-693",
        owasp: "A03:2021 - Injection",
      });
    }
  }

  const cspHeader = h["content-security-policy"] || "";
  if (!h["x-frame-options"] && !cspHeader.includes("frame-ancestors")) {
    findings.push({
      id: generateId(),
      severity: "medium",
      category: "Clickjacking",
      title: "Clickjacking protection missing (X-Frame-Options / CSP frame-ancestors)",
      description:
        "The page can be embedded in iframes on any domain, enabling clickjacking attacks.",
      affectedUrl: targetUrl,
      remediation: "Add: X-Frame-Options: DENY or CSP frame-ancestors 'none'",
      cwe: "CWE-1021",
      owasp: "A05:2021 - Security Misconfiguration",
      cvssScore: "4.3",
    });
  }

  if (!h["x-content-type-options"]) {
    findings.push({
      id: generateId(),
      severity: "low",
      category: "Missing Security Header",
      title: "X-Content-Type-Options header missing",
      description:
        "Without this header, browsers may MIME-sniff responses and execute malicious content.",
      affectedUrl: targetUrl,
      remediation: "Add: X-Content-Type-Options: nosniff",
      cwe: "CWE-430",
      owasp: "A05:2021 - Security Misconfiguration",
      cvssScore: "3.7",
    });
  }

  if (!h["referrer-policy"]) {
    findings.push({
      id: generateId(),
      severity: "low",
      category: "Missing Security Header",
      title: "Referrer-Policy header missing",
      description:
        "Without Referrer-Policy, sensitive URL parameters may leak to third parties.",
      affectedUrl: targetUrl,
      remediation: "Add: Referrer-Policy: strict-origin-when-cross-origin",
      cwe: "CWE-200",
      owasp: "A05:2021 - Security Misconfiguration",
      cvssScore: "3.1",
    });
  }

  if (!h["permissions-policy"] && !h["feature-policy"]) {
    findings.push({
      id: generateId(),
      severity: "info",
      category: "Missing Security Header",
      title: "Permissions-Policy header missing",
      description:
        "Browser features (camera, microphone, geolocation) are not explicitly restricted.",
      affectedUrl: targetUrl,
      remediation:
        "Add: Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()",
      cwe: "CWE-693",
      owasp: "A05:2021 - Security Misconfiguration",
    });
  }

  const serverHeader = h["server"];
  if (serverHeader && (serverHeader.includes("/") || /\d/.test(serverHeader))) {
    findings.push({
      id: generateId(),
      severity: "low",
      category: "Information Disclosure",
      title: "Server version disclosed in response headers",
      description:
        'Server header reveals version: "' +
        serverHeader +
        '". Helps attackers target known CVEs.',
      evidence: "Server: " + serverHeader,
      affectedUrl: targetUrl,
      remediation:
        "Hide version: nginx: server_tokens off; Apache: ServerTokens Prod",
      cwe: "CWE-200",
      owasp: "A05:2021 - Security Misconfiguration",
      cvssScore: "3.1",
    });
  }

  if (h["x-powered-by"]) {
    findings.push({
      id: generateId(),
      severity: "low",
      category: "Information Disclosure",
      title: "Technology stack disclosed via X-Powered-By",
      description: 'X-Powered-By reveals: "' + h["x-powered-by"] + '"',
      evidence: "X-Powered-By: " + h["x-powered-by"],
      affectedUrl: targetUrl,
      remediation: "Remove X-Powered-By. Express.js: app.disable('x-powered-by')",
      cwe: "CWE-200",
      owasp: "A05:2021 - Security Misconfiguration",
    });
  }

  return findings;
}

// ─── 2. Cookie Security ───────────────────────────────────────────────────────

export async function checkCookieSecurity(targetUrl: string): Promise<Finding[]> {
  const findings: Finding[] = [];
  let response: HttpResponse;
  try {
    response = await fetchUrl(targetUrl, { followRedirects: false });
  } catch {
    return findings;
  }

  const setCookieRaw = response.headers["set-cookie"];
  if (!setCookieRaw) return findings;
  const cookies = setCookieRaw.split(/,(?=[^;]+=[^;]+)/);

  for (const cookie of cookies) {
    const cookieName = cookie.split("=")[0].trim();
    const cl = cookie.toLowerCase();

    if (!cl.includes("httponly")) {
      findings.push({
        id: generateId(),
        severity: "high",
        category: "Cookie Security",
        title: 'Cookie "' + cookieName + '" missing HttpOnly flag',
        description:
          "Without HttpOnly, this cookie is accessible via JavaScript, enabling XSS-based session hijacking.",
        evidence: "Set-Cookie: " + cookie.substring(0, 120),
        affectedUrl: targetUrl,
        remediation: "Add HttpOnly flag to all session/auth cookies.",
        cwe: "CWE-1004",
        owasp: "A05:2021 - Security Misconfiguration",
        cvssScore: "6.1",
      });
    }
    if (!cl.includes("secure")) {
      findings.push({
        id: generateId(),
        severity: "medium",
        category: "Cookie Security",
        title: 'Cookie "' + cookieName + '" missing Secure flag',
        description:
          "Without Secure flag, this cookie may be sent over unencrypted HTTP.",
        evidence: "Set-Cookie: " + cookie.substring(0, 120),
        affectedUrl: targetUrl,
        remediation: "Add Secure flag to all cookies.",
        cwe: "CWE-614",
        owasp: "A02:2021 - Cryptographic Failures",
        cvssScore: "4.3",
      });
    }
    if (!cl.includes("samesite")) {
      findings.push({
        id: generateId(),
        severity: "medium",
        category: "CSRF / Cookie Security",
        title: 'Cookie "' + cookieName + '" missing SameSite attribute',
        description:
          "Without SameSite, this cookie is sent with cross-site requests, enabling CSRF attacks.",
        evidence: "Set-Cookie: " + cookie.substring(0, 120),
        affectedUrl: targetUrl,
        remediation: "Add SameSite=Strict or SameSite=Lax.",
        cwe: "CWE-352",
        owasp: "A01:2021 - Broken Access Control",
        cvssScore: "4.3",
      });
    }
    if (cl.includes("samesite=none") && !cl.includes("secure")) {
      findings.push({
        id: generateId(),
        severity: "high",
        category: "Cookie Security",
        title: "SameSite=None without Secure flag: " + cookieName,
        description:
          "SameSite=None requires Secure. Without it, the cookie is rejected by modern browsers.",
        evidence: "Set-Cookie: " + cookie.substring(0, 120),
        affectedUrl: targetUrl,
        remediation: "Add Secure flag when using SameSite=None.",
        cwe: "CWE-614",
        owasp: "A05:2021 - Security Misconfiguration",
      });
    }
  }
  return findings;
}

// ─── 3. TLS/SSL ───────────────────────────────────────────────────────────────

export async function checkTLS(targetUrl: string): Promise<Finding[]> {
  const findings: Finding[] = [];
  let parsed: URL;
  try {
    parsed = new URL(targetUrl);
  } catch {
    return findings;
  }

  if (parsed.protocol !== "https:") {
    findings.push({
      id: generateId(),
      severity: "critical",
      category: "TLS/SSL",
      title: "No HTTPS - plaintext communication",
      description:
        "The site is served over HTTP. All data including credentials is transmitted unencrypted.",
      affectedUrl: targetUrl,
      remediation:
        "Obtain an SSL/TLS certificate (e.g., Let's Encrypt) and redirect all HTTP to HTTPS.",
      cwe: "CWE-319",
      owasp: "A02:2021 - Cryptographic Failures",
      cvssScore: "9.1",
    });
    return findings;
  }

  await new Promise<void>((resolve) => {
    const socket = tls.connect(
      {
        host: parsed.hostname,
        port: parseInt(parsed.port || "443"),
        rejectUnauthorized: false,
        minVersion: "TLSv1" as tls.SecureVersion,
      },
      () => {
        const protocol = socket.getProtocol();
        const cipher = socket.getCipher();

        if (protocol === "TLSv1" || protocol === "TLSv1.1") {
          findings.push({
            id: generateId(),
            severity: "high",
            category: "TLS/SSL",
            title: "Deprecated TLS version supported: " + protocol,
            description:
              "Server supports " +
              protocol +
              ", which has known vulnerabilities (POODLE, BEAST).",
            evidence: "Negotiated: " + protocol,
            remediation:
              "Disable TLS 1.0 and 1.1. Allow only TLS 1.2 and 1.3.",
            cwe: "CWE-326",
            owasp: "A02:2021 - Cryptographic Failures",
            cvssScore: "7.4",
          });
        }

        if (cipher) {
          const weakCiphers = ["RC4", "DES", "3DES", "NULL", "EXPORT", "anon", "MD5"];
          if (
            weakCiphers.some((w) =>
              cipher.name.toUpperCase().includes(w.toUpperCase())
            )
          ) {
            findings.push({
              id: generateId(),
              severity: "high",
              category: "TLS/SSL",
              title: "Weak cipher suite: " + cipher.name,
              description:
                "Server uses a weak cipher suite vulnerable to cryptographic attacks.",
              evidence: "Cipher: " + cipher.name,
              remediation:
                "Use only AES-GCM or ChaCha20-Poly1305 cipher suites.",
              cwe: "CWE-327",
              owasp: "A02:2021 - Cryptographic Failures",
            });
          }
        }

        socket.destroy();
        resolve();
      }
    );
    socket.on("error", () => resolve());
    socket.setTimeout(5000, () => {
      socket.destroy();
      resolve();
    });
  });

  try {
    const httpUrl = targetUrl.replace("https://", "http://");
    const r = await fetchUrl(httpUrl, { followRedirects: false, timeout: 5000 });
    if (
      ![301, 302, 307, 308].includes(r.statusCode) ||
      !r.redirectUrl?.startsWith("https://")
    ) {
      findings.push({
        id: generateId(),
        severity: "medium",
        category: "TLS/SSL",
        title: "HTTP to HTTPS redirect missing",
        description: "The site does not redirect HTTP requests to HTTPS.",
        evidence: "HTTP status: " + r.statusCode,
        remediation: "Configure a 301 redirect from HTTP to HTTPS.",
        cwe: "CWE-319",
        owasp: "A02:2021 - Cryptographic Failures",
      });
    }
  } catch {
    // HTTP not available - fine
  }

  return findings;
}

// ─── 4. CORS ──────────────────────────────────────────────────────────────────

export async function checkCORS(targetUrl: string): Promise<Finding[]> {
  const findings: Finding[] = [];
  try {
    const r = await fetchUrl(targetUrl, {
      headers: {
        Origin: "https://evil.attacker.com",
        "Access-Control-Request-Method": "GET",
      },
      timeout: 8000,
    });
    const acao = r.headers["access-control-allow-origin"];
    const acac = r.headers["access-control-allow-credentials"];

    if (acao === "*") {
      findings.push({
        id: generateId(),
        severity: "medium",
        category: "CORS Misconfiguration",
        title: "Overly permissive CORS policy (wildcard)",
        description:
          "Access-Control-Allow-Origin: * allows any website to make cross-origin requests.",
        evidence: "Access-Control-Allow-Origin: " + acao,
        remediation: "Restrict CORS to specific trusted origins.",
        cwe: "CWE-942",
        owasp: "A05:2021 - Security Misconfiguration",
      });
    }

    if (acao === "https://evil.attacker.com") {
      findings.push({
        id: generateId(),
        severity: "critical",
        category: "CORS Misconfiguration",
        title: "CORS origin reflection vulnerability",
        description:
          "Server reflects the Origin header without validation, allowing any domain to make authenticated cross-origin requests.",
        evidence:
          "Sent: https://evil.attacker.com -> Received: " + acao,
        remediation:
          "Implement an origin whitelist. Never reflect Origin header directly.",
        cwe: "CWE-942",
        owasp: "A01:2021 - Broken Access Control",
        cvssScore: "8.1",
      });
    }

    if (acao && acac === "true" && acao !== "*") {
      findings.push({
        id: generateId(),
        severity: "medium",
        category: "CORS Misconfiguration",
        title: "CORS with credentials enabled",
        description:
          "CORS allows credentials from cross-origin requests. Verify allowed origins are strictly controlled.",
        evidence: "ACAO: " + acao + "\nACAC: true",
        remediation:
          "Verify origin whitelist is strict. Never combine wildcard with credentials.",
        cwe: "CWE-942",
        owasp: "A05:2021 - Security Misconfiguration",
      });
    }
  } catch {
    // Ignore
  }
  return findings;
}

// ─── 5. Sensitive File Exposure ───────────────────────────────────────────────

export async function checkSensitiveFiles(targetUrl: string): Promise<Finding[]> {
  const findings: Finding[] = [];
  const base = targetUrl.replace(/\/$/, "");

  const PATHS: Array<{
    path: string;
    severity: SeverityLevel;
    title: string;
    desc: string;
    fix: string;
  }> = [
    {
      path: "/.git/config",
      severity: "critical",
      title: "Git repository exposed (.git/config)",
      desc: "Git directory is publicly accessible, potentially exposing source code, credentials, and commit history.",
      fix: "Block access to .git directory in web server config.",
    },
    {
      path: "/.git/HEAD",
      severity: "critical",
      title: "Git HEAD file exposed",
      desc: "Git HEAD file is accessible, confirming git repository exposure.",
      fix: "Block access to .git directory.",
    },
    {
      path: "/.env",
      severity: "critical",
      title: "Environment file exposed (.env)",
      desc: "The .env file may contain database credentials, API keys, and other secrets.",
      fix: "Block access to .env files. Move secrets to environment variables.",
    },
    {
      path: "/.env.local",
      severity: "critical",
      title: "Local environment file exposed (.env.local)",
      desc: "Local environment config is publicly accessible.",
      fix: "Block access to .env files.",
    },
    {
      path: "/.env.production",
      severity: "critical",
      title: "Production environment file exposed",
      desc: "Production environment file with secrets may be accessible.",
      fix: "Block access to .env files.",
    },
    {
      path: "/wp-config.php.bak",
      severity: "critical",
      title: "WordPress config backup exposed",
      desc: "WordPress config backup with database credentials.",
      fix: "Delete backup files from web root.",
    },
    {
      path: "/db.sqlite3",
      severity: "critical",
      title: "SQLite database exposed",
      desc: "SQLite database file is publicly downloadable.",
      fix: "Move database files outside web root.",
    },
    {
      path: "/database.sql",
      severity: "critical",
      title: "SQL dump exposed",
      desc: "Database dump is publicly accessible.",
      fix: "Remove SQL dump files from web root.",
    },
    {
      path: "/backup.sql",
      severity: "critical",
      title: "SQL backup exposed",
      desc: "Database backup is publicly accessible.",
      fix: "Remove backup files from web root.",
    },
    {
      path: "/backup.zip",
      severity: "critical",
      title: "Backup archive exposed",
      desc: "Application backup archive is publicly downloadable.",
      fix: "Remove backup files from web root.",
    },
    {
      path: "/config.php",
      severity: "high",
      title: "PHP config file exposed",
      desc: "PHP configuration file may contain database credentials.",
      fix: "Move config files outside web root.",
    },
    {
      path: "/settings.py",
      severity: "high",
      title: "Django settings exposed",
      desc: "Django settings file may contain SECRET_KEY and database credentials.",
      fix: "Block access to Python config files.",
    },
    {
      path: "/error.log",
      severity: "high",
      title: "Error log exposed",
      desc: "Application error log may reveal stack traces and internal paths.",
      fix: "Move logs outside web root.",
    },
    {
      path: "/debug.log",
      severity: "high",
      title: "Debug log exposed",
      desc: "Debug log may contain sensitive application data.",
      fix: "Move logs outside web root. Disable debug logging in production.",
    },
    {
      path: "/phpmyadmin",
      severity: "high",
      title: "phpMyAdmin exposed",
      desc: "phpMyAdmin database management interface is publicly accessible.",
      fix: "Restrict phpMyAdmin access by IP or remove from production.",
    },
    {
      path: "/adminer.php",
      severity: "high",
      title: "Adminer database tool exposed",
      desc: "Adminer database management tool is publicly accessible.",
      fix: "Remove Adminer from production or restrict by IP.",
    },
    {
      path: "/.svn/entries",
      severity: "high",
      title: "SVN repository exposed",
      desc: "SVN repository metadata is publicly accessible.",
      fix: "Block access to .svn directory.",
    },
    {
      path: "/swagger.json",
      severity: "medium",
      title: "Swagger API documentation exposed",
      desc: "API docs reveal all endpoints, parameters, and auth details.",
      fix: "Restrict API docs to authenticated users in production.",
    },
    {
      path: "/openapi.json",
      severity: "medium",
      title: "OpenAPI specification exposed",
      desc: "OpenAPI spec reveals full API structure.",
      fix: "Restrict API docs in production.",
    },
    {
      path: "/api-docs",
      severity: "medium",
      title: "API documentation exposed",
      desc: "API documentation is publicly accessible.",
      fix: "Restrict API docs in production.",
    },
    {
      path: "/server-status",
      severity: "medium",
      title: "Apache server-status exposed",
      desc: "Apache mod_status reveals server internals and connected clients.",
      fix: "Restrict /server-status to localhost.",
    },
    {
      path: "/.htaccess",
      severity: "medium",
      title: ".htaccess file exposed",
      desc: "Apache .htaccess reveals URL rewrite rules and access controls.",
      fix: "Block access to .htaccess files.",
    },
    {
      path: "/xmlrpc.php",
      severity: "medium",
      title: "WordPress XML-RPC enabled",
      desc: "XML-RPC can be abused for brute force and DDoS amplification.",
      fix: "Disable XML-RPC if not needed.",
    },
    {
      path: "/wp-json/wp/v2/users",
      severity: "medium",
      title: "WordPress user enumeration via REST API",
      desc: "WordPress REST API exposes usernames.",
      fix: "Restrict WordPress REST API user endpoint.",
    },
    {
      path: "/access.log",
      severity: "medium",
      title: "Access log exposed",
      desc: "Web server access log is publicly accessible.",
      fix: "Move logs outside web root.",
    },
    {
      path: "/package.json",
      severity: "low",
      title: "package.json exposed",
      desc: "Node.js package file reveals dependencies and versions.",
      fix: "Block access to package management files.",
    },
    {
      path: "/composer.json",
      severity: "low",
      title: "composer.json exposed",
      desc: "PHP Composer file reveals dependencies.",
      fix: "Block access to composer files.",
    },
    {
      path: "/admin",
      severity: "info",
      title: "Admin panel accessible",
      desc: "Admin interface is accessible. Ensure strong authentication.",
      fix: "Restrict admin access by IP, use MFA, and enforce strong passwords.",
    },
    {
      path: "/wp-admin",
      severity: "info",
      title: "WordPress admin panel accessible",
      desc: "WordPress admin login is accessible.",
      fix: "Consider restricting /wp-admin by IP.",
    },
  ];

  await Promise.allSettled(
    PATHS.map(async ({ path: filePath, severity, title, desc, fix }) => {
      try {
        const r = await fetchUrl(base + filePath, {
          timeout: 6000,
          followRedirects: false,
        });
        if (r.statusCode === 200 && r.body.length > 10) {
          findings.push({
            id: generateId(),
            severity,
            category: "Sensitive File Exposure",
            title,
            description: desc,
            evidence:
              "URL: " +
              base +
              filePath +
              "\nHTTP: " +
              r.statusCode +
              "\nPreview: " +
              r.body.substring(0, 150),
            remediation: fix,
            affectedUrl: base + filePath,
            cwe: "CWE-538",
            owasp: "A05:2021 - Security Misconfiguration",
          });
        }
      } catch {
        // Ignore
      }
    })
  );

  return findings;
}

// ─── 6. XSS Detection ────────────────────────────────────────────────────────

export async function checkXSS(targetUrl: string): Promise<Finding[]> {
  const findings: Finding[] = [];
  const XSS_PAYLOADS = [
    "<script>alert(1)</script>",
    '"><script>alert(1)</script>',
    "<img src=x onerror=alert(1)>",
    '"><img src=x onerror=alert(1)>',
    "{{7*7}}",
    "${7*7}",
  ];
  const PARAMS = [
    "q",
    "search",
    "id",
    "name",
    "query",
    "s",
    "keyword",
    "term",
    "input",
    "data",
  ];

  let parsed: URL;
  try {
    parsed = new URL(targetUrl);
  } catch {
    return findings;
  }

  const existingParams = Array.from(parsed.searchParams.keys());
  const params = Array.from(new Set(existingParams.concat(PARAMS))).slice(0, 8);

  for (const param of params) {
    for (const payload of XSS_PAYLOADS.slice(0, 4)) {
      try {
        const testUrl = new URL(targetUrl);
        testUrl.searchParams.set(param, payload);
        const r = await fetchUrl(testUrl.toString(), { timeout: 8000 });
        if (r.body.includes(payload)) {
          findings.push({
            id: generateId(),
            severity: "high",
            category: "XSS",
            title: "Reflected XSS vulnerability",
            description:
              "Parameter '" +
              param +
              "' reflects user input without encoding, enabling Cross-Site Scripting.",
            evidence:
              "Payload: " +
              payload +
              "\nParam: " +
              param +
              "\nURL: " +
              testUrl.toString(),
            remediation:
              "Encode all user-supplied data before rendering in HTML. Implement a strict CSP.",
            affectedUrl: testUrl.toString(),
            cwe: "CWE-79",
            owasp: "A03:2021 - Injection",
            cvssScore: "6.1",
          });
          break;
        }
        if (payload === "{{7*7}}" && r.body.includes("49")) {
          findings.push({
            id: generateId(),
            severity: "critical",
            category: "Injection",
            title: "Server-Side Template Injection (SSTI)",
            description:
              "Parameter '" +
              param +
              "' evaluates template expressions. {{7*7}} returned 49.",
            evidence: "Payload: {{7*7}} -> Response contains: 49",
            remediation:
              "Never render user input in templates. Use sandboxed template engines.",
            affectedUrl: testUrl.toString(),
            cwe: "CWE-94",
            owasp: "A03:2021 - Injection",
            cvssScore: "9.8",
          });
        }
      } catch {
        // Ignore
      }
    }
  }

  // DOM XSS patterns in source
  try {
    const r = await fetchUrl(targetUrl, { timeout: 8000 });
    const domPatterns = [
      { p: /document\.write\s*\(/gi, t: "document.write() usage" },
      { p: /innerHTML\s*=/gi, t: "innerHTML assignment" },
      { p: /eval\s*\(/gi, t: "eval() usage" },
      { p: /location\.hash/gi, t: "unvalidated location.hash" },
    ];
    for (const { p, t } of domPatterns) {
      if (p.test(r.body)) {
        findings.push({
          id: generateId(),
          severity: "medium",
          category: "XSS",
          title: "Potential DOM XSS: " + t,
          description:
            "Page source contains " +
            t +
            ", which can lead to DOM-based XSS if user input is used.",
          evidence: "Pattern detected in page source",
          remediation:
            "Review all uses of this pattern and ensure input is sanitized.",
          affectedUrl: targetUrl,
          cwe: "CWE-79",
          owasp: "A03:2021 - Injection",
        });
      }
    }
  } catch {
    // Ignore
  }

  return findings;
}

// ─── 7. SQL Injection ─────────────────────────────────────────────────────────

export async function checkSQLInjection(targetUrl: string): Promise<Finding[]> {
  const findings: Finding[] = [];
  const PAYLOADS = [
    "'",
    '"',
    "' OR '1'='1",
    "' OR 1=1--",
    "1' AND 1=2--",
    "1 UNION SELECT NULL--",
    "1' AND SLEEP(3)--",
    "1' WAITFOR DELAY '0:0:3'--",
  ];
  const ERROR_PATTERNS = [
    /SQL syntax.*MySQL/i,
    /Warning.*mysql_/i,
    /MySQLSyntaxErrorException/i,
    /PostgreSQL.*ERROR/i,
    /Warning.*pg_/i,
    /Driver.*SQL.*Server/i,
    /OLE DB.*SQL Server/i,
    /SQLite\/JDBCDriver/i,
    /SQLite\.Exception/i,
    /ORA-[0-9]{4,}/i,
    /Oracle error/i,
    /Syntax error.*in query expression/i,
    /Data type mismatch/i,
  ];

  let parsed: URL;
  try {
    parsed = new URL(targetUrl);
  } catch {
    return findings;
  }

  const existingParams = Array.from(parsed.searchParams.keys());
  const params = Array.from(
    new Set(existingParams.concat(["id", "user", "search", "category", "page"]))
  ).slice(0, 6);

  for (const param of params) {
    for (const payload of PAYLOADS) {
      try {
        const testUrl = new URL(targetUrl);
        testUrl.searchParams.set(param, payload);
        const start = Date.now();
        const r = await fetchUrl(testUrl.toString(), { timeout: 12000 });
        const elapsed = Date.now() - start;

        if (ERROR_PATTERNS.some((p) => p.test(r.body))) {
          findings.push({
            id: generateId(),
            severity: "critical",
            category: "SQL Injection",
            title: "SQL Injection - error-based",
            description:
              "Parameter '" +
              param +
              "' triggers SQL error messages, confirming SQL injection.",
            evidence:
              "Payload: " +
              payload +
              "\nParam: " +
              param +
              "\nSQL error in response",
            remediation:
              "Use parameterized queries or prepared statements. Never concatenate user input into SQL.",
            affectedUrl: testUrl.toString(),
            cwe: "CWE-89",
            owasp: "A03:2021 - Injection",
            cvssScore: "9.8",
          });
          break;
        }

        if (
          (payload.includes("SLEEP") || payload.includes("WAITFOR")) &&
          elapsed > 2500
        ) {
          findings.push({
            id: generateId(),
            severity: "critical",
            category: "SQL Injection",
            title: "SQL Injection - time-based blind",
            description:
              "Parameter '" +
              param +
              "' shows time-based blind SQLi. Response delayed " +
              elapsed +
              "ms.",
            evidence:
              "Payload: " + payload + "\nResponse time: " + elapsed + "ms",
            remediation:
              "Use parameterized queries or prepared statements.",
            affectedUrl: testUrl.toString(),
            cwe: "CWE-89",
            owasp: "A03:2021 - Injection",
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

// ─── 8. Open Redirect ─────────────────────────────────────────────────────────

export async function checkOpenRedirect(targetUrl: string): Promise<Finding[]> {
  const findings: Finding[] = [];
  const PARAMS = [
    "redirect",
    "url",
    "next",
    "return",
    "returnUrl",
    "goto",
    "destination",
    "redir",
    "redirect_uri",
    "callback",
    "continue",
    "target",
    "link",
    "to",
    "forward",
  ];
  const EVIL = ["https://evil.attacker.com", "//evil.attacker.com"];

  for (const param of PARAMS) {
    for (const evil of EVIL) {
      try {
        const testUrl = new URL(targetUrl);
        testUrl.searchParams.set(param, evil);
        const r = await fetchUrl(testUrl.toString(), {
          followRedirects: false,
          timeout: 8000,
        });
        const loc = r.headers["location"] || "";
        if (
          [301, 302, 303, 307, 308].includes(r.statusCode) &&
          (loc.includes("evil.attacker.com") || loc.startsWith("//evil"))
        ) {
          findings.push({
            id: generateId(),
            severity: "medium",
            category: "Open Redirect",
            title: "Open redirect vulnerability",
            description:
              "Parameter '" +
              param +
              "' allows redirecting users to arbitrary external URLs, enabling phishing.",
            evidence:
              "Test URL: " + testUrl.toString() + "\nLocation: " + loc,
            remediation:
              "Validate redirect URLs against a whitelist. Reject absolute URLs from user input.",
            affectedUrl: testUrl.toString(),
            cwe: "CWE-601",
            owasp: "A01:2021 - Broken Access Control",
            cvssScore: "6.1",
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

// ─── 9. Directory Traversal ───────────────────────────────────────────────────

export async function checkDirectoryTraversal(targetUrl: string): Promise<Finding[]> {
  const findings: Finding[] = [];
  const PAYLOADS = [
    "../../../../etc/passwd",
    "..%2F..%2F..%2F..%2Fetc%2Fpasswd",
    "....//....//....//etc/passwd",
    "../../../windows/win.ini",
  ];
  const FILE_PARAMS = [
    "file",
    "path",
    "page",
    "include",
    "doc",
    "document",
    "template",
    "load",
    "read",
    "filename",
  ];

  let parsed: URL;
  try {
    parsed = new URL(targetUrl);
  } catch {
    return findings;
  }

  const params = Array.from(
    new Set(Array.from(parsed.searchParams.keys()).concat(FILE_PARAMS))
  ).slice(0, 6);

  for (const param of params) {
    for (const payload of PAYLOADS.slice(0, 3)) {
      try {
        const testUrl = new URL(targetUrl);
        testUrl.searchParams.set(param, payload);
        const r = await fetchUrl(testUrl.toString(), { timeout: 8000 });
        if (
          r.statusCode === 200 &&
          (r.body.includes("root:x:0:0") ||
            r.body.includes("[extensions]") ||
            r.body.includes("daemon:"))
        ) {
          findings.push({
            id: generateId(),
            severity: "critical",
            category: "Path Traversal",
            title: "Directory traversal / path traversal",
            description:
              "Parameter '" +
              param +
              "' allows reading arbitrary files from the server filesystem.",
            evidence:
              "Payload: " + payload + "\nPreview: " + r.body.substring(0, 200),
            remediation:
              "Validate and sanitize file paths. Use a whitelist of allowed files. Never pass user input to filesystem functions.",
            affectedUrl: testUrl.toString(),
            cwe: "CWE-22",
            owasp: "A01:2021 - Broken Access Control",
            cvssScore: "9.1",
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

// ─── 10. SSRF Detection ───────────────────────────────────────────────────────

export async function checkSSRF(targetUrl: string): Promise<Finding[]> {
  const findings: Finding[] = [];
  const PAYLOADS = [
    "http://169.254.169.254/latest/meta-data/",
    "http://metadata.google.internal/computeMetadata/v1/",
    "http://localhost/",
    "http://127.0.0.1/",
  ];
  const PARAMS = [
    "url",
    "webhook",
    "callback",
    "endpoint",
    "proxy",
    "fetch",
    "load",
    "src",
    "source",
    "dest",
  ];

  let parsed: URL;
  try {
    parsed = new URL(targetUrl);
  } catch {
    return findings;
  }

  const params = Array.from(
    new Set(Array.from(parsed.searchParams.keys()).concat(PARAMS))
  ).slice(0, 6);

  for (const param of params) {
    for (const payload of PAYLOADS.slice(0, 3)) {
      try {
        const testUrl = new URL(targetUrl);
        testUrl.searchParams.set(param, payload);
        const r = await fetchUrl(testUrl.toString(), { timeout: 8000 });
        if (
          r.statusCode === 200 &&
          (r.body.includes("ami-id") ||
            r.body.includes("instance-id") ||
            r.body.includes("computeMetadata") ||
            (payload.includes("localhost") && r.body.length > 100))
        ) {
          findings.push({
            id: generateId(),
            severity: "critical",
            category: "SSRF",
            title: "Server-Side Request Forgery (SSRF)",
            description:
              "Parameter '" +
              param +
              "' allows the server to make requests to internal/cloud metadata endpoints.",
            evidence:
              "Payload: " +
              payload +
              "\nStatus: " +
              r.statusCode +
              "\nPreview: " +
              r.body.substring(0, 200),
            remediation:
              "Validate and whitelist allowed URLs. Block requests to internal IP ranges. Use a network-level firewall.",
            affectedUrl: testUrl.toString(),
            cwe: "CWE-918",
            owasp: "A10:2021 - Server-Side Request Forgery",
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

// ─── 11. CSRF Detection ───────────────────────────────────────────────────────

export async function checkCSRF(targetUrl: string): Promise<Finding[]> {
  const findings: Finding[] = [];
  try {
    const r = await fetchUrl(targetUrl, { timeout: 10000 });
    const formPattern = /<form[^>]*method\s*=\s*["']?post["']?[^>]*>/gi;
    const forms = r.body.match(formPattern) || [];
    const csrfPatterns = [
      /csrf[_-]?token/i,
      /authenticity[_-]?token/i,
      /_token/i,
      /nonce/i,
      /csrfmiddlewaretoken/i,
    ];

    for (const form of forms) {
      const formIdx = r.body.indexOf(form);
      const formEnd = r.body.indexOf("</form>", formIdx);
      const formContent = r.body.substring(formIdx, formEnd + 7);
      if (!csrfPatterns.some((p) => p.test(formContent))) {
        findings.push({
          id: generateId(),
          severity: "high",
          category: "CSRF",
          title: "POST form missing CSRF token",
          description:
            "A POST form was found without a CSRF token, making it vulnerable to Cross-Site Request Forgery.",
          evidence: "Form: " + form.substring(0, 200),
          remediation:
            "Add a CSRF token to all state-changing forms. Use SameSite=Strict cookies.",
          affectedUrl: targetUrl,
          cwe: "CWE-352",
          owasp: "A01:2021 - Broken Access Control",
          cvssScore: "6.5",
        });
        break;
      }
    }
  } catch {
    // Ignore
  }
  return findings;
}

// ─── 12. Information Disclosure ───────────────────────────────────────────────

export async function checkInformationDisclosure(targetUrl: string): Promise<Finding[]> {
  const findings: Finding[] = [];
  try {
    const r = await fetchUrl(targetUrl, { timeout: 10000 });
    const body = r.body;

    const SECRET_PATTERNS = [
      {
        p: /api[_-]?key\s*[:=]\s*["']([a-zA-Z0-9_\-]{20,})/gi,
        t: "API key in page source",
      },
      {
        p: /secret[_-]?key\s*[:=]\s*["']([a-zA-Z0-9_\-]{20,})/gi,
        t: "Secret key in page source",
      },
      { p: /AKIA[0-9A-Z]{16}/g, t: "AWS Access Key ID pattern" },
      {
        p: /-----BEGIN (RSA |EC |DSA )?PRIVATE KEY-----/g,
        t: "Private key in page source",
      },
    ];

    for (const { p, t } of SECRET_PATTERNS) {
      const m = body.match(p);
      if (m) {
        findings.push({
          id: generateId(),
          severity: "critical",
          category: "Information Disclosure",
          title: t,
          description:
            "Sensitive credential pattern detected in page source: " + t,
          evidence: "Matched: " + m[0].substring(0, 100),
          remediation:
            "Remove all credentials from client-side code. Use environment variables.",
          affectedUrl: targetUrl,
          cwe: "CWE-200",
          owasp: "A02:2021 - Cryptographic Failures",
          cvssScore: "9.1",
        });
      }
    }

    const DEBUG_PATTERNS = [
      /at\s+\w+\s+\(.*\.js:\d+:\d+\)/g,
      /Traceback \(most recent call last\)/g,
      /Exception in thread/g,
      /Fatal error:/g,
      /Warning: .* on line \d+/g,
      /Parse error:/g,
    ];
    for (const p of DEBUG_PATTERNS) {
      if (p.test(body)) {
        findings.push({
          id: generateId(),
          severity: "medium",
          category: "Information Disclosure",
          title: "Stack trace / debug information exposed",
          description:
            "Application exposes stack traces or debug information, revealing internal structure.",
          evidence: "Debug/error output detected in response body",
          remediation:
            "Disable debug mode in production. Configure custom error pages.",
          affectedUrl: targetUrl,
          cwe: "CWE-209",
          owasp: "A05:2021 - Security Misconfiguration",
        });
        break;
      }
    }

    const internalIps = body.match(
      /\b(10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|127\.\d{1,3}\.\d{1,3}\.\d{1,3})\b/g
    );
    if (internalIps) {
      const uniqueIps = Array.from(new Set(internalIps)).slice(0, 5);
      findings.push({
        id: generateId(),
        severity: "low",
        category: "Information Disclosure",
        title: "Internal IP addresses exposed in response",
        description: "Internal IP addresses reveal network topology.",
        evidence: "IPs: " + uniqueIps.join(", "),
        remediation: "Remove internal IP references from responses.",
        affectedUrl: targetUrl,
        cwe: "CWE-200",
        owasp: "A05:2021 - Security Misconfiguration",
      });
    }
  } catch {
    // Ignore
  }
  return findings;
}

// ─── 13. Subdomain Takeover ───────────────────────────────────────────────────

export async function checkSubdomainTakeover(targetUrl: string): Promise<Finding[]> {
  const findings: Finding[] = [];
  const SIGS = [
    { p: /There is no app configured at that hostname/i, s: "Heroku" },
    { p: /NoSuchBucket/i, s: "AWS S3" },
    { p: /The specified bucket does not exist/i, s: "AWS S3" },
    { p: /Repository not found/i, s: "GitHub Pages" },
    { p: /Fastly error: unknown domain/i, s: "Fastly" },
    { p: /This UserVoice subdomain is currently available/i, s: "UserVoice" },
  ];
  try {
    const r = await fetchUrl(targetUrl, { timeout: 10000 });
    for (const { p, s } of SIGS) {
      if (p.test(r.body)) {
        findings.push({
          id: generateId(),
          severity: "critical",
          category: "Subdomain Takeover",
          title: "Potential subdomain takeover - " + s,
          description:
            "Response matches known subdomain takeover signature for " + s + ".",
          evidence: "Service: " + s,
          remediation:
            "Remove the DNS record or claim the service. Audit all CNAME records.",
          affectedUrl: targetUrl,
          cwe: "CWE-350",
          owasp: "A05:2021 - Security Misconfiguration",
          cvssScore: "9.1",
        });
      }
    }
  } catch {
    // Ignore
  }
  return findings;
}

// ─── Main Scan Orchestrator ───────────────────────────────────────────────────

export async function runScan(
  targetUrl: string,
  scanType: ScanType,
  onProgress?: (progress: number, message: string) => void
): Promise<ScanResult> {
  const startedAt = new Date();
  const allFindings: Finding[] = [];

  onProgress?.(2, "Initializing scan...");

  const runCheck = async (
    name: string,
    progress: number,
    fn: () => Promise<Finding[]>
  ) => {
    onProgress?.(progress, "Running " + name + "...");
    try {
      allFindings.push(...(await fn()));
    } catch (err) {
      console.warn('[Scanner] "' + name + '" failed:', err);
    }
  };

  // Always run passive checks
  await runCheck("Security Headers", 8, () => checkSecurityHeaders(targetUrl));
  await runCheck("Cookie Security", 14, () => checkCookieSecurity(targetUrl));
  await runCheck("TLS/SSL Configuration", 20, () => checkTLS(targetUrl));
  await runCheck("CORS Configuration", 26, () => checkCORS(targetUrl));
  await runCheck("Information Disclosure", 32, () => checkInformationDisclosure(targetUrl));
  await runCheck("CSRF Detection", 38, () => checkCSRF(targetUrl));
  await runCheck("Subdomain Takeover", 44, () => checkSubdomainTakeover(targetUrl));
  await runCheck("Sensitive File Exposure", 52, () => checkSensitiveFiles(targetUrl));

  const isActive = ["active", "full", "xss", "sqli", "open_redirect"].includes(scanType);

  if (isActive || scanType === "xss") {
    await runCheck("XSS Detection", 60, () => checkXSS(targetUrl));
  }
  if (isActive || scanType === "sqli") {
    await runCheck("SQL Injection", 68, () => checkSQLInjection(targetUrl));
  }
  if (isActive || scanType === "open_redirect") {
    await runCheck("Open Redirect", 74, () => checkOpenRedirect(targetUrl));
  }
  if (isActive) {
    await runCheck("Directory Traversal", 80, () => checkDirectoryTraversal(targetUrl));
    await runCheck("SSRF Detection", 86, () => checkSSRF(targetUrl));
  }

  onProgress?.(96, "Compiling results...");

  // Deduplicate by title + URL
  const seen = new Set<string>();
  const deduped = allFindings.filter((f) => {
    const k = f.title + "::" + (f.affectedUrl || "");
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  // Sort by severity
  const order: Record<SeverityLevel, number> = {
    critical: 0,
    high: 1,
    medium: 2,
    low: 3,
    info: 4,
  };
  deduped.sort((a, b) => order[a.severity] - order[b.severity]);

  const summary: ScanSummary = {
    critical: deduped.filter((f) => f.severity === "critical").length,
    high: deduped.filter((f) => f.severity === "high").length,
    medium: deduped.filter((f) => f.severity === "medium").length,
    low: deduped.filter((f) => f.severity === "low").length,
    info: deduped.filter((f) => f.severity === "info").length,
    total: deduped.length,
  };

  const completedAt = new Date();
  onProgress?.(100, "Scan complete.");

  return {
    findings: deduped,
    summary,
    scanType,
    targetUrl,
    duration: completedAt.getTime() - startedAt.getTime(),
    startedAt,
    completedAt,
  };
}
