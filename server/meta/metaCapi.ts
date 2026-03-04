/**
 * Meta Conversions API (CAPI) — Server-Side Event Tracking
 *
 * Sends conversion events directly from the server to Meta,
 * bypassing ad blockers and iOS privacy restrictions.
 *
 * Docs: https://developers.facebook.com/docs/marketing-api/conversions-api
 */

import * as crypto from "crypto";

// ─── Types ────────────────────────────────────────────────────────────────────

export type MetaEventName =
  | "PageView"
  | "ViewContent"
  | "Lead"
  | "CompleteRegistration"
  | "Purchase"
  | "AddToCart"
  | "InitiateCheckout"
  | "Search"
  | "Contact"
  | "Subscribe"
  | "CustomizeProduct"
  | "FindLocation"
  | "Schedule"
  | "StartTrial"
  | "SubmitApplication";

export interface MetaUserData {
  email?: string;
  phone?: string;
  firstName?: string;
  lastName?: string;
  city?: string;
  state?: string;
  country?: string;
  zip?: string;
  externalId?: string;
  clientIpAddress?: string;
  clientUserAgent?: string;
  fbp?: string;  // Facebook browser cookie (_fbp)
  fbc?: string;  // Facebook click ID cookie (_fbc)
}

export interface MetaCustomData {
  value?: number;
  currency?: string;
  contentName?: string;
  contentCategory?: string;
  contentIds?: string[];
  contentType?: string;
  orderId?: string;
  predictedLtv?: number;
  numItems?: number;
  searchString?: string;
  status?: string;
  [key: string]: unknown;
}

export interface MetaEvent {
  eventName: MetaEventName | string;
  eventTime?: number;            // Unix timestamp — defaults to now
  eventSourceUrl?: string;       // URL where the event occurred
  actionSource?: "website" | "app" | "phone_call" | "chat" | "email" | "other";
  userData?: MetaUserData;
  customData?: MetaCustomData;
  eventId?: string;              // Deduplication ID (match with pixel eventID)
  testEventCode?: string;        // For Meta Events Manager test mode
}

export interface MetaCapiConfig {
  pixelId: string;
  accessToken: string;
  testEventCode?: string;
}

export interface MetaCapiResult {
  eventsReceived: number;
  fbtrace_id: string;
  messages?: string[];
  error?: string;
}

// ─── Hashing ──────────────────────────────────────────────────────────────────

function sha256(value: string): string {
  return crypto.createHash("sha256").update(value.trim().toLowerCase()).digest("hex");
}

function hashUserData(userData: MetaUserData): Record<string, string | string[]> {
  const hashed: Record<string, string | string[]> = {};

  if (userData.email) hashed.em = sha256(userData.email);
  if (userData.phone) {
    // Normalize: remove spaces, dashes, parentheses
    const phone = userData.phone.replace(/[\s\-().]/g, "");
    hashed.ph = sha256(phone);
  }
  if (userData.firstName) hashed.fn = sha256(userData.firstName);
  if (userData.lastName) hashed.ln = sha256(userData.lastName);
  if (userData.city) hashed.ct = sha256(userData.city);
  if (userData.state) hashed.st = sha256(userData.state);
  if (userData.country) hashed.country = sha256(userData.country);
  if (userData.zip) hashed.zp = sha256(userData.zip);
  if (userData.externalId) hashed.external_id = sha256(userData.externalId);

  // These are NOT hashed
  if (userData.clientIpAddress) hashed.client_ip_address = userData.clientIpAddress;
  if (userData.clientUserAgent) hashed.client_user_agent = userData.clientUserAgent;
  if (userData.fbp) hashed.fbp = userData.fbp;
  if (userData.fbc) hashed.fbc = userData.fbc;

  return hashed;
}

// ─── Build event payload ──────────────────────────────────────────────────────

