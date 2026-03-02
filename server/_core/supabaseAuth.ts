import type { Express, Request, Response } from "express";
import { createRemoteJWKSet, jwtVerify } from "jose";
import * as db from "../db";
import { getSessionCookieOptions } from "./cookies";
import { sdk } from "./sdk";
import { COOKIE_NAME, ONE_YEAR_MS } from "../../shared/const";

const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? "";
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY ?? "";

// Emails that are allowed to access the app
const ALLOWED_EMAILS = new Set([
  "***REDACTED***",
]);

// Emails that automatically receive admin role
const ADMIN_EMAILS = new Set([
  "***REDACTED***",
]);

// JWKS endpoint for Supabase project
let _jwks: ReturnType<typeof createRemoteJWKSet> | null = null;
function getJWKS() {
  if (!_jwks && SUPABASE_URL) {
    _jwks = createRemoteJWKSet(
      new URL(`${SUPABASE_URL}/auth/v1/.well-known/jwks.json`)
    );
  }
  return _jwks;
}

interface SupabaseJwtPayload {
  sub: string;
  email?: string;
  user_metadata?: { full_name?: string; name?: string };
  app_metadata?: Record<string, unknown>;
  role?: string;
  aud?: string;
}

export async function verifySupabaseToken(
  accessToken: string
): Promise<SupabaseJwtPayload | null> {
  const jwks = getJWKS();
  if (!jwks) return null;
  try {
    const { payload } = await jwtVerify(accessToken, jwks, {
      algorithms: ["ES256", "RS256"],
    });
    return payload as unknown as SupabaseJwtPayload;
  } catch (err) {
    console.warn("[SupabaseAuth] Token verification failed:", String(err));
    return null;
  }
}

export function registerSupabaseAuthRoutes(app: Express) {
  /**
   * POST /api/auth/supabase-callback
   * Frontend sends Supabase access_token, server verifies it, checks allowlist
   * and issues an app session cookie (JWT signed with JWT_SECRET).
   */
  app.post("/api/auth/supabase-callback", async (req: Request, res: Response) => {
    const { access_token } = req.body ?? {};

    if (!access_token || typeof access_token !== "string") {
      res.status(400).json({ error: "access_token is required" });
      return;
    }

    const payload = await verifySupabaseToken(access_token);
    if (!payload || !payload.sub) {
      res.status(401).json({ error: "Invalid or expired Supabase token" });
      return;
    }

    const email = payload.email ?? null;

    // Allowlist check
    if (!email || !ALLOWED_EMAILS.has(email.toLowerCase())) {
      console.warn(`[SupabaseAuth] Unauthorized email attempt: ${email}`);
      res.status(403).json({ error: "Access denied. Your email is not authorized." });
      return;
    }

    const openId = `supabase:${payload.sub}`;
    const name =
      payload.user_metadata?.full_name ??
      payload.user_metadata?.name ??
      email;

    try {
      const isAdmin = email ? ADMIN_EMAILS.has(email.toLowerCase()) : false;
      await db.upsertUser({
        openId,
        name,
        email,
        role: isAdmin ? "admin" : undefined,
        loginMethod: "supabase",
        lastSignedIn: new Date(),
      });

      const sessionToken = await sdk.createSessionToken(openId, {
        name,
        expiresInMs: ONE_YEAR_MS,
      });

      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, {
        ...cookieOptions,
        maxAge: ONE_YEAR_MS,
      });

      res.json({ success: true });
    } catch (error) {
      console.error("[SupabaseAuth] Callback failed:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  /**
   * GET /api/auth/supabase-config
   * Returns public Supabase config for the frontend.
   */
  app.get("/api/auth/supabase-config", (_req: Request, res: Response) => {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      res.status(503).json({ error: "Supabase not configured" });
      return;
    }
    res.json({
      url: SUPABASE_URL,
      anonKey: SUPABASE_ANON_KEY,
    });
  });
}
