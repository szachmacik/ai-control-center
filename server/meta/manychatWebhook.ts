/**
 * ManyChat Webhook Receiver
 *
 * Receives events from ManyChat (subscriber actions, conversation events,
 * flow completions, custom fields updates) and stores them in the database.
 *
 * No external keys required — this module only receives and stores data.
 * To forward events to Meta CAPI, the user needs to add a Pixel + Access Token
 * via the Meta Ads module.
 *
 * Webhook URL: POST /api/webhooks/manychat
 * Verification: GET /api/webhooks/manychat?hub.challenge=...
 */

import type { Request, Response } from "express";
import crypto from "crypto";
import { getDb } from "../db";
import { manychatEvents, metaPixels, users } from "../../drizzle/schema";
import { createNotification } from "../notificationsDb";
import { sendMetaEvent, leadEvent } from "./metaCapi";
import { eq, desc } from "drizzle-orm";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ManyChatSubscriber {
  id: string;
  first_name?: string;
  last_name?: string;
  name?: string;
  email?: string;
  phone?: string;
  gender?: string;
  locale?: string;
  timezone?: string;
  live_chat_url?: string;
  last_input_text?: string;
  opted_in_to_sms?: boolean;
  is_followup_enabled?: boolean;
  ig_username?: string;
  ig_id?: string;
  whatsapp_phone?: string;
  custom_fields?: Record<string, unknown>;
}