function buildEventPayload(event: MetaEvent, config: MetaCapiConfig): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    event_name: event.eventName,
    event_time: event.eventTime ?? Math.floor(Date.now() / 1000),
    action_source: event.actionSource ?? "website",
  };

  if (event.eventSourceUrl) payload.event_source_url = event.eventSourceUrl;
  if (event.eventId) payload.event_id = event.eventId;

  if (event.userData) {
    payload.user_data = hashUserData(event.userData);
  } else {
    payload.user_data = {};
  }

  if (event.customData && Object.keys(event.customData).length > 0) {
    const custom: Record<string, unknown> = {};
    if (event.customData.value !== undefined) custom.value = event.customData.value;
    if (event.customData.currency) custom.currency = event.customData.currency.toUpperCase();
    if (event.customData.contentName) custom.content_name = event.customData.contentName;
    if (event.customData.contentCategory) custom.content_category = event.customData.contentCategory;
    if (event.customData.contentIds) custom.content_ids = event.customData.contentIds;
    if (event.customData.contentType) custom.content_type = event.customData.contentType;
    if (event.customData.orderId) custom.order_id = event.customData.orderId;
    if (event.customData.predictedLtv !== undefined) custom.predicted_ltv = event.customData.predictedLtv;
    if (event.customData.numItems !== undefined) custom.num_items = event.customData.numItems;
    if (event.customData.searchString) custom.search_string = event.customData.searchString;
    if (event.customData.status) custom.status = event.customData.status;
    payload.custom_data = custom;
  }

  return payload;
}

// ─── Send events to Meta CAPI ─────────────────────────────────────────────────

export async function sendMetaEvents(
  events: MetaEvent[],
  config: MetaCapiConfig
): Promise<MetaCapiResult> {
  const url = `https://graph.facebook.com/v19.0/${config.pixelId}/events`;

  const data: Record<string, unknown> = {
    data: events.map((e) => buildEventPayload(e, config)),
    access_token: config.accessToken,
  };

  if (config.testEventCode) {
    data.test_event_code = config.testEventCode;
  }

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

  const json = await response.json() as any;

  if (!response.ok) {
    const errMsg = json?.error?.message ?? `HTTP ${response.status}`;
    return { eventsReceived: 0, fbtrace_id: "", error: errMsg };
  }

  return {
    eventsReceived: json.events_received ?? 0,
    fbtrace_id: json.fbtrace_id ?? "",
    messages: json.messages,
  };
}

// ─── Single event helper ──────────────────────────────────────────────────────

export async function sendMetaEvent(
  event: MetaEvent,
  config: MetaCapiConfig
): Promise<MetaCapiResult> {
  return sendMetaEvents([event], config);
}

// ─── Common event factories ───────────────────────────────────────────────────

export function pageViewEvent(options: {
  url: string;
  userData?: MetaUserData;
  eventId?: string;
}): MetaEvent {
  return {
    eventName: "PageView",
    eventSourceUrl: options.url,
    userData: options.userData,
    eventId: options.eventId,
    actionSource: "website",
  };
}

export function leadEvent(options: {
  url: string;
  userData?: MetaUserData;
  contentName?: string;
  value?: number;
  currency?: string;
  eventId?: string;
}): MetaEvent {
  return {
    eventName: "Lead",
    eventSourceUrl: options.url,
    userData: options.userData,
    eventId: options.eventId,
    actionSource: "website",
    customData: {
      contentName: options.contentName,
      value: options.value,
      currency: options.currency ?? "PLN",
    },
  };
}

export function purchaseEvent(options: {
  url: string;
  value: number;
  currency?: string;
  orderId?: string;
  userData?: MetaUserData;
  eventId?: string;
}): MetaEvent {
  return {
    eventName: "Purchase",
    eventSourceUrl: options.url,
    userData: options.userData,
    eventId: options.eventId,
    actionSource: "website",
    customData: {
      value: options.value,
      currency: options.currency ?? "PLN",
      orderId: options.orderId,
    },
  };
}

// ─── Test connection ──────────────────────────────────────────────────────────

export async function testMetaCapiConnection(config: MetaCapiConfig): Promise<{
  success: boolean;
  pixelId: string;
  message: string;
}> {
  try {
    const result = await sendMetaEvent(
      {
        eventName: "PageView",
        eventSourceUrl: "https://test.example.com",
        actionSource: "website",
        userData: {},
        testEventCode: config.testEventCode,
      },
      config
    );

    if (result.error) {
      return { success: false, pixelId: config.pixelId, message: result.error };
    }

    return {
      success: true,
      pixelId: config.pixelId,
      message: `Connection successful. Events received: ${result.eventsReceived}. Trace: ${result.fbtrace_id}`,
    };
  } catch (err: any) {
    return { success: false, pixelId: config.pixelId, message: err?.message ?? String(err) };
  }
}
