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
import { lookupCvesBulk } from "./nvdLookup";

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
  | "python-generic"
  | "react-spa"
  | "vue-spa"
  | "angular-spa"
  | "svelte"
  | "flask"
  | "fastapi"
  | "spring-boot"
  | "dotnet"
  | "typo3"
  | "prestashop";

export interface KnownVulnerability {
  cve: string;
  severity: "critical" | "high" | "medium" | "low";
  description: string;
  affectedVersions: string;
  fixedIn?: string;
  cvssScore?: string;
}

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
  djangoVersion?: string;
  reactVersion?: string;
  vueVersion?: string;
  confidence: number;
  notes: string[];
  knownVulnerabilities: KnownVulnerability[];
  techSummary: string;
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

  // ── React (SPA) ────────────────────────────────────────────────────────────
  {
    tech: "React",
    category: "framework",
    confidence: 80,
    match: (c) =>
      c.bodyLower.includes("react.development.js") ||
      c.bodyLower.includes("react.production.min.js") ||
      c.bodyLower.includes("__reactfiber") ||
      c.bodyLower.includes("data-reactroot") ||
      c.bodyLower.includes("data-reactid"),
  },

  // ── Vue.js ─────────────────────────────────────────────────────────────────
  {
    tech: "Vue.js",
    category: "framework",
    confidence: 85,
    match: (c) =>
      c.bodyLower.includes("vue.min.js") ||
      c.bodyLower.includes("vue.runtime") ||
      c.bodyLower.includes("__vue__") ||
      c.bodyLower.includes("v-app") ||
      c.bodyLower.includes("data-v-"),
  },

  // ── Angular ────────────────────────────────────────────────────────────────
  {
    tech: "Angular",
    category: "framework",
    confidence: 85,
    match: (c) =>
      c.bodyLower.includes("ng-version") ||
      c.bodyLower.includes("angular.min.js") ||
      c.bodyLower.includes("ng-app") ||
      c.bodyLower.includes("_nghost") ||
      c.bodyLower.includes("_ngcontent"),
  },

  // ── Svelte ─────────────────────────────────────────────────────────────────
  {
    tech: "Svelte",
    category: "framework",
    confidence: 80,
    match: (c) =>
      c.bodyLower.includes("svelte") ||
      c.bodyLower.includes("__svelte"),
  },

  // ── Flask ──────────────────────────────────────────────────────────────────
  {
    tech: "Flask",
    category: "framework",
    confidence: 75,
    match: (c) =>
      c.xPoweredBy.toLowerCase().includes("flask") ||
      c.cookieNames.some((n) => n === "session") ||
      c.server.toLowerCase().includes("werkzeug"),
  },

  // ── FastAPI ────────────────────────────────────────────────────────────────
  {
    tech: "FastAPI",
    category: "framework",
    confidence: 80,
    match: (c) =>
      c.bodyLower.includes("fastapi") ||
      c.server.toLowerCase().includes("uvicorn") ||
      c.paths["/docs"] === 200 && c.bodyLower.includes("swagger"),
  },

  // ── Spring Boot ────────────────────────────────────────────────────────────
  {
    tech: "Spring Boot",
    category: "framework",
    confidence: 80,
    match: (c) =>
      c.xPoweredBy.toLowerCase().includes("spring") ||
      c.bodyLower.includes("spring") ||
      c.paths["/actuator/health"] === 200 ||
      c.paths["/actuator"] === 200,
  },

  // ── .NET / ASP.NET ─────────────────────────────────────────────────────────
  {
    tech: "ASP.NET",
    category: "framework",
    confidence: 85,
    match: (c) =>
      c.xPoweredBy.toLowerCase().includes("asp.net") ||
      c.headers["x-aspnet-version"] !== undefined ||
      c.headers["x-aspnetmvc-version"] !== undefined ||
      c.cookieNames.some((n) => n === "asp.net_sessionid" || n === "__requestverificationtoken"),
  },

  // ── TYPO3 ──────────────────────────────────────────────────────────────────
  {
    tech: "TYPO3",
    category: "cms",
    confidence: 90,
    match: (c) =>
      c.generator.toLowerCase().includes("typo3") ||
      c.bodyLower.includes("typo3") ||
      c.paths["/typo3/"] === 200,
  },

  // ── PrestaShop ─────────────────────────────────────────────────────────────
  {
    tech: "PrestaShop",
    category: "ecommerce",
    confidence: 90,
    match: (c) =>
      c.bodyLower.includes("prestashop") ||
      c.cookieNames.some((n) => n.startsWith("prestashop")),
  },

  // ── Bootstrap ─────────────────────────────────────────────────────────────
  {
    tech: "Bootstrap",
    category: "framework",
    confidence: 70,
    match: (c) =>
      c.bodyLower.includes("bootstrap.min.css") ||
      c.bodyLower.includes("bootstrap.min.js") ||
      c.bodyLower.includes("getbootstrap.com"),
  },

  // ── jQuery ─────────────────────────────────────────────────────────────────
  {
    tech: "jQuery",
    category: "framework",
    confidence: 70,
    match: (c) =>
      c.bodyLower.includes("jquery.min.js") ||
      c.bodyLower.includes("jquery-") ||
      c.bodyLower.includes("jquery/"),
  },

  // ── Google Analytics / Tag Manager ────────────────────────────────────────
  {
    tech: "Google Analytics",
    category: "analytics",
    confidence: 95,
    match: (c) =>
      c.bodyLower.includes("google-analytics.com/analytics.js") ||
      c.bodyLower.includes("gtag(") ||
      c.bodyLower.includes("ga('create'"),
  },
  {
    tech: "Google Tag Manager",
    category: "analytics",
    confidence: 95,
    match: (c) =>
      c.bodyLower.includes("googletagmanager.com/gtm.js"),
  },
];

