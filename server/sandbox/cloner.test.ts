import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import os from "os";
import { anonymizeSite } from "./cloner";

// ─── anonymizeSite ────────────────────────────────────────────────────────────
// We test the PII anonymization logic by creating temp files and running anonymizeSite on them.

describe("anonymizeSite — PII anonymization", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "sentinel-cloner-test-"));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  async function writeFile(name: string, content: string) {
    const filePath = path.join(tmpDir, name);
    await fs.writeFile(filePath, content, "utf-8");
    return filePath;
  }

  async function readFile(name: string) {
    return fs.readFile(path.join(tmpDir, name), "utf-8");
  }

  // ── Email ──────────────────────────────────────────────────────────────────

  it("replaces simple email addresses in HTML files", async () => {
    await writeFile("index.html", "<p>Contact: jan.kowalski@example.com</p>");
    await anonymizeSite(tmpDir);
    const content = await readFile("index.html");
    expect(content).not.toContain("jan.kowalski@example.com");
    expect(content).toContain("user@mock-data.test");
  });

  it("replaces multiple email addresses in a single file", async () => {
    await writeFile("contact.html", `
      <p>Email 1: admin@company.pl</p>
      <p>Email 2: support@company.pl</p>
    `);
    await anonymizeSite(tmpDir);
    const content = await readFile("contact.html");
    expect(content).not.toContain("admin@company.pl");
    expect(content).not.toContain("support@company.pl");
    expect(content.split("user@mock-data.test").length - 1).toBe(2);
  });

  it("replaces email in JS files", async () => {
    await writeFile("config.js", 'const email = "info@mysite.com";');
    await anonymizeSite(tmpDir);
    const content = await readFile("config.js");
    expect(content).not.toContain("info@mysite.com");
    expect(content).toContain("user@mock-data.test");
  });

  it("replaces email in CSS files (e.g. comments)", async () => {
    await writeFile("style.css", "/* Author: dev@example.com */\nbody { color: red; }");
    await anonymizeSite(tmpDir);
    const content = await readFile("style.css");
    expect(content).not.toContain("dev@example.com");
  });

  // ── Polish phone numbers ───────────────────────────────────────────────────

  it("replaces Polish mobile phone number (9 digits)", async () => {
    await writeFile("index.html", "<p>Tel: 600 123 456</p>");
    await anonymizeSite(tmpDir);
    const content = await readFile("index.html");
    expect(content).not.toContain("600 123 456");
  });

  it("replaces Polish phone with +48 prefix", async () => {
    await writeFile("index.html", "<p>Tel: +48 600 123 456</p>");
    await anonymizeSite(tmpDir);
    const content = await readFile("index.html");
    expect(content).not.toContain("+48 600 123 456");
  });

  // ── Polish PESEL ───────────────────────────────────────────────────────────

  it("replaces Polish PESEL (11 digits)", async () => {
    await writeFile("data.html", "<p>PESEL: 85010112345</p>");
    await anonymizeSite(tmpDir);
    const content = await readFile("data.html");
    expect(content).not.toContain("85010112345");
    expect(content).toContain("00000000000");
  });

  // ── Credit card ────────────────────────────────────────────────────────────

  it("replaces credit card numbers", async () => {
    await writeFile("checkout.html", "<p>Card: 4111 1111 1111 1111</p>");
    await anonymizeSite(tmpDir);
    const content = await readFile("checkout.html");
    expect(content).not.toContain("4111 1111 1111 1111");
    expect(content).toContain("0000-0000-0000-0000");
  });

  // ── IBAN ───────────────────────────────────────────────────────────────────

  it("replaces Polish IBAN numbers", async () => {
    await writeFile("payment.html", "<p>IBAN: PL61 1090 1014 0000 0712 1981 2874</p>");
    await anonymizeSite(tmpDir);
    const content = await readFile("payment.html");
    expect(content).not.toContain("PL61 1090 1014 0000 0712 1981 2874");
  });

  // ── Non-text files ─────────────────────────────────────────────────────────

  it("skips binary files (e.g. .png)", async () => {
    const pngPath = path.join(tmpDir, "image.png");
    // Write fake binary content
    await fs.writeFile(pngPath, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]));
    // Should not throw
    await expect(anonymizeSite(tmpDir)).resolves.not.toThrow();
  });

  it("skips .woff font files", async () => {
    const fontPath = path.join(tmpDir, "font.woff");
    await fs.writeFile(fontPath, Buffer.from([0x77, 0x4f, 0x46, 0x46]));
    await expect(anonymizeSite(tmpDir)).resolves.not.toThrow();
  });

  // ── No change when no PII ─────────────────────────────────────────────────

  it("does not modify files without PII", async () => {
    const original = "<h1>Hello World</h1><p>No personal data here.</p>";
    await writeFile("clean.html", original);
    await anonymizeSite(tmpDir);
    const content = await readFile("clean.html");
    expect(content).toBe(original);
  });

  // ── Multiple file types ────────────────────────────────────────────────────

  it("processes multiple files in directory simultaneously", async () => {
    await writeFile("page1.html", "<p>Email: user1@test.com</p>");
    await writeFile("page2.html", "<p>Email: user2@test.com</p>");
    await writeFile("app.js", 'const email = "user3@test.com";');
    await anonymizeSite(tmpDir);
    const p1 = await readFile("page1.html");
    const p2 = await readFile("page2.html");
    const js = await readFile("app.js");
    expect(p1).not.toContain("user1@test.com");
    expect(p2).not.toContain("user2@test.com");
    expect(js).not.toContain("user3@test.com");
  });

  // ── Specific file list ─────────────────────────────────────────────────────

  it("only processes specified files when files array is provided", async () => {
    const f1 = await writeFile("target.html", "<p>Email: target@test.com</p>");
    await writeFile("skip.html", "<p>Email: skip@test.com</p>");
    await anonymizeSite(tmpDir, [f1]);
    const target = await readFile("target.html");
    const skip = await readFile("skip.html");
    expect(target).not.toContain("target@test.com");
    // skip.html should NOT be modified
    expect(skip).toContain("skip@test.com");
  });

  // ── JSON files ─────────────────────────────────────────────────────────────

  it("anonymizes PII in JSON config files", async () => {
    await writeFile("config.json", JSON.stringify({
      adminEmail: "admin@company.com",
      supportEmail: "support@company.com",
      name: "Test App",
    }));
    await anonymizeSite(tmpDir);
    const content = await readFile("config.json");
    expect(content).not.toContain("admin@company.com");
    expect(content).not.toContain("support@company.com");
    expect(content).toContain("Test App"); // non-PII preserved
  });

  // ── Mixed content ──────────────────────────────────────────────────────────

  it("preserves non-PII content while replacing PII", async () => {
    await writeFile("mixed.html", `
      <h1>Welcome to Our Store</h1>
      <p>Contact us at: contact@store.pl</p>
      <p>Our products are the best!</p>
      <p>Phone: 500 123 456</p>
      <p>We offer free shipping!</p>
    `);
    await anonymizeSite(tmpDir);
    const content = await readFile("mixed.html");
    expect(content).toContain("Welcome to Our Store");
    expect(content).toContain("Our products are the best!");
    expect(content).toContain("We offer free shipping!");
    expect(content).not.toContain("contact@store.pl");
  });
});
