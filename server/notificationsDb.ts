/**
 * Notifications — Database Operations
 * Handles CRUD for the notifications table.
 * Notifications are created by:
 *   - auditEngine.ts  → type "audit"   (on run complete with findings)
 *   - routers.ts      → type "task"    (on task status change to failed/completed)
 *   - routers.ts      → type "agent"   (on agent status change)
 *   - system events   → type "system"  (manual / seeded)
 */
import { eq, desc, and, isNull, or, lte } from "drizzle-orm";
import { getDb } from "./db";
import { notifications, type InsertNotification, type Notification } from "../drizzle/schema";

// ─── Create ───────────────────────────────────────────────────────────────────

export async function createNotification(data: InsertNotification): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const [result] = await db.insert(notifications).values(data);
  return (result as any).insertId ?? 0;
}

// ─── Read ─────────────────────────────────────────────────────────────────────

/** List notifications for a user (includes broadcasts where userId IS NULL) */
export async function listNotifications(userId: number, limit = 30): Promise<Notification[]> {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(notifications)
    .where(or(eq(notifications.userId, userId), isNull(notifications.userId)))
    .orderBy(desc(notifications.createdAt))
    .limit(limit);
}

/** Count unread notifications for a user */
export async function countUnread(userId: number): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const rows = await db
    .select()
    .from(notifications)
    .where(
      and(
        or(eq(notifications.userId, userId), isNull(notifications.userId)),
        eq(notifications.isRead, false),
      ),
    );
  return rows.length;
}

// ─── Update ───────────────────────────────────────────────────────────────────

/** Mark a single notification as read */
export async function markRead(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(notifications).set({ isRead: true }).where(eq(notifications.id, id));
}

/** Mark all notifications as read for a user */
export async function markAllRead(userId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db
    .update(notifications)
    .set({ isRead: true })
    .where(or(eq(notifications.userId, userId), isNull(notifications.userId)));
}

// ─── Delete ───────────────────────────────────────────────────────────────────

/** Delete notifications older than N days (housekeeping) */
export async function pruneOldNotifications(olderThanDays = 30): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000);
  await db.delete(notifications).where(lte(notifications.createdAt, cutoff));
}
