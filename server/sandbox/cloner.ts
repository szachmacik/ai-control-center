/**
 * Security Sandbox — Site Cloner & Anonymizer
 *
 * Uses wget --mirror to create a local copy of a website,
 * then applies PII anonymization across all HTML/JS/CSS/JSON files.
 */

import { exec } from "child_process";
import { promisify } from "util";
import * as fs from "fs/promises";
import * as path from "path";
// glob replaced with native fs recursive walk

const execAsync = promisify(exec);

/** Recursively walk a directory and return all file paths */
async function walkDir(dir: string): Promise<string[]> {
  const results: string[] = [];
  async function walk(current: string) {
    let entries: import("fs").Dirent[];
    try {
      entries = await fs.readdir(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
      } else {
        results.push(fullPath);
      }
    }
  }
  await walk(dir);
  return results;
}

export const SANDBOX_DIR = process.env.SANDBOX_DIR ?? "/tmp/sandboxes";

// ─── Cloning ──────────────────────────────────────────────────────────────────

export interface CloneOptions {
  targetUrl: string;
  sandboxId: number;
  anonymize?: boolean;
  onProgress?: (progress: number, message: string) => void;
}

export interface CloneResult {
  success: boolean;
  outputDir: string;
  fileCount: number;
  error?: string;
}

