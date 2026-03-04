/**
 * manusApi.ts — Manus Autonomous API handlers
 *
 * Endpoints (registered in server/_core/index.ts):
 *   GET  /api/manus/status       — health check + queue stats
 *   POST /api/manus/tasks        — submit a task to the queue
 *   GET  /api/manus/tasks        — list queue (filtered by status)
 *   POST /api/marketing/fb-event — receive FB CAPI event from landing pages
 *   POST /api/marketing/manychat — receive ManyChat webhook
 *
 * Authentication:
 *   Manus API:  Authorization: Bearer <MANUS_API_KEY>
 *   FB events:  x-internal-secret: <INTERNAL_API_SECRET>
 *   ManyChat:   x-manychat-secret: <MANYCHAT_WEBHOOK_SECRET>
 */
import type { Request, Response } from "express";
import {
  insertManusTask, listManusQueue, getManusTask, getMarketingStats,
  insertFbCapiEvent, markFbEventSent, markFbEventFailed,
  insertManychatEvent,
} from "./marketingDb";
import { sendCapiEvent, syncFbCampaigns, upsertCampaignFromMeta } from "./fbCapiService";

// ─── Auth helpers ─────────────────────────────────────────────────────────────
function requireManusKey(req: Request, res: Response): boolean {
  const key = process.env.MANUS_API_KEY;
  if (!key) {
    res.status(503).json({ error: "MANUS_API_KEY not configured on server" });
    return false;
  }
  const auth = req.headers.authorization ?? "";
  const provided = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (provided !== key) {
    res.status(401).json({ error: "Invalid Manus API key" });
    return false;
  }
  return true;
}

function requireInternalSecret(req: Request, res: Response): boolean {
  const secret = process.env.INTERNAL_API_SECRET;
  if (!secret) {
    res.status(503).json({ error: "INTERNAL_API_SECRET not configured" });
    return false;
  }
  if (req.headers["x-internal-secret"] !== secret) {
    res.status(401).json({ error: "Invalid internal secret" });
    return false;
  }
  return true;
}

function requireManychatSecret(req: Request, res: Response): boolean {
  const secret = process.env.MANYCHAT_WEBHOOK_SECRET;
  if (!secret) {
    res.status(503).json({ error: "MANYCHAT_WEBHOOK_SECRET not configured" });
    return false;
  }
  if (req.headers["x-manychat-secret"] !== secret) {
    res.status(401).json({ error: "Invalid ManyChat webhook secret" });
    return false;
  }
  return true;
}

// ─── Manus API handlers ───────────────────────────────────────────────────────

/** GET /api/manus/status */
export async function handleManusStatus(req: Request, res: Response) {
  if (!requireManusKey(req, res)) return;
  try {
    const stats = await getMarketingStats();
    res.json({
      status: "ok",
      version: "1.0.0",
      timestamp: new Date().toISOString(),
      queue: {
        pending: stats.pendingManusJobs,
        running: 0,
        done: 0,
        failed: 0,
      },
      marketing: {
        activeCampaigns: stats.activeCampaigns,
        capiEvents7d: stats.totalFbEvents,
      },
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
}

/** POST /api/manus/tasks — submit a task */
export async function handleManusSubmitTask(req: Request, res: Response) {
  if (!requireManusKey(req, res)) return;
  const { taskType, payload, priority, scheduledFor } = req.body ?? {};

  if (!taskType || typeof taskType !== "string") {
    res.status(400).json({ error: "taskType is required" });
    return;
  }

  try {
    const id = await insertManusTask({
      taskType,
      payload: payload ?? {},
      // priority: not in schema
      // callerToken validated separately
      // scheduledFor: not in schema
    });

    // Handle immediate tasks
    if (taskType === "fb.sync_campaigns") {
      // Fire and forget — sync campaigns in background
      syncFbCampaigns().then(async (result) => {
        if (result.success && result.campaigns) {
          for (const c of result.campaigns as any[]) {
            await upsertCampaignFromMeta(c);
          }
        }
      }).catch(console.error);
    }

    res.status(201).json({ id, status: "pending", taskType });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
}

/** GET /api/manus/tasks — list queue */
export async function handleManusListTasks(req: Request, res: Response) {
  if (!requireManusKey(req, res)) return;
  try {
    const limit = Math.min(Number(req.query.limit ?? 50), 200);
    const tasks = await listManusQueue(limit);
    res.json({ tasks, count: tasks.length });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
}

// ─── Marketing webhook handlers ───────────────────────────────────────────────

/** POST /api/marketing/fb-event — receive CAPI event from landing page */
export async function handleFbCapiEvent(req: Request, res: Response) {
  if (!requireInternalSecret(req, res)) return;
  const body = req.body ?? {};

  const {
    eventName, eventTime, eventSourceUrl, fbp, fbc,
    value, currency, contentName, contentType, externalId,
  } = body;

  if (!eventName) {
    res.status(400).json({ error: "eventName is required" });
    return;
  }

  try {
    const id = await insertFbCapiEvent({
      eventName,
      eventTime: eventTime ?? Math.floor(Date.now() / 1000),
      eventSourceUrl,
      fbp,
      fbc,
      userData: { externalId },
      customData: { value, currency: currency ?? "PLN", contentName, contentType },
    });

    // Forward to Meta CAPI asynchronously
    sendCapiEvent({
      eventName,
      eventTime: eventTime ?? Math.floor(Date.now() / 1000),
      eventSourceUrl,
      fbp,
      fbc,
      externalId: externalId as string | undefined,
      value: value as number | undefined,
      currency: currency ?? "PLN",
      contentName: contentName as string | undefined,
      contentType: contentType as string | undefined,
    }).then(async (result) => {
      if (result.success && result.eventId) {
        await markFbEventSent(id);
      } else {
        await markFbEventFailed(id, result.error ?? "unknown");
      }
    }).catch(console.error);

    res.status(202).json({ received: true, id });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
}

/** POST /api/marketing/manychat — receive ManyChat webhook */
export async function handleManychatWebhook(req: Request, res: Response) {
  if (!requireManychatSecret(req, res)) return;
  const body = req.body ?? {};

  const {
    event, subscriber_id, email, phone,
    first_name, last_name, flow_name, custom_fields,
  } = body;

  if (!event) {
    res.status(400).json({ error: "event is required" });
    return;
  }

  try {
    const id = await insertManychatEvent({
      eventType: event,
      subscriberId: subscriber_id,
      payload: { email, phone, firstName: first_name, lastName: last_name, source: "manychat", flowName: flow_name, customData: custom_fields },
    });

    // If it's a lead event, also send to FB CAPI
    if (event === "opt_in" || event === "lead") {
      const capiId = await insertFbCapiEvent({
        eventName: "Lead",
        eventTime: Math.floor(Date.now() / 1000),
        // externalId in userData
        // source: "manychat",
      });

      sendCapiEvent({
        eventName: "Lead",
        eventTime: Math.floor(Date.now() / 1000),
        // externalId in userData
      }).then(async (result) => {
        if (result.success && result.eventId) {
          await markFbEventSent(capiId);
        } else {
          await markFbEventFailed(capiId, result.error ?? "unknown");
        }
      }).catch(console.error);
    }

    res.status(202).json({ received: true, id });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
}
