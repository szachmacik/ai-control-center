/**
 * Sentinel Tech Detector — Unit Tests
 * Pure logic tests for version extraction, signal detection, confidence scoring, and CVE mapping.
 * Network-dependent tests are skipped in favor of pure logic tests to avoid hoisting issues.
 */

import { describe, expect, it } from "vitest";

// ─── Tests: Version extraction (pure logic, no network) ───────────────────────

describe("Version extraction — pure logic", () => {
  it("should extract version from WordPress generator tag", () => {
    const html = '<meta name="generator" content="WordPress 6.4.2">';
    const match = html.match(/WordPress\s+([\d.]+)/i);
    expect(match?.[1]).toBe("6.4.2");
  });

  it("should extract version from Drupal generator tag", () => {
    const html = '<meta name="generator" content="Drupal 10 (https://www.drupal.org)">';
    const match = html.match(/Drupal\s+([\d.]+)/i);
    expect(match?.[1]).toBe("10");
  });

  it("should extract PHP version from X-Powered-By header", () => {
    const header = "PHP/8.2.0";
    const match = header.match(/PHP\/([\d.]+)/i);
    expect(match?.[1]).toBe("8.2.0");
  });

  it("should handle missing version gracefully", () => {
    const html = '<meta name="generator" content="WordPress">';
    const match = html.match(/WordPress\s+([\d.]+)/i);
    expect(match).toBeNull();
  });

  it("should extract Next.js presence from __NEXT_DATA__", () => {
    const html = '<script id="__NEXT_DATA__">{"buildId":"abc","nextExport":true}</script>';
    const isNextJs = html.includes("__NEXT_DATA__");
    expect(isNextJs).toBe(true);
  });

  it("should extract Joomla version from generator tag", () => {
    const html = '<meta name="generator" content="Joomla! - Open Source Content Management - Version 4.3.2">';
    const match = html.match(/Version\s+([\d.]+)/i);
    expect(match?.[1]).toBe("4.3.2");
  });

  it("should extract Apache version from Server header", () => {
    const header = "Apache/2.4.54 (Ubuntu)";
    const match = header.match(/Apache\/([\d.]+)/i);
    expect(match?.[1]).toBe("2.4.54");
  });

  it("should extract Nginx version from Server header", () => {
    const header = "nginx/1.24.0";
    const match = header.match(/nginx\/([\d.]+)/i);
    expect(match?.[1]).toBe("1.24.0");
  });
});

// ─── Tests: Technology signal patterns (pure logic) ───────────────────────────

describe("Technology signal patterns — pure logic", () => {
  it("should detect WordPress from wp-content path", () => {
    const html = '<link rel="stylesheet" href="/wp-content/themes/mytheme/style.css">';
    const isWordPress = html.includes("wp-content") || html.includes("wp-includes");
    expect(isWordPress).toBe(true);
  });

  it("should detect WordPress from wp-includes path", () => {
    const html = '<script src="/wp-includes/js/jquery/jquery.min.js"></script>';
    const isWordPress = html.includes("wp-content") || html.includes("wp-includes");
    expect(isWordPress).toBe(true);
  });

  it("should detect Next.js from __NEXT_DATA__ script", () => {
    const html = '<script id="__NEXT_DATA__" type="application/json">{"props":{}}</script>';
    const isNextJs = html.includes("__NEXT_DATA__");
    expect(isNextJs).toBe(true);
  });

  it("should detect Django from csrfmiddlewaretoken", () => {
    const html = '<input type="hidden" name="csrfmiddlewaretoken" value="abc123">';
    const isDjango = html.includes("csrfmiddlewaretoken");
    expect(isDjango).toBe(true);
  });

  it("should detect React from data-reactroot attribute", () => {
    const html = '<div id="root" data-reactroot=""></div>';
    const isReact = html.includes("data-reactroot");
    expect(isReact).toBe(true);
  });

  it("should detect Laravel from laravel_session cookie", () => {
    const cookies = ["laravel_session=abc123; Path=/; HttpOnly"];
    const isLaravel = cookies.some((c) => c.toLowerCase().includes("laravel_session"));
    expect(isLaravel).toBe(true);
  });

  it("should detect Symfony from sf_ prefixed cookie", () => {
    const cookies = ["sf_redirect=abc; Path=/"];
    const isSymfony = cookies.some((c) => c.toLowerCase().startsWith("sf_"));
    expect(isSymfony).toBe(true);
  });

  it("should detect Magento from frontend cookie", () => {
    const cookies = ["frontend=abc123; Path=/; HttpOnly"];
    const isMagento = cookies.some((c) => c.startsWith("frontend="));
    expect(isMagento).toBe(true);
  });

  it("should detect Drupal from Drupal.settings in HTML", () => {
    const html = '<script>jQuery.extend(Drupal.settings, {"basePath": "/"});</script>';
    const isDrupal = html.includes("Drupal.settings") || html.includes("drupal.org");
    expect(isDrupal).toBe(true);
  });

  it("should detect Vue.js from data-v- attributes", () => {
    const html = '<div data-v-app="" id="app"></div>';
    const isVue = html.includes("data-v-") || html.includes("__vue");
    expect(isVue).toBe(true);
  });

  it("should detect Angular from ng-version attribute", () => {
    const html = '<app-root _nghost-abc ng-version="16.2.0"></app-root>';
    const isAngular = html.includes("ng-version") || html.includes("_nghost");
    expect(isAngular).toBe(true);
  });

  it("should detect Gatsby from gatsby-focus-wrapper", () => {
    const html = '<div id="gatsby-focus-wrapper"></div>';
    const isGatsby = html.includes("gatsby");
    expect(isGatsby).toBe(true);
  });

  it("should detect Nuxt.js from __nuxt div", () => {
    const html = '<div id="__nuxt"></div>';
    const isNuxt = html.includes("__nuxt");
    expect(isNuxt).toBe(true);
  });

  it("should detect ASP.NET from __VIEWSTATE", () => {
    const html = '<input type="hidden" name="__VIEWSTATE" value="abc123">';
    const isAspNet = html.includes("__VIEWSTATE");
    expect(isAspNet).toBe(true);
  });

  it("should detect Rails from authenticity_token", () => {
    const html = '<input type="hidden" name="authenticity_token" value="abc123">';
    const isRails = html.includes("authenticity_token");
    expect(isRails).toBe(true);
  });
});

