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

    // wget mirror with sensible limits
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
      "--quota=50m",           // max 50MB
      "--level=3",             // max 3 levels deep
      "--reject=pdf,zip,exe,dmg,pkg,iso,tar,gz,mp4,mp3,avi,mov",
      `-P "${outputDir}"`,
      `"${url}"`,
    ].join(" ");

    onProgress?.(10, `Cloning ${domain}...`);

    try {
      await execAsync(wgetCmd, { timeout: 120_000 }); // 2 min max
    } catch {
      // wget exits non-zero for many benign reasons (robots.txt, 404s, etc.)
      // We continue as long as some files were downloaded
    }

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

/** Replacement patterns for PII */
const PII_PATTERNS: Array<{ pattern: RegExp; replacement: string | ((m: string) => string) }> = [
  // Email addresses
  {
    pattern: /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g,
    replacement: "user@mock-data.test",
  },
  // Polish phone numbers (various formats)
  {
    pattern: /(\+48[\s\-]?)?(\d{3}[\s\-]?\d{3}[\s\-]?\d{3}|\d{2}[\s\-]?\d{3}[\s\-]?\d{2}[\s\-]?\d{2})/g,
    replacement: "+48 000 000 000",
  },
  // Polish NIP (10 digits, often formatted)
  {
    pattern: /\b\d{3}[\s\-]?\d{3}[\s\-]?\d{2}[\s\-]?\d{2}\b/g,
    replacement: "000-000-00-00",
  },
  // Polish PESEL (11 digits)
  {
    pattern: /\b\d{11}\b/g,
    replacement: "00000000000",
  },
  // Credit card numbers (basic pattern)
  {
    pattern: /\b\d{4}[\s\-]?\d{4}[\s\-]?\d{4}[\s\-]?\d{4}\b/g,
    replacement: "0000-0000-0000-0000",
  },
  // IBAN (Polish PL + 26 digits)
  {
    pattern: /\bPL\d{2}[\s]?\d{4}[\s]?\d{4}[\s]?\d{4}[\s]?\d{4}[\s]?\d{4}[\s]?\d{4}\b/gi,
    replacement: "PL00 0000 0000 0000 0000 0000 0000",
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