// ─── CVE Database (known vulnerabilities by tech + version) ─────────────────

const CVE_DATABASE: Array<{
  tech: string;
  maxVersion: string;
  vuln: KnownVulnerability;
}> = [
  {
    tech: "WordPress",
    maxVersion: "6.4.2",
    vuln: {
      cve: "CVE-2024-6386",
      severity: "high",
      description: "WordPress < 6.4.3: Privilege escalation via user meta manipulation in multisite.",
      affectedVersions: "< 6.4.3",
      fixedIn: "6.4.3",
      cvssScore: "8.8",
    },
  },
  {
    tech: "WordPress",
    maxVersion: "6.3.1",
    vuln: {
      cve: "CVE-2023-5561",
      severity: "medium",
      description: "WordPress < 6.3.2: User enumeration via REST API.",
      affectedVersions: "< 6.3.2",
      fixedIn: "6.3.2",
      cvssScore: "5.3",
    },
  },
  {
    tech: "jQuery",
    maxVersion: "3.4.1",
    vuln: {
      cve: "CVE-2020-11022",
      severity: "medium",
      description: "jQuery < 3.5.0: XSS vulnerability via passing HTML from untrusted sources.",
      affectedVersions: "< 3.5.0",
      fixedIn: "3.5.0",
      cvssScore: "6.1",
    },
  },
  {
    tech: "jQuery",
    maxVersion: "1.12.4",
    vuln: {
      cve: "CVE-2019-11358",
      severity: "medium",
      description: "jQuery < 3.4.0: Prototype pollution via Object.assign.",
      affectedVersions: "< 3.4.0",
      fixedIn: "3.4.0",
      cvssScore: "6.1",
    },
  },
  {
    tech: "Drupal",
    maxVersion: "9.5.10",
    vuln: {
      cve: "CVE-2023-31250",
      severity: "high",
      description: "Drupal < 9.5.11: Access bypass via insufficient permission checks.",
      affectedVersions: "< 9.5.11",
      fixedIn: "9.5.11",
      cvssScore: "7.5",
    },
  },
  {
    tech: "Laravel",
    maxVersion: "9.52.15",
    vuln: {
      cve: "CVE-2024-29291",
      severity: "high",
      description: "Laravel < 10.x: Potential RCE via deserialization in certain configurations.",
      affectedVersions: "< 10.0",
      fixedIn: "10.0",
      cvssScore: "8.1",
    },
  },
  {
    tech: "PHP",
    maxVersion: "8.0.30",
    vuln: {
      cve: "CVE-2023-3824",
      severity: "critical",
      description: "PHP < 8.0.30 / 8.1.22 / 8.2.8: Buffer overflow in phar extension.",
      affectedVersions: "< 8.0.30, < 8.1.22, < 8.2.8",
      fixedIn: "8.0.30",
      cvssScore: "9.8",
    },
  },
];