export interface ManyChatWebhookPayload {
  type: string;
  id?: string;
  subscriber?: ManyChatSubscriber;
  flow_id?: string;
  flow_name?: string;
  tag?: string;
  custom_field?: { name: string; value: unknown };
  timestamp?: number;
  channel?: "messenger" | "instagram" | "whatsapp" | "sms" | "email";
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Signature verification
// ---------------------------------------------------------------------------

export function verifyManyChatSignature(
  rawBody: string,
  signature: string,
  secret: string
): boolean {
  if (!secret || !signature) return false;
  const expected = crypto
    .createHmac("sha256", secret)
    .update(rawBody)
    .digest("hex");
  const provided = signature.replace("sha256=", "");
  try {
    return crypto.timingSafeEqual(
      Buffer.from(expected, "hex"),
      Buffer.from(provided, "hex")
    );
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Event classification
// ---------------------------------------------------------------------------

interface EventClassification {
  category: string;
  isLead: boolean;
  isConversion: boolean;
}

export function classifyEvent(payload: ManyChatWebhookPayload): EventClassification {
  const type = (payload.type ?? "").toLowerCase();
  const tag = (payload.tag ?? "").toLowerCase();
  const flowName = (payload.flow_name ?? "").toLowerCase();

  // Lead events
  if (
    type.includes("subscribed") ||
    type.includes("opt_in") ||
    type.includes("lead") ||
    tag.includes("lead") ||
    flowName.includes("lead")
  ) {
    return { category: "lead", isLead: true, isConversion: false };
  }

  // Purchase / conversion events
  if (
    type.includes("purchase") ||
    type.includes("payment") ||
    tag.includes("purchase") ||
    tag.includes("paid") ||
    flowName.includes("purchase") ||
    flowName.includes("checkout")
  ) {
    return { category: "purchase", isLead: false, isConversion: true };
  }

  // Engagement
  if (
    type.includes("message") ||
    type.includes("click") ||
    type.includes("button") ||
    type.includes("flow_completed")
  ) {
    return { category: "engagement", isLead: false, isConversion: false };
  }

  // Unsubscribe
  if (type.includes("unsubscribed") || type.includes("opt_out")) {
    return { category: "unsubscribe", isLead: false, isConversion: false };
  }

  return { category: "other", isLead: false, isConversion: false };
}

// ---------------------------------------------------------------------------
// Database helpers
// ---------------------------------------------------------------------------

export async function storeManyChatEvent(
  pixelId: number | null,
  payload: ManyChatWebhookPayload,
  rawBody: string
): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const { category, isLead, isConversion } = classifyEvent(payload);

  const [result] = await db
    .insert(manychatEvents)
    .values({
      pixelId,
      eventType: payload.type ?? "unknown",
      category,
      isLead: isLead ? 1 : 0,
      isConversion: isConversion ? 1 : 0,
      subscriberId: payload.subscriber?.id ?? null,
      subscriberEmail: payload.subscriber?.email ?? null,
      subscriberPhone: payload.subscriber?.phone ?? null,
      subscriberName: payload.subscriber?.name ?? payload.subscriber?.first_name ?? null,
      channel: payload.channel ?? null,
      flowId: payload.flow_id ?? null,
      flowName: payload.flow_name ?? null,
      tag: payload.tag ?? null,
      rawPayload: JSON.stringify(payload),
      receivedAt: new Date(),
    })
    .$returningId();

  return result.id;
}

// ---------------------------------------------------------------------------
// Auto-forward to Meta CAPI (if pixel is configured)
// ---------------------------------------------------------------------------

export async function forwardToMetaCapi(
  payload: ManyChatWebhookPayload,
  eventId: number
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const { isLead, isConversion, category } = classifyEvent(payload);

  if (!isLead && !isConversion) return;

  // Find active pixels that have manychat forwarding enabled
  const pixels = await db
    .select()
    .from(metaPixels)
    .where(eq(metaPixels.isActive, true))
    .limit(5);

  if (!pixels.length) return;

  const subscriber = payload.subscriber;
  const userData = subscriber
    ? {
        email: subscriber.email,
        phone: subscriber.phone,
        firstName: subscriber.first_name,
        lastName: subscriber.last_name,
      }
    : {};

  for (const pixel of pixels) {
    try {
      const config = {
        pixelId: pixel.pixelId,
        accessToken: pixel.accessToken,
        testEventCode: pixel.testEventCode ?? undefined,
      };

      if (isLead) {
        const event = leadEvent({
          url: `https://manychat.com/flow/${payload.flow_id ?? "unknown"}`,
          userData,
          contentName: payload.flow_name ?? "ManyChat Flow",
          eventId: `mc_${eventId}_${pixel.id}`,
        });
        await sendMetaEvent(event, config);
      } else if (category === "purchase") {
        const value = Number(
          (payload.subscriber?.custom_fields as Record<string, unknown>)?.["purchase_value"] ?? 0
        );
        if (value > 0) {
          const purchaseEvent = {
            eventName: "Purchase" as const,
            eventSourceUrl: `https://manychat.com/flow/${payload.flow_id ?? "unknown"}`,
            actionSource: "website" as const,
            userData,
            customData: { value, currency: "PLN" },
            eventId: `mc_purchase_${eventId}_${pixel.id}`,
          };
          await sendMetaEvent(purchaseEvent, config);
        }
      }
    } catch {
      // Non-fatal — log but don't throw
    }
  }
}

// ---------------------------------------------------------------------------
// Express handlers
// ---------------------------------------------------------------------------

/**
 * GET /api/webhooks/manychat
 * ManyChat webhook verification challenge
 */
export function handleManyChatVerification(req: Request, res: Response): void {
  const challenge = req.query["hub.challenge"];
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];

  if (challenge) {
    res.status(200).send(String(challenge));
    return;
  }

  res.status(200).json({ status: "ok", mode, token });
}

/**
 * POST /api/webhooks/manychat
 * Receives ManyChat webhook events
 */
export async function handleManyChatWebhook(
  req: Request,
  res: Response
): Promise<void> {
  // Respond quickly to avoid ManyChat timeout
  res.status(200).json({ received: true });

  try {
    const rawBody =
      typeof req.body === "string" ? req.body : JSON.stringify(req.body);
    const payload: ManyChatWebhookPayload =
      typeof req.body === "string" ? JSON.parse(req.body) : req.body;

    // Optional signature verification (if MANYCHAT_WEBHOOK_SECRET is set)
    const secret = process.env.MANYCHAT_WEBHOOK_SECRET;
    const signature = req.headers["x-hub-signature-256"] as string;
    if (secret && signature) {
      if (!verifyManyChatSignature(rawBody, signature, secret)) {
        console.warn("[ManyChat] Invalid webhook signature");
        return;
      }
    }

    // Store event
    const eventId = await storeManyChatEvent(null, payload, rawBody);

    // Forward to Meta CAPI if configured
    await forwardToMetaCapi(payload, eventId);

    // Create in-app notification for lead events
    const { isLead } = classifyEvent(payload);
    if (isLead && payload.subscriber) {
      const db2 = await getDb();
      if (!db2) return;
      const adminUsers = await db2
        .select({ id: users.id })
        .from(users)
        .where(eq(users.role, "admin"))
        .limit(10);

      for (const user of adminUsers) {
        await createNotification({
          userId: user.id,
          type: "security",
          severity: "info",
          title: "New ManyChat Lead",
          body: `${payload.subscriber.name ?? payload.subscriber.first_name ?? "Subscriber"} opted in via ${payload.channel ?? "ManyChat"}${payload.flow_name ? ` (flow: ${payload.flow_name})` : ""}`,
          link: "/meta-ads",
        }).catch(() => {});
      }
    }
  } catch (err) {
    console.error("[ManyChat] Webhook processing error:", err);
  }
}

// ---------------------------------------------------------------------------
// Query helpers (used by metaRouter)
// ---------------------------------------------------------------------------

export async function listManyChatEvents(options: {
  pixelId?: number;
  category?: string;
  limit?: number;
  offset?: number;
}) {
  const db = await getDb();
  if (!db) return [];
  const { limit = 50, offset = 0 } = options;

  const rows = await db
    .select()
    .from(manychatEvents)
    .orderBy(desc(manychatEvents.receivedAt))
    .limit(limit)
    .offset(offset);

  return rows;
}

export async function getManyChatStats() {
  const db = await getDb();
  if (!db) return { total: 0, leads: 0, conversions: 0, byChannel: {}, byCategory: {} };
  const rows = await db.select().from(manychatEvents);

  const total = rows.length;
  const leads = rows.filter((r) => r.isLead).length;
  const conversions = rows.filter((r) => r.isConversion).length;
  const byChannel = rows.reduce(
    (acc, r) => {
      const ch = r.channel ?? "unknown";
      acc[ch] = (acc[ch] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );
  const byCategory = rows.reduce(
    (acc, r) => {
      acc[r.category] = (acc[r.category] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  return { total, leads, conversions, byChannel, byCategory };
}
