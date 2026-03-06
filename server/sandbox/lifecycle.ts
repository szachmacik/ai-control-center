/**
 * Security Sandbox — Lifecycle Manager
 *
 * Handles the full automated lifecycle of sandbox environments:
 *   1. Port pool management (no conflicts between concurrent sandboxes)
 *   2. Docker Compose spin-up (server-side, not just ZIP generation)
 *   3. Health checking (wait until container is actually ready)
 *   4. TTL enforcement (auto-teardown after N minutes)
 *   5. Graceful teardown (docker-compose down -v + file cleanup)
 *   6. Resource limits (max concurrent sandboxes per server)
 *
 * Architecture note:
 *   - Sandboxes with deployType="manus_spaces" are managed here (server-side Docker)
 *   - Sandboxes with deployType="local_download" only generate ZIP — no server Docker needed
 *   - All state is persisted in DB so restarts don't orphan containers
 */

import { exec } from "child_process";
import { promisify } from "util";
import * as fs from "fs/promises";
import * as path from "path";
import { generateEnvironment } from "./env-generator";
import { SANDBOX_DIR } from "./cloner";
import type { TechProfile } from "./tech-detector";

const execAsync = promisify(exec);

// ─── Configuration ────────────────────────────────────────────────────────────

/** Port range for sandbox containers (host ports) */
const PORT_RANGE_START = 19000;
const PORT_RANGE_END   = 19999;

/** Maximum concurrent server-side sandboxes (resource guard) */
const MAX_CONCURRENT_SANDBOXES = 10;

/** Default TTL in milliseconds — sandbox auto-tears down after this time */
const DEFAULT_TTL_MS = 60 * 60 * 1000; // 1 hour

/** How often the cleanup worker checks for expired sandboxes */
export const CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // every 5 minutes

/** How long to wait for a container to become healthy (ms) */
const HEALTH_CHECK_TIMEOUT_MS = 120_000; // 2 minutes
const HEALTH_CHECK_INTERVAL_MS = 2_000;  // poll every 2s

/** Retry configuration for docker-compose up */
const SPINUP_MAX_RETRIES = 3;
const SPINUP_RETRY_BASE_MS = 5_000; // 5s, 10s, 20s (exponential backoff)

/**
 * Per-stack health check configuration.
 * Some stacks need extra time for DB initialization before the web process is ready.
 */
const STACK_HEALTH_CONFIG: Record<string, { timeoutMs: number; path: string }> = {
  wordpress:   { timeoutMs: 180_000, path: "/wp-login.php" },
  woocommerce: { timeoutMs: 180_000, path: "/wp-login.php" },
  laravel:     { timeoutMs: 120_000, path: "/" },
  symfony:     { timeoutMs: 120_000, path: "/" },
  django:      { timeoutMs: 90_000,  path: "/" },
  rails:       { timeoutMs: 120_000, path: "/" },
  drupal:      { timeoutMs: 180_000, path: "/user/login" },
  magento:     { timeoutMs: 300_000, path: "/" },
  nextjs:      { timeoutMs: 90_000,  path: "/" },
  nuxt:        { timeoutMs: 90_000,  path: "/" },
  gatsby:      { timeoutMs: 60_000,  path: "/" },
  astro:       { timeoutMs: 60_000,  path: "/" },
  static:      { timeoutMs: 30_000,  path: "/" },
  default:     { timeoutMs: 120_000, path: "/" },
};

// ─── Port Pool ────────────────────────────────────────────────────────────────

/** In-memory set of ports currently in use by this process */
const usedPorts = new Set<number>();

/** Allocate a free port from the sandbox pool */
export async function allocatePort(): Promise<number> {
  for (let port = PORT_RANGE_START; port <= PORT_RANGE_END; port++) {
    if (usedPorts.has(port)) continue;
    if (await isPortFree(port)) {
      usedPorts.add(port);
      return port;
    }
  }
  throw new Error(`No free ports available in range ${PORT_RANGE_START}–${PORT_RANGE_END}`);
}

/** Release a port back to the pool */
export function releasePort(port: number): void {
  usedPorts.delete(port);
}

async function isPortFree(port: number): Promise<boolean> {
  try {
    const { stdout } = await execAsync(`ss -tlnp 2>/dev/null | grep ":${port} " || true`);
    return stdout.trim() === "";
  } catch {
    return true; // assume free if check fails
  }
}

// ─── Sandbox Directory ────────────────────────────────────────────────────────

export function getSandboxDir(sandboxId: number): string {
  return path.join(SANDBOX_DIR, `sandbox-${sandboxId}`);
}

export function getComposeFile(sandboxId: number): string {
  return path.join(getSandboxDir(sandboxId), "docker-compose.yml");
}

// ─── Spin Up ──────────────────────────────────────────────────────────────────

export interface SpinUpOptions {
  sandboxId: number;
  tech: TechProfile;
  ttlMs?: number;
  onProgress?: (msg: string) => void;
}

export interface SpinUpResult {
  success: boolean;
  sandboxUrl?: string;
  sandboxPort?: number;
  expiresAt?: Date;
  error?: string;
}

