/**
 * Security Sandbox — Technology Stack Detector
 *
 * Analyzes HTTP headers, HTML content, file structure, and known fingerprints
 * to identify the technology stack of a target website.
 * Returns a TechProfile used to generate the appropriate Docker environment.
 */

import * as https from "https";
import * as http from "http";
import { URL } from "url";

// ─── Types ────────────────────────────────────────────────────────────────────

export type TechCategory =
  | "cms"
  | "framework"
  | "language"
  | "database"
  | "server"
  | "cdn"
  | "analytics"
  | "ecommerce";

export interface DetectedTech {
  name: string;
  version?: string;
  category: TechCategory;
  confidence: number; // 0-100
}

export type EnvironmentType =
  | "wordpress"
  | "wordpress-woocommerce"
  | "nextjs"
  | "nuxtjs"
  | "laravel"
  | "symfony"
  | "django"
  | "rails"
  | "express"
  | "gatsby"
  | "astro"
  | "drupal"
  | "joomla"
  | "magento"
  | "shopify-clone"
  | "static-nginx"
  | "php-generic"
  | "node-generic"
  | "python-generic";

export interface TechProfile {
  environmentType: EnvironmentType;
  detectedTechs: DetectedTech[];
  phpVersion?: string;
  nodeVersion?: string;
  pythonVersion?: string;
  mysqlVersion?: string;
  wordpressVersion?: string;
  laravelVersion?: string;
  nextjsVersion?: string;
  confidence: number;
  notes: string[];
}

// ─── HTTP Fetch Helper ────────────────────────────────────────────────────────

interface RawResponse {
  statusCode: number;
  headers: Record<string, string | string[] | undefined>;
  body: string;
}

async function fetchPage(url: string): Promise<RawResponse> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const lib = parsed.protocol === "https:" ? https : http;

    const req = lib.request(
      {
        hostname: parsed.hostname,
        port: parsed.port || (parsed.protocol === "https:" ? 443 : 80),
        path: parsed.pathname + parsed.search,
        method: "GET",
        headers: {
          "User-Agent":
            "Mozilla/5.0 (compatible; Sentinel-TechDetector/1.0)",
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
        rejectUnauthorized: false,
      },
      (res) => {
        let body = "";
        res.on("data", (c) => { body += c; });
        res.on("end", () =>
          resolve({
            statusCode: res.statusCode ?? 0,
            headers: res.headers as Record<string, string | string[] | undefined>,
            body: body.slice(0, 200_000), // cap at 200KB
          })
        );
      }
    );
    req.setTimeout(15_000, () => { req.destroy(); reject(new Error("Timeout")); });
    req.on("error", reject);
    req.end();
  });
}

async function fetchPath(baseUrl: string, path: string): Promise<number> {
  try {
    const url = baseUrl.replace(/\/$/, "") + path;
    const res = await fetchPage(url);
    return res.statusCode;
  } catch {
    return 0;
  }
}

// ─── Fingerprint Definitions ──────────────────────────────────────────────────

interface Fingerprint {
  tech: string;
  version?: string;
  category: TechCategory;
  confidence: number;
  match: (ctx: DetectionContext) => boolean;
}

interface DetectionContext {
  headers: Record<string, string | string[] | undefined>;
  body: string;
  bodyLower: string;
  paths: Record<string, number>; // path → HTTP status
  cookieNames: string[];
  xPoweredBy: string;
  server: string;
  generator: string;
}

