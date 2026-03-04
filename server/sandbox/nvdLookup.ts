/**
 * NVD (National Vulnerability Database) CVE Lookup
 *
 * Uses the free NVD REST API v2 (no API key required for basic usage).
 * Results are cached in-memory for 24h to avoid hitting rate limits.
 * Rate limit: 5 requests/30s without API key.
 */

import * as https from "https";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CveEntry {
  id: string;
  description: string;
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "NONE";
  cvssScore: number;
  publishedDate: string;
  url: string;
  affectedVersions?: string;
}

export interface NvdLookupResult {
  technology: string;
  version: string;
  cves: CveEntry[];
  totalFound: number;
  fromCache: boolean;
}

// ─── Cache ────────────────────────────────────────────────────────────────────

interface CacheEntry {
  result: NvdLookupResult;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

// Rate limiter: max 5 requests per 30s
const requestTimestamps: number[] = [];
const MAX_REQUESTS = 5;
const WINDOW_MS = 30_000;

function canMakeRequest(): boolean {
  const now = Date.now();
  // Remove old timestamps
  while (requestTimestamps.length > 0 && requestTimestamps[0] < now - WINDOW_MS) {
    requestTimestamps.shift();
  }
  return requestTimestamps.length < MAX_REQUESTS;
}

function recordRequest(): void {
  requestTimestamps.push(Date.now());
}

// ─── HTTP helper ──────────────────────────────────────────────────────────────

function httpsGet(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: {
        "User-Agent": "Sentinel-Security-Scanner/2.0 (ofshore.dev)",
        "Accept": "application/json",
      },
      timeout: 10_000,
    }, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => resolve(data));
    });
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("NVD API timeout"));
    });
  });
}

// ─── CVE severity mapping ─────────────────────────────────────────────────────

function mapSeverity(score: number): CveEntry["severity"] {
  if (score >= 9.0) return "CRITICAL";
  if (score >= 7.0) return "HIGH";
  if (score >= 4.0) return "MEDIUM";
  if (score > 0) return "LOW";
  return "NONE";
}

// ─── NVD keyword mapping ──────────────────────────────────────────────────────

// Maps our detected technology names to NVD CPE/keyword search terms
const TECH_TO_NVD_KEYWORD: Record<string, string> = {
  "WordPress": "wordpress",
  "WooCommerce": "woocommerce",
  "Next.js": "next.js",
  "Nuxt.js": "nuxt",
  "React": "react",
  "Vue.js": "vue.js",
  "Angular": "angular",
  "Laravel": "laravel",
  "Symfony": "symfony",
  "Django": "django",
  "Ruby on Rails": "rails",
  "FastAPI": "fastapi",
  "Drupal": "drupal",
  "Magento": "magento",
  "Shopify": "shopify",
  "Joomla": "joomla",
  "PHP": "php",
  "jQuery": "jquery",
  "Bootstrap": "bootstrap",
  "Apache": "apache_http_server",
  "Nginx": "nginx",
  "Node.js": "node.js",
  "Express": "express",
  "Gatsby": "gatsby",
  "Astro": "astro",
};

// ─── Main lookup function ─────────────────────────────────────────────────────