/**
 * Spin up a Docker Compose environment for a sandbox.
 * Writes all generated files, runs `docker-compose up -d`, waits for health.
 */
export async function spinUpSandbox(opts: SpinUpOptions): Promise<SpinUpResult> {
  const { sandboxId, tech, ttlMs = DEFAULT_TTL_MS, onProgress } = opts;
  const sandboxDir = getSandboxDir(sandboxId);

  let port: number | null = null;

  try {
    // Check resource limit
    const running = await countRunningContainers();
    if (running >= MAX_CONCURRENT_SANDBOXES) {
      return {
        success: false,
        error: `Server resource limit reached (max ${MAX_CONCURRENT_SANDBOXES} concurrent sandboxes). Please wait for another sandbox to finish.`,
      };
    }

    // Allocate port
    port = await allocatePort();
    onProgress?.(`Allocated port ${port}`);

    // Generate environment files
    const env = generateEnvironment(tech, port);
    await fs.mkdir(sandboxDir, { recursive: true });

    // Write docker-compose.yml
    await fs.writeFile(getComposeFile(sandboxId), env.dockerCompose, "utf-8");

    // Write additional files (Dockerfiles, configs, etc.)
    for (const [relPath, content] of Object.entries(env.extraFiles)) {
      const fullPath = path.join(sandboxDir, relPath);
      await fs.mkdir(path.dirname(fullPath), { recursive: true });
      await fs.writeFile(fullPath, String(content), "utf-8");
    }

    // Write TTL marker file so cleanup worker knows when to tear down
    const expiresAt = new Date(Date.now() + ttlMs);
    await fs.writeFile(
      path.join(sandboxDir, ".sandbox-meta.json"),
      JSON.stringify({
        sandboxId,
        port,
        expiresAt: expiresAt.toISOString(),
        tech: tech.environmentType,
        createdAt: new Date().toISOString(),
      }),
      "utf-8"
    );

    onProgress?.(`Starting ${tech.environmentType} environment on port ${port}...`);

    // Pull images first (non-blocking output, with timeout)
    try {
      await execAsync(
        `cd "${sandboxDir}" && docker-compose pull --quiet 2>&1 || true`,
        { timeout: 180_000 }
      );
    } catch {
      // Pull failures are non-fatal — images may already be cached
    }

    // Start containers with retry + exponential backoff
    let lastSpinUpError: Error | null = null;
    for (let attempt = 1; attempt <= SPINUP_MAX_RETRIES; attempt++) {
      try {
        await execAsync(
          `cd "${sandboxDir}" && docker-compose up -d --remove-orphans 2>&1`,
          { timeout: 120_000 }
        );
        lastSpinUpError = null;
        break; // success
      } catch (err) {
        lastSpinUpError = err instanceof Error ? err : new Error(String(err));
        if (attempt < SPINUP_MAX_RETRIES) {
          const waitMs = SPINUP_RETRY_BASE_MS * Math.pow(2, attempt - 1);
          onProgress?.(`docker-compose up failed (attempt ${attempt}/${SPINUP_MAX_RETRIES}), retrying in ${waitMs / 1000}s...`);
          // Bring down any partial state before retry
          try {
            await execAsync(`cd "${sandboxDir}" && docker-compose down -v --remove-orphans 2>&1 || true`, { timeout: 30_000 });
          } catch { /* ignore */ }
          await sleep(waitMs);
        }
      }
    }
    if (lastSpinUpError) throw lastSpinUpError;

    onProgress?.(`Containers started. Waiting for health check...`);

    // Per-stack health check — different stacks need different timeouts and paths
    const primaryPort = env.ports[0]?.host ?? port;
    const stackKey = tech.environmentType.toLowerCase();
    const healthCfg = STACK_HEALTH_CONFIG[stackKey] ?? STACK_HEALTH_CONFIG.default;
    const healthUrl = `http://localhost:${primaryPort}${healthCfg.path}`;

    onProgress?.(`Health checking ${tech.environmentType} at ${healthUrl} (timeout: ${healthCfg.timeoutMs / 1000}s)...`);
    const healthy = await waitForHealth(healthUrl, healthCfg.timeoutMs);

    if (!healthy) {
      onProgress?.(`Warning: health check timed out — sandbox may still be initializing (${tech.environmentType} can be slow to start)`);
    } else {
      onProgress?.(`Sandbox is healthy and ready (${tech.environmentType})`);
    }

    // Determine public URL
    // In production this would be a reverse-proxy subdomain; for now use localhost
    const sandboxUrl = `http://localhost:${primaryPort}`;

    return {
      success: true,
      sandboxUrl,
      sandboxPort: primaryPort,
      expiresAt,
    };
  } catch (err) {
    // Release port on failure
    if (port !== null) releasePort(port);

    // Attempt cleanup of partially started containers
    try {
      await execAsync(`cd "${sandboxDir}" && docker-compose down -v --remove-orphans 2>&1 || true`);
    } catch { /* ignore */ }

    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// ─── Health Check ─────────────────────────────────────────────────────────────

async function waitForHealth(url: string, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const { stdout } = await execAsync(
        `curl -s -o /dev/null -w "%{http_code}" --max-time 3 "${url}" 2>/dev/null || echo "000"`,
        { timeout: 5000 }
      );
      const code = parseInt(stdout.trim(), 10);
      if (code >= 200 && code < 600) return true; // any HTTP response = container is up
    } catch { /* not ready yet */ }
    await sleep(HEALTH_CHECK_INTERVAL_MS);
  }
  return false;
}