const FINGERPRINTS: Fingerprint[] = [
  // ── WordPress ──────────────────────────────────────────────────────────────
  {
    tech: "WordPress",
    category: "cms",
    confidence: 95,
    match: (c) =>
      c.bodyLower.includes("/wp-content/") ||
      c.bodyLower.includes("/wp-includes/") ||
      c.generator.toLowerCase().includes("wordpress"),
  },
  {
    tech: "WordPress",
    category: "cms",
    confidence: 80,
    match: (c) =>
      c.paths["/wp-login.php"] === 200 ||
      c.paths["/wp-admin/"] === 200 ||
      c.paths["/xmlrpc.php"] === 200,
  },
  {
    tech: "WooCommerce",
    category: "ecommerce",
    confidence: 90,
    match: (c) =>
      c.bodyLower.includes("woocommerce") ||
      c.bodyLower.includes("/wc-api/") ||
      c.cookieNames.some((n) => n.startsWith("woocommerce")),
  },

  // ── Drupal ─────────────────────────────────────────────────────────────────
  {
    tech: "Drupal",
    category: "cms",
    confidence: 90,
    match: (c) =>
      c.generator.toLowerCase().includes("drupal") ||
      c.bodyLower.includes("drupal.js") ||
      c.bodyLower.includes("/sites/default/files/") ||
      (c.headers["x-drupal-cache"] !== undefined),
  },

  // ── Joomla ─────────────────────────────────────────────────────────────────
  {
    tech: "Joomla",
    category: "cms",
    confidence: 90,
    match: (c) =>
      c.generator.toLowerCase().includes("joomla") ||
      c.bodyLower.includes("/media/jui/") ||
      c.bodyLower.includes("joomla!"),
  },

  // ── Magento ────────────────────────────────────────────────────────────────
  {
    tech: "Magento",
    category: "ecommerce",
    confidence: 90,
    match: (c) =>
      c.bodyLower.includes("mage.cookies.set") ||
      c.bodyLower.includes("/skin/frontend/") ||
      c.bodyLower.includes("magento") ||
      c.cookieNames.some((n) => n.startsWith("frontend")),
  },

  // ── Next.js ────────────────────────────────────────────────────────────────
  {
    tech: "Next.js",
    category: "framework",
    confidence: 95,
    match: (c) =>
      c.bodyLower.includes("__next") ||
      c.bodyLower.includes("/_next/static/") ||
      c.bodyLower.includes("next/dist") ||
      (c.headers["x-powered-by"] as string ?? "").toLowerCase().includes("next.js"),
  },
  {
    tech: "Next.js",
    category: "framework",
    confidence: 70,
    match: (c) =>
      c.paths["/_next/static/chunks/main.js"] === 200 ||
      c.paths["/_next/static/chunks/webpack.js"] === 200,
  },

  // ── Nuxt.js ────────────────────────────────────────────────────────────────
  {
    tech: "Nuxt.js",
    category: "framework",
    confidence: 90,
    match: (c) =>
      c.bodyLower.includes("__nuxt") ||
      c.bodyLower.includes("/_nuxt/") ||
      c.bodyLower.includes("nuxt.js"),
  },

  // ── Gatsby ─────────────────────────────────────────────────────────────────
  {
    tech: "Gatsby",
    category: "framework",
    confidence: 85,
    match: (c) =>
      c.bodyLower.includes("gatsby") ||
      c.bodyLower.includes("/static/gatsby-") ||
      c.paths["/page-data/index/page-data.json"] === 200,
  },

  // ── Astro ──────────────────────────────────────────────────────────────────
  {
    tech: "Astro",
    category: "framework",
    confidence: 85,
    match: (c) =>
      c.bodyLower.includes("astro-island") ||
      c.bodyLower.includes("astro:") ||
      c.bodyLower.includes("/@astro/"),
  },

  // ── Laravel ────────────────────────────────────────────────────────────────
  {
    tech: "Laravel",
    category: "framework",
    confidence: 90,
    match: (c) =>
      c.cookieNames.some((n) => n.toLowerCase().includes("laravel")) ||
      c.bodyLower.includes("laravel") ||
      c.paths["/telescope"] === 200 ||
      c.paths["/horizon"] === 200,
  },

  // ── Symfony ────────────────────────────────────────────────────────────────
  {
    tech: "Symfony",
    category: "framework",
    confidence: 80,
    match: (c) =>
      c.bodyLower.includes("symfony") ||
      (c.headers["x-debug-token"] !== undefined) ||
      c.paths["/_wdt/"] === 200,
  },

  // ── Django ─────────────────────────────────────────────────────────────────
  {
    tech: "Django",
    category: "framework",
    confidence: 85,
    match: (c) =>
      c.cookieNames.some((n) => n === "csrftoken" || n === "sessionid") ||
      c.bodyLower.includes("csrfmiddlewaretoken") ||
      c.xPoweredBy.toLowerCase().includes("django"),
  },

  // ── Ruby on Rails ──────────────────────────────────────────────────────────
  {
    tech: "Ruby on Rails",
    category: "framework",
    confidence: 85,
    match: (c) =>
      c.xPoweredBy.toLowerCase().includes("phusion passenger") ||
      c.bodyLower.includes("authenticity_token") ||
      c.cookieNames.some((n) => n.includes("_session")),
  },

  // ── Express / Node.js ──────────────────────────────────────────────────────
  {
    tech: "Express.js",
    category: "framework",
    confidence: 75,
    match: (c) =>
      c.xPoweredBy.toLowerCase().includes("express") ||
      c.server.toLowerCase().includes("node"),
  },

  // ── PHP (generic) ──────────────────────────────────────────────────────────
  {
    tech: "PHP",
    category: "language",
    confidence: 80,
    match: (c) =>
      c.xPoweredBy.toLowerCase().includes("php") ||
      (c.headers["set-cookie"] as string ?? "").toLowerCase().includes("phpsessid") ||
      c.cookieNames.some((n) => n.toLowerCase() === "phpsessid"),
  },

  // ── Apache ─────────────────────────────────────────────────────────────────
  {
    tech: "Apache",
    category: "server",
    confidence: 90,
    match: (c) => c.server.toLowerCase().includes("apache"),
  },

  // ── Nginx ──────────────────────────────────────────────────────────────────
  {
    tech: "nginx",
    category: "server",
    confidence: 90,
    match: (c) => c.server.toLowerCase().includes("nginx"),
  },

  // ── Cloudflare ─────────────────────────────────────────────────────────────
  {
    tech: "Cloudflare",
    category: "cdn",
    confidence: 95,
    match: (c) =>
      c.server.toLowerCase().includes("cloudflare") ||
      c.headers["cf-ray"] !== undefined,
  },

  // ── Shopify ────────────────────────────────────────────────────────────────
  {
    tech: "Shopify",
    category: "ecommerce",
    confidence: 95,
    match: (c) =>
      c.bodyLower.includes("cdn.shopify.com") ||
      c.bodyLower.includes("shopify.com/s/files") ||
      c.cookieNames.some((n) => n.startsWith("_shopify")),
  },
];