export async function lookupCves(
  technology: string,
  version?: string,
  maxResults = 5
): Promise<NvdLookupResult> {
  const cacheKey = `${technology}:${version ?? "any"}`;

  // Check cache
  const cached = cache.get(cacheKey);
  if (cached && Date.now() < cached.expiresAt) {
    return { ...cached.result, fromCache: true };
  }

  // Rate limit check
  if (!canMakeRequest()) {
    // Return empty result rather than failing
    return {
      technology,
      version: version ?? "unknown",
      cves: [],
      totalFound: 0,
      fromCache: false,
    };
  }

  const keyword = TECH_TO_NVD_KEYWORD[technology] ?? technology.toLowerCase().replace(/\s+/g, "_");
  const versionParam = version ? `&versionStart=${encodeURIComponent(version)}&versionStartType=including` : "";
  const url = `https://services.nvd.nist.gov/rest/json/cves/2.0?keywordSearch=${encodeURIComponent(keyword)}&resultsPerPage=${maxResults}&startIndex=0${versionParam}`;

  try {
    recordRequest();
    const raw = await httpsGet(url);
    const data = JSON.parse(raw);

    const cves: CveEntry[] = [];

    if (data.vulnerabilities && Array.isArray(data.vulnerabilities)) {
      for (const vuln of data.vulnerabilities) {
        const cve = vuln.cve;
        if (!cve) continue;

        const id = cve.id ?? "UNKNOWN";
        const desc = cve.descriptions?.find((d: any) => d.lang === "en")?.value ?? "No description available";

        // Get CVSS score — try v3.1 first, then v3.0, then v2
        let cvssScore = 0;
        let severity: CveEntry["severity"] = "NONE";

        const metrics = cve.metrics;
        if (metrics?.cvssMetricV31?.[0]) {
          cvssScore = metrics.cvssMetricV31[0].cvssData?.baseScore ?? 0;
          severity = (metrics.cvssMetricV31[0].cvssData?.baseSeverity as CveEntry["severity"]) ?? mapSeverity(cvssScore);
        } else if (metrics?.cvssMetricV30?.[0]) {
          cvssScore = metrics.cvssMetricV30[0].cvssData?.baseScore ?? 0;
          severity = (metrics.cvssMetricV30[0].cvssData?.baseSeverity as CveEntry["severity"]) ?? mapSeverity(cvssScore);
        } else if (metrics?.cvssMetricV2?.[0]) {
          cvssScore = metrics.cvssMetricV2[0].cvssData?.baseScore ?? 0;
          severity = mapSeverity(cvssScore);
        }

        cves.push({
          id,
          description: desc.length > 300 ? desc.substring(0, 297) + "..." : desc,
          severity,
          cvssScore,
          publishedDate: cve.published ?? "",
          url: `https://nvd.nist.gov/vuln/detail/${id}`,
          affectedVersions: version,
        });
      }
    }

    // Sort by CVSS score descending
    cves.sort((a, b) => b.cvssScore - a.cvssScore);

    const result: NvdLookupResult = {
      technology,
      version: version ?? "unknown",
      cves,
      totalFound: data.totalResults ?? cves.length,
      fromCache: false,
    };

    // Cache the result
    cache.set(cacheKey, { result, expiresAt: Date.now() + CACHE_TTL_MS });

    return result;
  } catch (err) {
    // On error, return empty result (don't crash the scanner)
    console.error(`[NVD] Lookup failed for ${technology}:`, err);
    return {
      technology,
      version: version ?? "unknown",
      cves: [],
      totalFound: 0,
      fromCache: false,
    };
  }
}

/**
 * Bulk lookup for multiple technologies (respects rate limiting with delays)
 */
export async function lookupCvesBulk(
  technologies: Array<{ name: string; version?: string }>
): Promise<NvdLookupResult[]> {
  const results: NvdLookupResult[] = [];

  for (const tech of technologies) {
    const result = await lookupCves(tech.name, tech.version, 3);
    results.push(result);

    // If we made a real request (not from cache), wait 7s to respect rate limit
    if (!result.fromCache && result.totalFound >= 0) {
      await new Promise((r) => setTimeout(r, 7_000));
    }
  }

  return results;
}

/**
 * Get a quick severity summary for a technology
 */
export async function getTechRiskSummary(
  technology: string,
  version?: string
): Promise<{ critical: number; high: number; medium: number; low: number; topCve?: CveEntry }> {
  const result = await lookupCves(technology, version, 10);

  const summary = { critical: 0, high: 0, medium: 0, low: 0, topCve: undefined as CveEntry | undefined };

  for (const cve of result.cves) {
    if (cve.severity === "CRITICAL") summary.critical++;
    else if (cve.severity === "HIGH") summary.high++;
    else if (cve.severity === "MEDIUM") summary.medium++;
    else if (cve.severity === "LOW") summary.low++;
  }

  if (result.cves.length > 0) {
    summary.topCve = result.cves[0];
  }

  return summary;
}