// ─── Teardown ─────────────────────────────────────────────────────────────────

export interface TeardownResult {
  success: boolean;
  error?: string;
}

/**
 * Tear down a sandbox environment:
 *   1. docker-compose down -v (stops containers, removes volumes)
 *   2. Release port from pool
 *   3. Remove sandbox files from disk
 */
export async function teardownSandbox(sandboxId: number): Promise<TeardownResult> {
  const sandboxDir = getSandboxDir(sandboxId);

  try {
    // Read meta to get port
    let port: number | null = null;
    try {
      const meta = JSON.parse(
        await fs.readFile(path.join(sandboxDir, ".sandbox-meta.json"), "utf-8")
      );
      port = meta.port ?? null;
    } catch { /* no meta file — sandbox may not have been spun up server-side */ }

    // Stop and remove containers + volumes
    const composeFile = getComposeFile(sandboxId);
    const composeExists = await fs.access(composeFile).then(() => true).catch(() => false);

    if (composeExists) {
      await execAsync(
        `cd "${sandboxDir}" && docker-compose down -v --remove-orphans --timeout 30 2>&1 || true`,
        { timeout: 60_000 }
      );
    }

    // Release port
    if (port !== null) releasePort(port);

    // Remove all sandbox files
    await execAsync(`rm -rf "${sandboxDir}" "${sandboxDir}.zip" 2>/dev/null || true`);

    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// ─── Status Check ─────────────────────────────────────────────────────────────

export interface ContainerStatus {
  running: boolean;
  services: Array<{ name: string; state: string; health: string }>;
}

/** Check current Docker Compose status for a sandbox */
export async function getSandboxContainerStatus(sandboxId: number): Promise<ContainerStatus> {
  const sandboxDir = getSandboxDir(sandboxId);
  try {
    const { stdout } = await execAsync(
      `cd "${sandboxDir}" && docker-compose ps --format json 2>/dev/null || echo "[]"`,
      { timeout: 10_000 }
    );
    // docker-compose ps --format json outputs one JSON object per line
    const lines = stdout.trim().split("\n").filter(Boolean);
    const services = lines.map(line => {
      try {
        const obj = JSON.parse(line);
        return {
          name: obj.Service ?? obj.Name ?? "unknown",
          state: obj.State ?? "unknown",
          health: obj.Health ?? "N/A",
        };
      } catch {
        return { name: "unknown", state: "unknown", health: "N/A" };
      }
    });
    const running = services.some(s => s.state === "running");
    return { running, services };
  } catch {
    return { running: false, services: [] };
  }
}

// ─── Expiry Check ─────────────────────────────────────────────────────────────

/** Read the expiry time from a sandbox meta file */
export async function getSandboxExpiry(sandboxId: number): Promise<Date | null> {
  try {
    const meta = JSON.parse(
      await fs.readFile(
        path.join(getSandboxDir(sandboxId), ".sandbox-meta.json"),
        "utf-8"
      )
    );
    return meta.expiresAt ? new Date(meta.expiresAt) : null;
  } catch {
    return null;
  }
}

/** Check if a sandbox has expired based on its TTL */
export async function isSandboxExpired(sandboxId: number): Promise<boolean> {
  const expiry = await getSandboxExpiry(sandboxId);
  if (!expiry) return false;
  return Date.now() > expiry.getTime();
}

/** Extend the TTL of a running sandbox */
export async function extendSandboxTTL(sandboxId: number, extraMs: number): Promise<void> {
  const metaPath = path.join(getSandboxDir(sandboxId), ".sandbox-meta.json");
  try {
    const meta = JSON.parse(await fs.readFile(metaPath, "utf-8"));
    const current = meta.expiresAt ? new Date(meta.expiresAt).getTime() : Date.now();
    meta.expiresAt = new Date(current + extraMs).toISOString();
    await fs.writeFile(metaPath, JSON.stringify(meta, null, 2), "utf-8");
  } catch { /* ignore if no meta */ }
}

// ─── Resource Counting ────────────────────────────────────────────────────────

/** Count how many sandbox Docker Compose projects are currently running */
async function countRunningContainers(): Promise<number> {
  try {
    const { stdout } = await execAsync(
      `docker ps --filter "label=com.docker.compose.project" --format "{{.Label \"com.docker.compose.project\"}}" 2>/dev/null | grep "^sandbox-" | sort -u | wc -l`,
      { timeout: 5000 }
    );
    return parseInt(stdout.trim(), 10) || 0;
  } catch {
    return 0;
  }
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