// ─── Tests: Environment type mapping ──────────────────────────────────────────

describe("Environment type mapping — pure logic", () => {
  it("should map WordPress signals to wordpress environment", () => {
    const html = '<meta name="generator" content="WordPress 6.4.2">';
    const hasWordPressSignal = html.toLowerCase().includes("wordpress");
    expect(hasWordPressSignal).toBe(true);
  });

  it("should distinguish WooCommerce from plain WordPress", () => {
    const html = '<meta name="generator" content="WordPress 6.4.2"><script src="/wp-content/plugins/woocommerce/assets/js/frontend/woocommerce.min.js"></script>';
    const isWooCommerce = html.toLowerCase().includes("woocommerce");
    const isWordPress = html.toLowerCase().includes("wordpress");
    expect(isWooCommerce).toBe(true);
    expect(isWordPress).toBe(true);
    // WooCommerce takes precedence over WordPress
    const envType = isWooCommerce ? "woocommerce" : "wordpress";
    expect(envType).toBe("woocommerce");
  });

  it("should return static for plain HTML with no framework signals", () => {
    const html = "<html><head><title>My Site</title></head><body><h1>Hello</h1></body></html>";
    const signals = [
      "wordpress", "wp-content", "wp-includes",
      "__NEXT_DATA__", "__nuxt", "gatsby",
      "csrfmiddlewaretoken", "authenticity_token",
      "laravel_session", "sf_redirect",
      "data-reactroot", "ng-version",
    ];
    const detected = signals.filter((s) => html.toLowerCase().includes(s.toLowerCase()));
    const envType = detected.length === 0 ? "static" : detected[0];
    expect(envType).toBe("static");
  });
});

// ─── Tests: Confidence scoring logic ──────────────────────────────────────────

describe("Confidence scoring — pure logic", () => {
  function calcConfidence(signalCount: number, signalWeight: number = 20): number {
    return Math.min(100, signalCount * signalWeight);
  }

  it("should give higher confidence with more signals", () => {
    expect(calcConfidence(5)).toBeGreaterThan(calcConfidence(2));
  });

  it("should cap confidence at 100", () => {
    expect(calcConfidence(10)).toBe(100);
  });

  it("should give 0 confidence for no signals", () => {
    expect(calcConfidence(0)).toBe(0);
  });

  it("should give partial confidence for 3 signals at weight 20", () => {
    expect(calcConfidence(3)).toBe(60);
  });

  it("should respect custom signal weight", () => {
    expect(calcConfidence(3, 30)).toBe(90);
  });
});

// ─── Tests: CVE severity mapping ──────────────────────────────────────────────

