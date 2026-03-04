/**
 * fbCapiService.ts — Facebook Conversions API (CAPI) service
 * Sends server-side events to Meta Marketing API
 * Docs: https://developers.facebook.com/docs/marketing-api/conversions-api
 */

const META_CAPI_URL = "https://graph.facebook.com/v19.0";

export interface CapiEventData {
  eventName: string;
  eventTime: number;
  eventSourceUrl?: string;
  fbp?: string;
  fbc?: string;
  clientUserAgent?: string;
  clientIpAddress?: string;
  externalId?: string;
  value?: number;
  currency?: string;
  contentName?: string;
  contentType?: string;
}

export interface CapiResult {
  success: boolean;
  eventId?: string;
  response?: unknown;
  error?: string;
}

/**
 * Send a single event to Meta CAPI
 */
export async function sendCapiEvent(data: CapiEventData): Promise<CapiResult> {
  const pixelId = process.env.FB_PIXEL_ID;
  const accessToken = process.env.FB_ACCESS_TOKEN;

  if (!pixelId || !accessToken) {
    return { success: false, error: "FB_PIXEL_ID or FB_ACCESS_TOKEN not configured" };
  }

  const eventId = `${data.eventName}_${Date.now()}_${Math.random().toString(36).slice(2)}`;

  const payload: Record<string, unknown> = {
    data: [{
      event_name: data.eventName,
      event_time: data.eventTime,
      event_id: eventId,
      event_source_url: data.eventSourceUrl,
      action_source: "website",
      user_data: {
        ...(data.fbp && { fbp: data.fbp }),
        ...(data.fbc && { fbc: data.fbc }),
        ...(data.clientUserAgent && { client_user_agent: data.clientUserAgent }),
        ...(data.clientIpAddress && { client_ip_address: data.clientIpAddress }),
        ...(data.externalId && { external_id: data.externalId }),
      },
      ...(data.value !== undefined && {
        custom_data: {
          value: data.value,
          currency: data.currency ?? "PLN",
          ...(data.contentName && { content_name: data.contentName }),
          ...(data.contentType && { content_type: data.contentType }),
        },
      }),
    }],
  };

  // Add test event code in non-production environments
  if (process.env.FB_TEST_EVENT_CODE) {
    payload.test_event_code = process.env.FB_TEST_EVENT_CODE;
  }

  try {
    const url = `${META_CAPI_URL}/${pixelId}/events?access_token=${accessToken}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const json = await res.json() as Record<string, unknown>;

    if (!res.ok) {
      return { success: false, error: JSON.stringify(json), response: json };
    }

    return { success: true, eventId, response: json };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

/**
 * Sync campaign data from Meta Marketing API
 */
export async function syncFbCampaigns(): Promise<{
  success: boolean;
  campaigns?: unknown[];
  error?: string;
}> {
  const adAccountId = process.env.FB_AD_ACCOUNT_ID;
  const accessToken = process.env.FB_ACCESS_TOKEN;

  if (!adAccountId || !accessToken) {
    return { success: false, error: "FB_AD_ACCOUNT_ID or FB_ACCESS_TOKEN not configured" };
  }

  const fields = [
    "id", "name", "status", "objective",
    "daily_budget", "lifetime_budget",
    "insights.date_preset(last_7d){spend,impressions,clicks,reach,cpm,cpc,actions}",
  ].join(",");

  try {
    const url = `${META_CAPI_URL}/${adAccountId}/campaigns?fields=${fields}&access_token=${accessToken}&limit=50`;
    const res = await fetch(url);
    const json = await res.json() as { data?: unknown[]; error?: unknown };

    if (!res.ok || json.error) {
      return { success: false, error: JSON.stringify(json.error ?? json) };
    }

    return { success: true, campaigns: json.data ?? [] };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

/**
 * Parse Meta API campaign response and upsert into DB
 */
export async function upsertCampaignFromMeta(campaign: Record<string, any>): Promise<void> {
  const { upsertFbCampaign } = await import("./marketingDb");
  const insights = campaign.insights?.data?.[0] ?? {};
  const actions = insights.actions ?? [];

  const leads = actions.find((a: any) => a.action_type === "lead")?.value ?? 0;
  const purchases = actions.find((a: any) => a.action_type === "purchase")?.value ?? 0;

  await upsertFbCampaign({
    campaignId: campaign.id,
    name: campaign.name,
    // adAccountId stored separately
    status: campaign.status,
    objective: campaign.objective,
    dailyBudget: campaign.daily_budget ? Number(campaign.daily_budget) / 100 : undefined,
    lifetimeBudget: campaign.lifetime_budget ? Number(campaign.lifetime_budget) / 100 : undefined,
    spend: insights.spend ? Number(insights.spend) : 0,
    impressions: insights.impressions ? Number(insights.impressions) : 0,
    clicks: insights.clicks ? Number(insights.clicks) : 0,
    leads: Number(leads),
    purchases: Number(purchases),
    // reach: not in schema
    cpm: insights.cpm ? Number(insights.cpm) : undefined,
    cpc: insights.cpc ? Number(insights.cpc) : undefined,
    cpl: leads > 0 && insights.spend ? Number(insights.spend) / Number(leads) : undefined,
    // roas: not in schema
    // dateStart: not in schema
    // dateStop: not in schema
  });
}