function compareVersions(v1: string, v2: string): number {
  const p1 = v1.split(".").map(Number);
  const p2 = v2.split(".").map(Number);
  for (let i = 0; i < Math.max(p1.length, p2.length); i++) {
    const a = p1[i] ?? 0;
    const b = p2[i] ?? 0;
    if (a < b) return -1;
    if (a > b) return 1;
  }
  return 0;
}

function lookupCVEs(techs: DetectedTech[]): KnownVulnerability[] {
  const vulns: KnownVulnerability[] = [];
  for (const tech of techs) {
    if (!tech.version) continue;
    for (const entry of CVE_DATABASE) {
      if (
        entry.tech.toLowerCase() === tech.name.toLowerCase() &&
        compareVersions(tech.version, entry.maxVersion) <= 0
      ) {
        vulns.push(entry.vuln);
      }
    }
  }
  return vulns;
}

// ─── Version Extractors ───────────────────────────────────────────────────────

function extractWordPressVersion(body: string): string | undefined {
  const m =
    body.match(/meta name="generator" content="WordPress ([0-9.]+)"/i) ??
    body.match(/\/wp-includes\/js\/wp-emoji-release\.min\.js\?ver=([0-9.]+)/i);
  return m?.[1];
}

function extractNextJsVersion(body: string): string | undefined {
  const m = body.match(/"next":"([0-9.]+)"/) ?? body.match(/next\/([0-9]+\.[0-9]+\.[0-9]+)/);
  return m?.[1];
}

function extractPhpVersion(headers: Record<string, string | string[] | undefined>): string | undefined {
  const xpb = (headers["x-powered-by"] as string) ?? "";
  const m = xpb.match(/PHP\/([0-9.]+)/i);
  return m?.[1];
}

function extractReactVersion(body: string): string | undefined {
  const m =
    body.match(/react\.production\.min\.js\?v=([0-9.]+)/i) ??
    body.match(/"react":"([0-9.]+)"/);
  return m?.[1];
}

function extractVueVersion(body: string): string | undefined {
  const m =
    body.match(/vue\.min\.js\?v=([0-9.]+)/i) ??
    body.match(/"vue":"([0-9.]+)"/);
  return m?.[1];
}