// ─── Version Extractors ───────────────────────────────────────────────────────

function extractWordPressVersion(body: string): string | undefined {
  const m =
    body.match(/meta name="generator" content="WordPress ([0-9.]+)"/i) ??
    body.match(/\?ver=([0-9.]+)/);
  return m?.[1];
}

function extractNextJsVersion(body: string): string | undefined {
  const m = body.match(/"next":"([0-9.]+)"/);
  return m?.[1];
}

function extractPhpVersion(headers: Record<string, string | string[] | undefined>): string | undefined {
  const xpb = (headers["x-powered-by"] as string) ?? "";
  const m = xpb.match(/PHP\/([0-9.]+)/i);
  return m?.[1];
}

// ─── Environment Type Resolver ────────────────────────────────────────────────

function resolveEnvironmentType(techs: DetectedTech[]): EnvironmentType {
  const names = techs.map((t) => t.name.toLowerCase());
  const hasWoo = names.includes("woocommerce");
  const hasWP = names.includes("wordpress");
  const hasNext = names.includes("next.js");
  const hasNuxt = names.includes("nuxt.js");
  const hasLaravel = names.includes("laravel");
  const hasSymfony = names.includes("symfony");
  const hasDjango = names.includes("django");
  const hasRails = names.includes("ruby on rails");
  const hasExpress = names.includes("express.js");
  const hasGatsby = names.includes("gatsby");
  const hasAstro = names.includes("astro");
  const hasDrupal = names.includes("drupal");
  const hasJoomla = names.includes("joomla");
  const hasMagento = names.includes("magento");
  const hasShopify = names.includes("shopify");
  const hasPHP = names.includes("php");

  if (hasWP && hasWoo) return "wordpress-woocommerce";
  if (hasWP) return "wordpress";
  if (hasDrupal) return "drupal";
  if (hasJoomla) return "joomla";
  if (hasMagento) return "magento";
  if (hasShopify) return "shopify-clone";
  if (hasNext) return "nextjs";
  if (hasNuxt) return "nuxtjs";
  if (hasGatsby) return "gatsby";
  if (hasAstro) return "astro";
  if (hasLaravel) return "laravel";
  if (hasSymfony) return "symfony";
  if (hasDjango) return "django";
  if (hasRails) return "rails";
  if (hasExpress) return "express";
  if (hasPHP) return "php-generic";
  return "static-nginx";
}