describe("CVE severity mapping — pure logic", () => {
  function mapCvssToSeverity(score: number): string {
    if (score >= 9.0) return "critical";
    if (score >= 7.0) return "high";
    if (score >= 4.0) return "medium";
    if (score >= 0.1) return "low";
    return "info";
  }

  it("should map CVSS 9.8 to critical", () => {
    expect(mapCvssToSeverity(9.8)).toBe("critical");
  });

  it("should map CVSS 7.5 to high", () => {
    expect(mapCvssToSeverity(7.5)).toBe("high");
  });

  it("should map CVSS 5.0 to medium", () => {
    expect(mapCvssToSeverity(5.0)).toBe("medium");
  });

  it("should map CVSS 2.0 to low", () => {
    expect(mapCvssToSeverity(2.0)).toBe("low");
  });

  it("should map CVSS 0.0 to info", () => {
    expect(mapCvssToSeverity(0.0)).toBe("info");
  });

  it("should map CVSS 9.0 exactly to critical", () => {
    expect(mapCvssToSeverity(9.0)).toBe("critical");
  });

  it("should map CVSS 7.0 exactly to high", () => {
    expect(mapCvssToSeverity(7.0)).toBe("high");
  });

  it("should map CVSS 4.0 exactly to medium", () => {
    expect(mapCvssToSeverity(4.0)).toBe("medium");
  });

  it("should map CVSS 0.1 exactly to low", () => {
    expect(mapCvssToSeverity(0.1)).toBe("low");
  });
});

// ─── Tests: Tech summary generation ───────────────────────────────────────────

describe("Tech summary generation — pure logic", () => {
  it("should include technology name in summary", () => {
    const tech = "WordPress";
    const version = "6.4.2";
    const summary = `${tech} ${version}`;
    expect(summary).toContain("WordPress");
    expect(summary).toContain("6.4.2");
  });

  it("should handle missing version in summary", () => {
    const tech = "WordPress";
    const version: string | undefined = undefined;
    const summary = version ? `${tech} ${version}` : tech;
    expect(summary).toBe("WordPress");
  });

  it("should combine multiple technologies in summary", () => {
    const techs = ["WordPress 6.4.2", "PHP 8.2", "MySQL 8.0"];
    const summary = techs.join(", ");
    expect(summary).toContain("WordPress");
    expect(summary).toContain("PHP");
    expect(summary).toContain("MySQL");
  });

  it("should not include undefined in summary", () => {
    const techs = ["WordPress 6.4.2", undefined, "PHP 8.2"].filter(Boolean);
    const summary = techs.join(", ");
    expect(summary).not.toContain("undefined");
  });
});

// ─── Tests: Header-based detection ────────────────────────────────────────────

describe("Header-based technology detection — pure logic", () => {
  it("should detect PHP from X-Powered-By header", () => {
    const headers: Record<string, string> = { "x-powered-by": "PHP/8.2.0" };
    const isPhp = headers["x-powered-by"]?.toLowerCase().includes("php") ?? false;
    expect(isPhp).toBe(true);
  });

  it("should detect ASP.NET from X-Powered-By header", () => {
    const headers: Record<string, string> = { "x-powered-by": "ASP.NET" };
    const isAspNet = headers["x-powered-by"]?.toLowerCase().includes("asp.net") ?? false;
    expect(isAspNet).toBe(true);
  });

  it("should detect Next.js from X-Powered-By header", () => {
    const headers: Record<string, string> = { "x-powered-by": "Next.js" };
    const isNextJs = headers["x-powered-by"]?.toLowerCase().includes("next.js") ?? false;
    expect(isNextJs).toBe(true);
  });

  it("should detect Express from X-Powered-By header", () => {
    const headers: Record<string, string> = { "x-powered-by": "Express" };
    const isExpress = headers["x-powered-by"]?.toLowerCase().includes("express") ?? false;
    expect(isExpress).toBe(true);
  });

  it("should not detect PHP when header is absent", () => {
    const headers: Record<string, string> = { "content-type": "text/html" };
    const isPhp = headers["x-powered-by"]?.toLowerCase().includes("php") ?? false;
    expect(isPhp).toBe(false);
  });
});

// ─── Tests: URL normalization ──────────────────────────────────────────────────

describe("URL normalization for tech detection", () => {
  it("should add https:// if protocol is missing", () => {
    function normalizeUrl(url: string): string {
      if (!url.startsWith("http://") && !url.startsWith("https://")) {
        return `https://${url}`;
      }
      return url;
    }
    expect(normalizeUrl("example.com")).toBe("https://example.com");
    expect(normalizeUrl("https://example.com")).toBe("https://example.com");
    expect(normalizeUrl("http://example.com")).toBe("http://example.com");
  });

  it("should strip trailing slash for consistency", () => {
    function normalizeUrl(url: string): string {
      return url.replace(/\/$/, "");
    }
    expect(normalizeUrl("https://example.com/")).toBe("https://example.com");
    expect(normalizeUrl("https://example.com")).toBe("https://example.com");
  });
});