function extractjQueryVersion(body: string): string | undefined {
  const m =
    body.match(/jquery[.-]([0-9]+\.[0-9]+\.[0-9]+)\.min\.js/i) ??
    body.match(/jquery\/([0-9]+\.[0-9]+\.[0-9]+)\//i);
  return m?.[1];
}

function extractDjangoVersion(body: string): string | undefined {
  const m = body.match(/Django\/([0-9.]+)/i);
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

  const hasReact = names.includes("react");
  const hasVue = names.includes("vue.js");
  const hasAngular = names.includes("angular");
  const hasSvelte = names.includes("svelte");
  const hasFlask = names.includes("flask");
  const hasFastAPI = names.includes("fastapi");
  const hasSpring = names.includes("spring boot");
  const hasDotNet = names.includes("asp.net");
  const hasTypo3 = names.includes("typo3");
  const hasPrestaShop = names.includes("prestashop");

  if (hasReact && !hasNext && !hasGatsby) return "react-spa";
  if (hasVue && !hasNuxt) return "vue-spa";
  if (hasAngular) return "angular-spa";
  if (hasSvelte) return "svelte";
  if (hasFlask) return "flask";
  if (hasFastAPI) return "fastapi";
  if (hasSpring) return "spring-boot";
  if (hasDotNet) return "dotnet";
  if (hasTypo3) return "typo3";
  if (hasPrestaShop) return "prestashop";

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
      knownVulnerabilities: [],
      techSummary: "Unknown stack",
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
  const reactVersion = extractReactVersion(response.body);
  const vueVersion = extractVueVersion(response.body);
  const jqueryVersion = extractjQueryVersion(response.body);
  const djangoVersion = extractDjangoVersion(response.body);

  const wpTech = matchedTechs.find((t) => t.name === "WordPress");
  if (wpTech && wpVersion) wpTech.version = wpVersion;

  const nextTech = matchedTechs.find((t) => t.name === "Next.js");
  if (nextTech && nextVersion) nextTech.version = nextVersion;

  const phpTech = matchedTechs.find((t) => t.name === "PHP");
  if (phpTech && phpVersion) phpTech.version = phpVersion;

  const reactTech = matchedTechs.find((t) => t.name === "React");
  if (reactTech && reactVersion) reactTech.version = reactVersion;

  const vueTech = matchedTechs.find((t) => t.name === "Vue.js");
  if (vueTech && vueVersion) vueTech.version = vueVersion;

  const jqueryTech = matchedTechs.find((t) => t.name === "jQuery");
  if (jqueryTech && jqueryVersion) jqueryTech.version = jqueryVersion;

  const djangoTech = matchedTechs.find((t) => t.name === "Django");
  if (djangoTech && djangoVersion) djangoTech.version = djangoVersion;

  // CVE lookup — static database first (fast), then NVD API enrichment
  const staticVulns = lookupCVEs(matchedTechs);

  // Enrich with live NVD data for technologies where we detected a version
  const techsWithVersions = matchedTechs
    .filter((t) => t.version && ["cms", "framework", "language"].includes(t.category))
    .map((t) => ({ name: t.name, version: t.version }));

  let nvdVulns: KnownVulnerability[] = [];
  if (techsWithVersions.length > 0) {
    try {
      const nvdResults = await lookupCvesBulk(techsWithVersions);
      for (const result of nvdResults) {
        for (const cve of result.cves) {
          // Only include HIGH and CRITICAL from NVD to avoid noise
          if (cve.severity === "CRITICAL" || cve.severity === "HIGH") {
            nvdVulns.push({
              cve: cve.id,
              severity: cve.severity.toLowerCase() as "critical" | "high" | "medium" | "low",
              description: cve.description,
              affectedVersions: result.version ?? "unknown",
              cvssScore: String(cve.cvssScore),
            });
          }
        }
      }
    } catch {
      // NVD lookup is best-effort — don't fail the whole detection
    }
  }

  // Merge: NVD results take priority, static fills the gaps
  const nvdCveIds = new Set(nvdVulns.map((v) => v.cve));
  const mergedVulns = [
    ...nvdVulns,
    ...staticVulns.filter((v) => !nvdCveIds.has(v.cve)),
  ];

  const knownVulnerabilities = mergedVulns;
  if (knownVulnerabilities.length > 0) {
    const nvdCount = nvdVulns.length;
    notes.push(
      `Found ${knownVulnerabilities.length} known CVE(s) for detected technology versions${nvdCount > 0 ? ` (${nvdCount} from live NVD database)` : " (static database)"}.`
    );
  }

  const envType = resolveEnvironmentType(matchedTechs);
  const avgConfidence =
    matchedTechs.length > 0
      ? Math.round(matchedTechs.reduce((s, t) => s + t.confidence, 0) / matchedTechs.length)
      : 30;

  if (matchedTechs.length === 0) {
    notes.push("No specific technology fingerprints detected — defaulting to static nginx environment.");
  }

  // Build human-readable tech summary
  const primaryTechs = matchedTechs
    .filter((t) => ["cms", "framework", "language"].includes(t.category))
    .slice(0, 4)
    .map((t) => t.version ? `${t.name} ${t.version}` : t.name);
  const techSummary = primaryTechs.length > 0 ? primaryTechs.join(" + ") : "Unknown stack";

  return {
    environmentType: envType,
    detectedTechs: matchedTechs,
    phpVersion,
    wordpressVersion: wpVersion,
    nextjsVersion: nextVersion,
    djangoVersion,
    reactVersion,
    vueVersion,
    confidence: avgConfidence,
    notes,
    knownVulnerabilities,
    techSummary,
  };
}
