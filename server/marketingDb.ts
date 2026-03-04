/**
 * Marketing Module — Database Operations
 * Handles FB CAPI events, ManyChat events, ad campaigns, and Manus task queue
 */
import { getDb } from "./db";
import { sql } from "drizzle-orm";

// ─── FB CAPI Events ───────────────────────────────────────────────────────────

export async function insertFbCapiEvent(data: {
  eventName: string;
  eventTime: number;
  eventSourceUrl?: string;
  fbp?: string;
  fbc?: string;
  userData?: Record<string, unknown>;
  customData?: Record<string, unknown>;
}): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.execute(sql`
    INSERT INTO fb_capi_events
      (event_name, event_time, event_source_url, fbp, fbc, user_data, custom_data, status)
    VALUES
      (${data.eventName}, ${data.eventTime}, ${data.eventSourceUrl ?? null},
       ${data.fbp ?? null}, ${data.fbc ?? null},
       ${JSON.stringify(data.userData ?? {})}, ${JSON.stringify(data.customData ?? {})},
       'pending')
  `);
  return (result as any).insertId ?? 0;
}

export async function listPendingFbEvents(): Promise<any[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.execute(sql`
    SELECT * FROM fb_capi_events WHERE status = 'pending' ORDER BY created_at ASC LIMIT 50
  `);
  return (rows as any)[0] ?? [];
}

export async function markFbEventSent(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.execute(sql`UPDATE fb_capi_events SET status='sent', sent_at=NOW() WHERE id=${id}`);
}

export async function markFbEventFailed(id: number, error: string): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.execute(sql`UPDATE fb_capi_events SET status='failed', meta_error=${error} WHERE id=${id}`);
}

export async function listRecentFbEvents(limit = 20): Promise<any[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.execute(sql`
    SELECT * FROM fb_capi_events ORDER BY created_at DESC LIMIT ${limit}
  `);
  return (rows as any)[0] ?? [];
}

// ─── ManyChat Events ──────────────────────────────────────────────────────────

export async function insertManychatEvent(data: {
  eventType: string;
  subscriberId?: string;
  payload?: Record<string, unknown>;
}): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const rows = await db.execute(sql`
    INSERT INTO manychat_events (event_type, subscriber_id, payload)
    VALUES (${data.eventType}, ${data.subscriberId ?? null}, ${JSON.stringify(data.payload ?? {})})
  `);
  return (rows as any).insertId ?? 0;
}

export async function listRecentManychatEvents(limit = 20): Promise<any[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.execute(sql`
    SELECT * FROM manychat_events ORDER BY created_at DESC LIMIT ${limit}
  `);
  return (rows as any)[0] ?? [];
}

// ─── FB Campaigns ─────────────────────────────────────────────────────────────

export async function listFbCampaigns(): Promise<any[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.execute(sql`SELECT * FROM fb_campaigns ORDER BY snapshot_at DESC`);
  return (rows as any)[0] ?? [];
}

export async function upsertFbCampaign(data: {
  campaignId: string;
  name: string;
  status: string;
  objective?: string;
  dailyBudget?: number;
  lifetimeBudget?: number;
  spend?: number;
  impressions?: number;
  clicks?: number;
  leads?: number;
  purchases?: number;
  cpm?: number;
  cpc?: number;
  cpl?: number;
}): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.execute(sql`
    INSERT INTO fb_campaigns
      (campaign_id, name, status, objective, daily_budget, lifetime_budget,
       spend, impressions, clicks, leads, purchases, cpm, cpc, cpl, snapshot_at)
    VALUES
      (${data.campaignId}, ${data.name}, ${data.status}, ${data.objective ?? null},
       ${data.dailyBudget ?? null}, ${data.lifetimeBudget ?? null},
       ${data.spend ?? 0}, ${data.impressions ?? 0}, ${data.clicks ?? 0},
       ${data.leads ?? 0}, ${data.purchases ?? 0},
       ${data.cpm ?? null}, ${data.cpc ?? null}, ${data.cpl ?? null}, NOW())
    ON DUPLICATE KEY UPDATE
      name=${data.name}, status=${data.status}, spend=${data.spend ?? 0},
      impressions=${data.impressions ?? 0}, clicks=${data.clicks ?? 0},
      leads=${data.leads ?? 0}, purchases=${data.purchases ?? 0},
      snapshot_at=NOW()
  `);
}

// ─── Manus Task Queue ─────────────────────────────────────────────────────────

export async function insertManusTask(data: {
  taskType: string;
  payload?: Record<string, unknown>;
  submittedBy?: string;
}): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const rows = await db.execute(sql`
    INSERT INTO manus_queue (task_type, payload, submitted_by, status)
    VALUES (${data.taskType}, ${JSON.stringify(data.payload ?? {})}, ${data.submittedBy ?? 'manus'}, 'pending')
  `);
  return (rows as any).insertId ?? 0;
}

export async function getManusTask(id: number): Promise<any | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.execute(sql`SELECT * FROM manus_queue WHERE id=${id} LIMIT 1`);
  return ((rows as any)[0] ?? [])[0] ?? null;
}

export async function claimManusTask(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.execute(sql`UPDATE manus_queue SET status='running', started_at=NOW() WHERE id=${id}`);
}

export async function completeManusTask(id: number, result: Record<string, unknown>): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.execute(sql`
    UPDATE manus_queue SET status='done', result=${JSON.stringify(result)}, completed_at=NOW() WHERE id=${id}
  `);
}

export async function listManusQueue(limit = 50): Promise<any[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.execute(sql`
    SELECT * FROM manus_queue ORDER BY created_at DESC LIMIT ${limit}
  `);
  return (rows as any)[0] ?? [];
}

// ─── Dashboard Stats ──────────────────────────────────────────────────────────

export async function getMarketingStats(): Promise<{
  totalFbEvents: number;
  pendingFbEvents: number;
  totalManychatEvents: number;
  activeCampaigns: number;
  totalSpend: number;
  totalLeads: number;
  pendingManusJobs: number;
}> {
  const db = await getDb();
  if (!db) return { totalFbEvents: 0, pendingFbEvents: 0, totalManychatEvents: 0, activeCampaigns: 0, totalSpend: 0, totalLeads: 0, pendingManusJobs: 0 };

  const [campaignRow] = await db.execute(sql`
    SELECT COUNT(*) as cnt, COALESCE(SUM(spend),0) as spend, COALESCE(SUM(leads),0) as leads
    FROM fb_campaigns WHERE status='ACTIVE'
  `);
  const [capiRow] = await db.execute(sql`
    SELECT COUNT(*) as total, SUM(status='pending') as pending FROM fb_capi_events
  `);
  const [queueRow] = await db.execute(sql`
    SELECT SUM(status='pending') as pending FROM manus_queue
  `);
  const [mcRow] = await db.execute(sql`SELECT COUNT(*) as cnt FROM manychat_events`);

  const camp = ((campaignRow as any)[0] ?? [])[0] ?? {};
  const capi = ((capiRow as any)[0] ?? [])[0] ?? {};
  const queue = ((queueRow as any)[0] ?? [])[0] ?? {};
  const mc = ((mcRow as any)[0] ?? [])[0] ?? {};

  return {
    totalFbEvents: Number(capi.total ?? 0),
    pendingFbEvents: Number(capi.pending ?? 0),
    totalManychatEvents: Number(mc.cnt ?? 0),
    activeCampaigns: Number(camp.cnt ?? 0),
    totalSpend: Number(camp.spend ?? 0),
    totalLeads: Number(camp.leads ?? 0),
    pendingManusJobs: Number(queue.pending ?? 0),
  };
}
