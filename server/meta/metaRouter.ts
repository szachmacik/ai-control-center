/**
 * Meta Ads CAPI — tRPC Router
 *
 * Manages Meta pixel configurations and sends server-side conversion events.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { metaPixels, metaEvents } from "../../drizzle/schema";
import { eq, desc, and } from "drizzle-orm";
import {
  sendMetaEvent,
  sendMetaEvents,
  testMetaCapiConnection,
  pageViewEvent,
  leadEvent,
  purchaseEvent,
  type MetaCapiConfig,
  type MetaEvent,
} from "./metaCapi";

// ─── Input schemas ────────────────────────────────────────────────────────────

const userDataSchema = z.object({
  email: z.string().email().optional(),
  phone: z.string().optional(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  city: z.string().optional(),
  country: z.string().optional(),
  externalId: z.string().optional(),
  clientIpAddress: z.string().optional(),
  clientUserAgent: z.string().optional(),
  fbp: z.string().optional(),
  fbc: z.string().optional(),
}).optional();

const customDataSchema = z.object({
  value: z.number().optional(),
  currency: z.string().optional(),
  contentName: z.string().optional(),
  contentCategory: z.string().optional(),
  orderId: z.string().optional(),
  numItems: z.number().optional(),
  searchString: z.string().optional(),
  status: z.string().optional(),
}).optional();

// ─── Router ───────────────────────────────────────────────────────────────────

export const metaRouter = router({

  // ─── Pixel management ───────────────────────────────────────────────────────

  addPixel: protectedProcedure
    .input(z.object({
      name: z.string().min(1).max(128),
      pixelId: z.string().min(1),
      accessToken: z.string().min(1),
      testEventCode: z.string().optional(),
      domain: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      // Test connection before saving
      const testResult = await testMetaCapiConnection({
        pixelId: input.pixelId,
        accessToken: input.accessToken,
        testEventCode: input.testEventCode,
      });

      if (!testResult.success) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Meta CAPI connection failed: ${testResult.message}`,
        });
      }

      const [result] = await db
        .insert(metaPixels)
        .values({
          userId: ctx.user.id,
          name: input.name,
          pixelId: input.pixelId,
          accessToken: input.accessToken,
          testEventCode: input.testEventCode ?? null,
          domain: input.domain ?? null,
          isActive: true,
        })
        .$returningId();

      return { pixelDbId: result.id, pixelId: input.pixelId, message: testResult.message };
    }),

  listPixels: protectedProcedure
    .query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return [];

      return db
        .select({
          id: metaPixels.id,
          name: metaPixels.name,
          pixelId: metaPixels.pixelId,
          domain: metaPixels.domain,
          isActive: metaPixels.isActive,
          testEventCode: metaPixels.testEventCode,
          createdAt: metaPixels.createdAt,
        })
        .from(metaPixels)
        .where(eq(metaPixels.userId, ctx.user.id))
        .orderBy(desc(metaPixels.createdAt));
    }),

  deletePixel: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const [pixel] = await db
        .select()
        .from(metaPixels)
        .where(and(eq(metaPixels.id, input.id), eq(metaPixels.userId, ctx.user.id)))
        .limit(1);

      if (!pixel) throw new TRPCError({ code: "NOT_FOUND", message: "Pixel not found" });

      await db.delete(metaPixels).where(eq(metaPixels.id, input.id));
      return { success: true };
    }),

  testPixel: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const [pixel] = await db
        .select()
        .from(metaPixels)
        .where(and(eq(metaPixels.id, input.id), eq(metaPixels.userId, ctx.user.id)))
        .limit(1);

      if (!pixel) throw new TRPCError({ code: "NOT_FOUND", message: "Pixel not found" });

      const result = await testMetaCapiConnection({
        pixelId: pixel.pixelId,
        accessToken: pixel.accessToken,
        testEventCode: pixel.testEventCode ?? undefined,
      });

      return result;
    }),

  // ─── Event sending ───────────────────────────────────────────────────────────

  sendPageView: protectedProcedure
    .input(z.object({
      pixelDbId: z.number(),
      url: z.string().url(),
      userData: userDataSchema,
      eventId: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const config = await getPixelConfig(input.pixelDbId, ctx.user.id);
      const event = pageViewEvent({ url: input.url, userData: input.userData, eventId: input.eventId });
      const result = await sendMetaEvent(event, config);
      await logEvent(input.pixelDbId, ctx.user.id, "PageView", input.url, result.eventsReceived > 0);
      return result;
    }),

  sendLead: protectedProcedure
    .input(z.object({
      pixelDbId: z.number(),
      url: z.string().url(),
      userData: userDataSchema,
      contentName: z.string().optional(),
      value: z.number().optional(),
      currency: z.string().optional(),
      eventId: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const config = await getPixelConfig(input.pixelDbId, ctx.user.id);
      const event = leadEvent({
        url: input.url,
        userData: input.userData,
        contentName: input.contentName,
        value: input.value,
        currency: input.currency,
        eventId: input.eventId,
      });
      const result = await sendMetaEvent(event, config);
      await logEvent(input.pixelDbId, ctx.user.id, "Lead", input.url, result.eventsReceived > 0);
      return result;
    }),

  sendPurchase: protectedProcedure
    .input(z.object({
      pixelDbId: z.number(),
      url: z.string().url(),
      value: z.number(),
      currency: z.string().optional(),
      orderId: z.string().optional(),
      userData: userDataSchema,
      eventId: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const config = await getPixelConfig(input.pixelDbId, ctx.user.id);
      const event = purchaseEvent({
        url: input.url,
        value: input.value,
        currency: input.currency,
        orderId: input.orderId,
        userData: input.userData,
        eventId: input.eventId,
      });
      const result = await sendMetaEvent(event, config);
      await logEvent(input.pixelDbId, ctx.user.id, "Purchase", input.url, result.eventsReceived > 0);
      return result;
    }),

  sendCustomEvent: protectedProcedure
    .input(z.object({
      pixelDbId: z.number(),
      eventName: z.string().min(1).max(64),
      url: z.string().url(),
      userData: userDataSchema,
      customData: customDataSchema,
      eventId: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const config = await getPixelConfig(input.pixelDbId, ctx.user.id);
      const event: MetaEvent = {
        eventName: input.eventName,
        eventSourceUrl: input.url,
        userData: input.userData,
        customData: input.customData,
        eventId: input.eventId,
        actionSource: "website",
      };
      const result = await sendMetaEvent(event, config);
      await logEvent(input.pixelDbId, ctx.user.id, input.eventName, input.url, result.eventsReceived > 0);
      return result;
    }),

  // ─── Event log ───────────────────────────────────────────────────────────────

  getEventLog: protectedProcedure
    .input(z.object({
      pixelDbId: z.number(),
      limit: z.number().min(1).max(100).default(50),
    }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) return [];

      // Verify ownership
      await getPixelConfig(input.pixelDbId, ctx.user.id);

      return db
        .select()
        .from(metaEvents)
        .where(eq(metaEvents.pixelId, input.pixelDbId))
        .orderBy(desc(metaEvents.createdAt))
        .limit(input.limit);
    }),

  getStats: protectedProcedure
    .input(z.object({ pixelDbId: z.number() }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) return null;

      await getPixelConfig(input.pixelDbId, ctx.user.id);

      const events = await db
        .select()
        .from(metaEvents)
        .where(eq(metaEvents.pixelId, input.pixelDbId))
        .orderBy(desc(metaEvents.createdAt))
        .limit(500);

      const total = events.length;
      const successful = events.filter((e) => e.success).length;
      const byType: Record<string, number> = {};

      for (const e of events) {
        byType[e.eventName] = (byType[e.eventName] ?? 0) + 1;
      }

      return { total, successful, failed: total - successful, byType };
    }),
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getPixelConfig(pixelDbId: number, userId: number): Promise<MetaCapiConfig> {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

  const [pixel] = await db
    .select()
    .from(metaPixels)
    .where(and(eq(metaPixels.id, pixelDbId), eq(metaPixels.userId, userId)))
    .limit(1);

  if (!pixel) throw new TRPCError({ code: "NOT_FOUND", message: "Pixel not found or access denied" });
  if (!pixel.isActive) throw new TRPCError({ code: "FORBIDDEN", message: "Pixel is deactivated" });

  return {
    pixelId: pixel.pixelId,
    accessToken: pixel.accessToken,
    testEventCode: pixel.testEventCode ?? undefined,
  };
}

async function logEvent(
  pixelDbId: number,
  userId: number,
  eventName: string,
  url: string,
  success: boolean
): Promise<void> {
  try {
    const db = await getDb();
    if (!db) return;
    await db.insert(metaEvents).values({
      pixelId: pixelDbId,
      userId,
      eventName,
      sourceUrl: url,
      success,
    });
  } catch {
    // Non-critical — don't throw
  }
}