// ─── Main Detector ────────────────────────────────────────────────────────────

export async function detectTechStack(targetUrl: string): Promise<TechProfile> {
  const notes: string[] = [];
  let response: RawResponse;

  try {
    response = await fetchPage(targetUrl);
  } catch (err) {
    notes.push(`Could not fetch main page: ${err instanceof Error ? err.message : String(err)}`);
    return {
      environmentType: "static-nginx",
      detectedTechs: [],
      confidence: 0,
      notes,
    };
  }

  // Parse cookies
  const rawCookies = response.headers["set-cookie"];
  const cookieHeaders = Array.isArray(rawCookies) ? rawCookies : rawCookies ? [rawCookies] : [];
  const cookieNames = cookieHeaders.map((c) => c.split("=")[0].trim());

  // Extract meta generator
  const generatorMatch = response.body.match(/<meta[^>]+name=["']generator["'][^>]+content=["']([^"']+)["']/i);
  const generator = generatorMatch?.[1] ?? "";

  const ctx: DetectionContext = {
    headers: response.headers,
    body: response.body,
    bodyLower: response.body.toLowerCase(),
    paths: {},
    cookieNames,
    xPoweredBy: (response.headers["x-powered-by"] as string) ?? "",
    server: (response.headers["server"] as string) ?? "",
    generator,
  };

  // Probe key paths in parallel (limited set to avoid hammering)
  const probePaths = [
    "/wp-login.php",
    "/wp-admin/",
    "/xmlrpc.php",
    "/_next/static/chunks/main.js",
    "/page-data/index/page-data.json",
    "/telescope",
    "/_wdt/",
  ];

  const probeResults = await Promise.all(
    probePaths.map(async (p) => ({ path: p, status: await fetchPath(targetUrl, p) }))
  );
  for (const { path, status } of probeResults) {
    ctx.paths[path] = status;
  }

  // Run all fingerprints
  const matchedTechs: DetectedTech[] = [];
  const seenTechs = new Set<string>();

  for (const fp of FINGERPRINTS) {
    if (fp.match(ctx)) {
      const key = fp.tech;
      if (!seenTechs.has(key)) {
        seenTechs.add(key);
        matchedTechs.push({
          name: fp.tech,
          category: fp.category,
          confidence: fp.confidence,
        });
      } else {
        // Boost confidence if matched by multiple rules
        const existing = matchedTechs.find((t) => t.name === key);
        if (existing) {
          existing.confidence = Math.min(99, existing.confidence + 5);
        }
      }
    }
  }

  // Extract versions
  const wpVersion = extractWordPressVersion(response.body);
  const nextVersion = extractNextJsVersion(response.body);
  const phpVersion = extractPhpVersion(response.headers);

  const wpTech = matchedTechs.find((t) => t.name === "WordPress");
  if (wpTech && wpVersion) wpTech.version = wpVersion;

  const nextTech = matchedTechs.find((t) => t.name === "Next.js");
  if (nextTech && nextVersion) nextTech.version = nextVersion;

  const phpTech = matchedTechs.find((t) => t.name === "PHP");
  if (phpTech && phpVersion) phpTech.version = phpVersion;

  const envType = resolveEnvironmentType(matchedTechs);
  const avgConfidence =
    matchedTechs.length > 0
      ? Math.round(matchedTechs.reduce((s, t) => s + t.confidence, 0) / matchedTechs.length)
      : 30;

  if (matchedTechs.length === 0) {
    notes.push("No specific technology fingerprints detected — defaulting to static nginx environment.");
  }

  return {
    environmentType: envType,
    detectedTechs: matchedTechs,
    phpVersion,
    wordpressVersion: wpVersion,
    nextjsVersion: nextVersion,
    confidence: avgConfidence,
    notes,
  };
}