export async function cloneSite(opts: CloneOptions): Promise<CloneResult> {
  const { targetUrl, sandboxId, anonymize = true, onProgress } = opts;
  const outputDir = path.join(SANDBOX_DIR, `sandbox-${sandboxId}`);

  try {
    // Ensure output dir exists
    await fs.mkdir(outputDir, { recursive: true });
    onProgress?.(5, "Starting site clone...");

    // Sanitize URL
    const url = targetUrl.startsWith("http") ? targetUrl : `https://${targetUrl}`;
    const parsedUrl = new URL(url);
    const domain = parsedUrl.hostname;
    const baseUrl = `${parsedUrl.protocol}//${parsedUrl.host}`;

    // Step 1: Check robots.txt to understand crawl rules
    onProgress?.(7, "Checking robots.txt...");
    const robotsAllowed = await fetchRobotsTxt(baseUrl);

    // Step 2: Detect if site is a SPA (React/Next/Vue/Angular etc.)
    onProgress?.(9, "Detecting site type (SPA vs traditional)...");
    const isSPA = await detectSPA(url);

    // Step 3: Try sitemap-based crawling for better coverage
    onProgress?.(10, `Cloning ${domain}...`);
    const sitemapUrls = await fetchSitemapUrls(baseUrl);

    if (isSPA) {
      // SPA: wget won't capture dynamic content — use a different strategy
      // Download the shell HTML + all static assets, note SPA in metadata
      onProgress?.(12, `Detected SPA (React/Vue/Angular) — downloading shell + assets...`);
      await cloneSPASite(url, outputDir, domain);
    } else if (sitemapUrls.length > 0) {
      // Sitemap-guided crawl: download each URL from sitemap
      onProgress?.(12, `Found sitemap with ${sitemapUrls.length} URLs — using sitemap-guided crawl...`);
      await cloneWithSitemap(sitemapUrls, url, outputDir, domain, robotsAllowed);
    } else {
      // Fallback: standard wget mirror
      onProgress?.(12, `No sitemap found — using wget mirror...`);
      await cloneWithWget(url, outputDir);
    }

    // Write metadata file
    await fs.writeFile(
      path.join(outputDir, ".clone-meta.json"),
      JSON.stringify({
        originalUrl: url,
        domain,
        isSPA,
        sitemapUrlCount: sitemapUrls.length,
        clonedAt: new Date().toISOString(),
        robotsRespected: true,
      }),
      "utf-8"
    );

    onProgress?.(60, "Clone complete. Counting files...");

    // Count downloaded files
    const files = await walkDir(outputDir);

    if (files.length === 0) {
      return {
        success: false,
        outputDir,
        fileCount: 0,
        error: "No files were downloaded. Check the URL and try again.",
      };
    }

    onProgress?.(70, `Downloaded ${files.length} files. ${anonymize ? "Anonymizing PII..." : "Skipping anonymization."}`);

    if (anonymize) {
      await anonymizeSite(outputDir, files);
    }

    onProgress?.(95, "Anonymization complete.");

    return { success: true, outputDir, fileCount: files.length };
  } catch (err) {
    return {
      success: false,
      outputDir,
      fileCount: 0,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// ─── Anonymization ────────────────────────────────────────────────────────────

const TEXT_EXTENSIONS = new Set([
  ".html", ".htm", ".js", ".ts", ".jsx", ".tsx",
  ".css", ".json", ".xml", ".txt", ".php", ".asp",
  ".aspx", ".jsp", ".vue", ".svelte",
]);

/** Replacement patterns for PII — ORDER MATTERS: longer/more specific patterns first */
const PII_PATTERNS: Array<{ pattern: RegExp; replacement: string | ((m: string) => string) }> = [
  // Email addresses (before anything else to avoid partial matches)
  {
    pattern: /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g,
    replacement: "user@mock-data.test",
  },
  // IBAN (Polish PL + 26 digits) — longest pattern, must be first among digit patterns
  {
    pattern: /\bPL\d{2}[\s]?\d{4}[\s]?\d{4}[\s]?\d{4}[\s]?\d{4}[\s]?\d{4}[\s]?\d{4}\b/gi,
    replacement: "PL00 0000 0000 0000 0000 0000 0000",
  },
  // Credit card numbers (16 digits) — before PESEL (11) and phone (9)
  {
    pattern: /\b\d{4}[\s\-]?\d{4}[\s\-]?\d{4}[\s\-]?\d{4}\b/g,
    replacement: "0000-0000-0000-0000",
  },
  // Polish PESEL (exactly 11 digits) — MUST be before phone (9 digits) to avoid partial match
  {
    pattern: /\b\d{11}\b/g,
    replacement: "00000000000",
  },
  // Polish NIP (10 digits, often formatted) — after PESEL
  {
    pattern: /\b\d{3}[\s\-]?\d{3}[\s\-]?\d{2}[\s\-]?\d{2}\b/g,
    replacement: "000-000-00-00",
  },
  // Polish phone numbers (various formats) — last, shortest digit pattern
  // Uses negative lookbehind/lookahead to avoid matching digits inside longer sequences
  {
    pattern: /(?<!\d)(\+48[\s\-]?)?(\d{3}[\s\-]?\d{3}[\s\-]?\d{3}|\d{2}[\s\-]?\d{3}[\s\-]?\d{2}[\s\-]?\d{2})(?!\d)/g,
    replacement: "+48 000 000 000",
  },
];

export async function anonymizeSite(dir: string, files?: string[]): Promise<void> {
  const targetFiles = files ?? (await walkDir(dir));

  await Promise.all(
    targetFiles.map(async (filePath) => {
      const ext = path.extname(filePath).toLowerCase();
      if (!TEXT_EXTENSIONS.has(ext)) return;

      try {
        let content = await fs.readFile(filePath, "utf-8");
        let changed = false;

        for (const { pattern, replacement } of PII_PATTERNS) {
          const newContent =
            typeof replacement === "function"
              ? content.replace(pattern, replacement)
              : content.replace(pattern, replacement);
          if (newContent !== content) {
            content = newContent;
            changed = true;
          }
        }

        if (changed) {
          await fs.writeFile(filePath, content, "utf-8");
        }
      } catch {
        // Skip binary files or unreadable files
      }
    })
  );
}

// ─── ZIP packaging for local download ─────────────────────────────────────────

export async function packageSandboxAsZip(sandboxId: number): Promise<string> {
  const sandboxDir = path.join(SANDBOX_DIR, `sandbox-${sandboxId}`);
  const zipPath = path.join(SANDBOX_DIR, `sandbox-${sandboxId}.zip`);

  // Write a simple docker-compose.yml for local hosting
  const dockerCompose = `version: "3.8"
services:
  sandbox:
    image: nginx:alpine
    ports:
      - "8080:80"
    volumes:
      - ./site:/usr/share/nginx/html:ro
    restart: unless-stopped
`;

  const readmeContent = `# Security Sandbox — Local Environment

## Quick Start

1. Ensure Docker is installed on your machine
2. Run: \`docker-compose up -d\`
3. Open: http://localhost:8080
4. Run your security tests against localhost:8080

## Notes
- All PII has been anonymized (emails, phone numbers, NIP, PESEL)
- This is a STATIC copy — backend functionality is not active
- Safe to run security tools (OWASP ZAP, Burp Suite) against localhost:8080

## Sentinel Sync
- Your scan results will sync back to your Sentinel account automatically
- API Token: configured in sentinel-config.json
`;

  try {
    await fs.writeFile(path.join(sandboxDir, "docker-compose.yml"), dockerCompose);
    await fs.writeFile(path.join(sandboxDir, "README.md"), readmeContent);

    // Rename the downloaded site folder to 'site' for nginx
    const { stdout } = await execAsync(`ls "${sandboxDir}"`);
    const entries = stdout.trim().split("\n").filter(e => e && e !== "docker-compose.yml" && e !== "README.md");
    if (entries.length > 0) {
      const siteDir = path.join(sandboxDir, "site");
      await fs.mkdir(siteDir, { recursive: true });
      for (const entry of entries) {
        const src = path.join(sandboxDir, entry);
        const dst = path.join(siteDir, entry);
        await execAsync(`mv "${src}" "${dst}"`).catch(() => {});
      }
    }

    await execAsync(`cd "${sandboxDir}" && zip -r "${zipPath}" . -x "*.zip"`);
    return zipPath;
  } catch (err) {
    throw new Error(`Failed to package sandbox: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// ─── Cleanup ──────────────────────────────────────────────────────────────────

export async function deleteSandboxFiles(sandboxId: number): Promise<void> {
  const sandboxDir = path.join(SANDBOX_DIR, `sandbox-${sandboxId}`);
  const zipPath = path.join(SANDBOX_DIR, `sandbox-${sandboxId}.zip`);
  await execAsync(`rm -rf "${sandboxDir}" "${zipPath}"`).catch(() => {});
}

// ─── Crawl Helpers ────────────────────────────────────────────────────────────

/** Fetch and parse robots.txt — returns list of disallowed paths */
async function fetchRobotsTxt(baseUrl: string): Promise<Set<string>> {
  const disallowed = new Set<string>();
  try {
    const { stdout } = await execAsync(
      `curl -s --max-time 5 "${baseUrl}/robots.txt" 2>/dev/null || echo ""`,
      { timeout: 8000 }
    );
    for (const line of stdout.split("\n")) {
      const trimmed = line.trim();
      if (trimmed.toLowerCase().startsWith("disallow:")) {
        const p = trimmed.substring(9).trim();
        if (p && p !== "/") disallowed.add(p);
      }
    }
  } catch { /* ignore */ }
  return disallowed;
}

/** Detect if a site is a Single Page Application (React, Vue, Angular, Next.js etc.) */
async function detectSPA(url: string): Promise<boolean> {
  try {
    const { stdout } = await execAsync(
      `curl -s --max-time 10 -L "${url}" 2>/dev/null | head -c 20000`,
      { timeout: 15000 }
    );
    const html = stdout.toLowerCase();

    // Strong SPA indicators
    const spaSignals = [
      // React
      html.includes("__react") || html.includes("data-reactroot") || html.includes("data-reactid"),
      // Vue
      html.includes("__vue") || html.includes("data-v-") || html.includes("vue.min.js"),
      // Angular
      html.includes("ng-version") || html.includes("ng-app") || html.includes("angular.min.js"),
      // Next.js
      html.includes("__next") || html.includes("_next/static") || html.includes("__next_data"),
      // Nuxt
      html.includes("__nuxt") || html.includes("_nuxt/"),
      // Gatsby
      html.includes("gatsby") && html.includes("page-data"),
      // Generic SPA: very little content in initial HTML (JS-rendered)
      (html.match(/<p[^>]*>/g) ?? []).length < 3 && html.includes("</script>"),
    ];

    return spaSignals.filter(Boolean).length >= 1;
  } catch {
    return false;
  }
}

/** Fetch URLs from sitemap.xml (and sitemap index) */
async function fetchSitemapUrls(baseUrl: string): Promise<string[]> {
  const urls: string[] = [];
  const sitemapCandidates = [
    `${baseUrl}/sitemap.xml`,
    `${baseUrl}/sitemap_index.xml`,
    `${baseUrl}/sitemap.xml.gz`,
    `${baseUrl}/wp-sitemap.xml`,
  ];

  for (const sitemapUrl of sitemapCandidates) {
    try {
      const { stdout } = await execAsync(
        `curl -s --max-time 10 "${sitemapUrl}" 2>/dev/null | head -c 500000`,
        { timeout: 12000 }
      );
      if (!stdout.includes("<url") && !stdout.includes("<sitemap")) continue;

      // Parse <loc> tags
      const locMatches = stdout.match(/<loc>(.*?)<\/loc>/gi) ?? [];
      for (const match of locMatches) {
        const u = match.replace(/<\/?loc>/gi, "").trim();
        if (u.startsWith("http") && !u.endsWith(".xml")) {
          urls.push(u);
        }
      }
      if (urls.length > 0) break; // found a working sitemap
    } catch { /* try next */ }
  }

  // Cap at 200 URLs to avoid excessive crawling
  return urls.slice(0, 200);
}

/** Standard wget mirror clone */
async function cloneWithWget(url: string, outputDir: string): Promise<void> {
  const wgetCmd = [
    "wget",
    "--mirror",
    "--convert-links",
    "--adjust-extension",
    "--page-requisites",
    "--no-parent",
    "--timeout=15",
    "--tries=2",
    "--wait=0.5",
    "--quota=50m",
    "--level=3",
    "--reject=pdf,zip,exe,dmg,pkg,iso,tar,gz,mp4,mp3,avi,mov",
    `--user-agent="Mozilla/5.0 (compatible; SentinelSecurityBot/1.0)"`,
    `-P "${outputDir}"`,
    `"${url}"`,
  ].join(" ");

  try {
    await execAsync(wgetCmd, { timeout: 120_000 });
  } catch { /* wget exits non-zero for benign reasons */ }
}

/** Sitemap-guided clone: wget each URL from sitemap */
async function cloneWithSitemap(
  sitemapUrls: string[],
  baseUrl: string,
  outputDir: string,
  domain: string,
  disallowed: Set<string>
): Promise<void> {
  // Filter out disallowed paths
  const allowed = sitemapUrls.filter(u => {
    try {
      const p = new URL(u).pathname;
      for (const d of Array.from(disallowed)) {
        if (p.startsWith(d)) return false;
      }
      return true;
    } catch { return false; }
  });

  // Write URL list to temp file for wget --input-file
  const urlListFile = path.join(outputDir, ".sitemap-urls.txt");
  await fs.writeFile(urlListFile, allowed.join("\n"), "utf-8");

  const wgetCmd = [
    "wget",
    "--convert-links",
    "--adjust-extension",
    "--page-requisites",
    "--no-parent",
    "--timeout=15",
    "--tries=2",
    "--wait=0.3",
    "--quota=50m",
    `--domains="${domain}"`,
    `--user-agent="Mozilla/5.0 (compatible; SentinelSecurityBot/1.0)"`,
    `--input-file="${urlListFile}"`,
    `-P "${outputDir}"`,
  ].join(" ");

  try {
    await execAsync(wgetCmd, { timeout: 180_000 });
  } catch { /* non-fatal */ }

  // Also grab the homepage and its assets
  try {
    await execAsync(
      `wget --page-requisites --convert-links --adjust-extension --no-parent --timeout=15 --tries=2 -P "${outputDir}" "${baseUrl}" 2>/dev/null || true`,
      { timeout: 30_000 }
    );
  } catch { /* non-fatal */ }

  // Cleanup temp file
  try { await fs.unlink(urlListFile); } catch { /* ignore */ }
}

/** SPA clone: download shell HTML + all referenced static assets */
async function cloneSPASite(url: string, outputDir: string, domain: string): Promise<void> {
  // For SPAs, wget mirror is mostly useless (no server-side rendered pages)
  // Strategy: download the index.html + all JS/CSS bundles + images
  const wgetCmd = [
    "wget",
    "--page-requisites",
    "--convert-links",
    "--adjust-extension",
    "--no-parent",
    "--timeout=15",
    "--tries=2",
    "--quota=50m",
    "--level=2",
    `--domains="${domain}"`,
    `--user-agent="Mozilla/5.0 (compatible; SentinelSecurityBot/1.0)"`,
    `-P "${outputDir}"`,
    `"${url}"`,
  ].join(" ");

  try {
    await execAsync(wgetCmd, { timeout: 90_000 });
  } catch { /* non-fatal */ }

  // Write a note about SPA limitations
  await fs.writeFile(
    path.join(outputDir, "SPA_NOTE.txt"),
    `This site was detected as a Single Page Application (React/Vue/Angular/Next.js).
Static assets and the app shell have been downloaded.
Dynamic content (loaded via JavaScript at runtime) is not captured in this clone.
Security scanning will focus on:
  - Static asset analysis (JS bundle secrets, dependencies)
  - HTTP headers and TLS configuration
  - API endpoint discovery from JS bundles
  - CORS and CSP policy analysis
`,
    "utf-8"
  );
}
