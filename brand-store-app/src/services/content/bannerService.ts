import { z } from 'zod';
import { db } from '../../db/index.js';
import { bannerEvents, banners } from '../../db/schema.js';
import { and, asc, eq, gte, lte } from 'drizzle-orm';
import { recordAdminAction } from '../admin/auditLog.js';

export class ContentError extends Error {
  readonly status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = 'ContentError';
    this.status = status;
  }
}

export const BANNER_AUDIENCES = ['all', 'guest', 'customer'] as const;
export type BannerAudience = (typeof BANNER_AUDIENCES)[number];
export const BANNER_EVENT_TYPES = ['view', 'click'] as const;
export type BannerEventType = (typeof BANNER_EVENT_TYPES)[number];

export const bannerSchema = z.object({
  title: z.string().min(1).max(150),
  imageUrl: z.string().url(),
  linkUrl: z.string().url().optional().or(z.literal('')),
  placement: z.string().min(1).max(50).optional(),
  audience: z.enum(BANNER_AUDIENCES).optional(),
  sortOrder: z.number().int().min(0).max(9999).optional(),
  isActive: z.boolean().optional(),
  startAt: z.string().datetime().optional().or(z.literal('')),
  endAt: z.string().datetime().optional().or(z.literal('')),
});

export const bannerEventSchema = z.object({
  type: z.enum(BANNER_EVENT_TYPES),
  sessionId: z.string().min(1).max(100).optional(),
});

function normalizeAudience(value: unknown): BannerAudience {
  const text = String(value ?? '').trim().toLowerCase();
  return (BANNER_AUDIENCES as readonly string[]).includes(text) ? (text as BannerAudience) : 'all';
}

/** A signed-in visitor is a customer; an anonymous one is a guest. No guessing from headers. */
export function resolveViewerAudience(hasUser: boolean): 'guest' | 'customer' {
  return hasUser ? 'customer' : 'guest';
}

/**
 * `all` is visible to anyone. A segment banner is visible only to that exact segment, so a
 * guest is never shown a customer-only banner and vice versa.
 */
export function isBannerVisibleToAudience(
  banner: { audience?: string | null },
  audience: 'guest' | 'customer'
): boolean {
  const target = normalizeAudience(banner?.audience);
  return target === 'all' || target === audience;
}

export interface BannerMetrics {
  views: number;
  clicks: number;
  ctr: number;
}

/** CTR is clicks / views as a percentage with two decimals, and 0 when nothing was viewed. */
export function computeBannerMetrics(events: Array<{ eventType: string }>): BannerMetrics {
  let views = 0;
  let clicks = 0;
  for (const event of events ?? []) {
    if (event.eventType === 'view') views += 1;
    else if (event.eventType === 'click') clicks += 1;
  }
  const ctr = views === 0 ? 0 : Math.round((clicks / views) * 10000) / 100;
  return { views, clicks, ctr };
}

/**
 * Groups raw events per banner id. Banners with zero events are not invented here; the caller
 * joins against the banner list so a never-seen banner still appears with zeros.
 */
export function aggregateBannerMetrics(
  events: Array<{ bannerId: string; eventType: string }>
): Map<string, BannerMetrics> {
  const grouped = new Map<string, Array<{ eventType: string }>>();
  for (const event of events ?? []) {
    const bucket = grouped.get(event.bannerId);
    if (bucket) bucket.push(event);
    else grouped.set(event.bannerId, [event]);
  }
  const result = new Map<string, BannerMetrics>();
  for (const [bannerId, bucket] of grouped) {
    result.set(bannerId, computeBannerMetrics(bucket));
  }
  return result;
}

type BannerWindow = {
  isActive?: boolean | null;
  startAt?: Date | string | null;
  endAt?: Date | string | null;
};

function toTime(value: Date | string | null | undefined): number | null {
  if (!value) return null;
  const time = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isNaN(time) ? null : time;
}

export function isBannerLive(banner: BannerWindow, now: Date = new Date()): boolean {
  if (banner.isActive === false) return false;
  const nowTime = now.getTime();
  const start = toTime(banner.startAt);
  const end = toTime(banner.endAt);
  if (start !== null && start > nowTime) return false;
  if (end !== null && end < nowTime) return false;
  return true;
}

export function sortBanners<T extends { sortOrder?: number | null; createdAt?: Date | string | null }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    const orderDiff = Number(a.sortOrder ?? 0) - Number(b.sortOrder ?? 0);
    if (orderDiff !== 0) return orderDiff;
    return String(a.createdAt ?? '').localeCompare(String(b.createdAt ?? ''));
  });
}

export async function listPublicBanners(
  placement?: string,
  now: Date = new Date(),
  audience: 'guest' | 'customer' = 'guest'
) {
  const rows = placement
    ? await db.select().from(banners).where(eq(banners.placement, placement)).orderBy(asc(banners.sortOrder))
    : await db.select().from(banners).orderBy(asc(banners.sortOrder));

  return sortBanners(
    rows.filter((row) => isBannerLive(row, now) && isBannerVisibleToAudience(row, audience))
  );
}

export async function listAllBanners() {
  return db.select().from(banners).orderBy(asc(banners.sortOrder));
}

export async function createBanner(actorId: string, input: unknown) {
  const parsed = bannerSchema.safeParse(input);
  if (!parsed.success) {
    throw new ContentError(`Banner tidak valid: ${parsed.error.issues.map((issue) => issue.message).join('; ')}`);
  }
  const data = parsed.data;

  const [row] = await db
    .insert(banners)
    .values({
      title: data.title,
      imageUrl: data.imageUrl,
      linkUrl: data.linkUrl ? data.linkUrl : null,
      placement: data.placement ?? 'home_hero',
      audience: data.audience ?? 'all',
      sortOrder: data.sortOrder ?? 0,
      isActive: data.isActive ?? true,
      startAt: data.startAt ? new Date(data.startAt) : null,
      endAt: data.endAt ? new Date(data.endAt) : null,
    })
    .returning();

  await recordAdminAction({
    actorId,
    action: 'banner.create',
    targetType: 'banner',
    targetId: row.id,
    metadata: { title: row.title, placement: row.placement },
  });

  return row;
}

export async function updateBanner(actorId: string, id: string, input: unknown) {
  const parsed = bannerSchema.partial().safeParse(input);
  if (!parsed.success) {
    throw new ContentError(`Banner tidak valid: ${parsed.error.issues.map((issue) => issue.message).join('; ')}`);
  }

  const [existing] = await db.select().from(banners).where(eq(banners.id, id as any)).limit(1);
  if (!existing) {
    throw new ContentError(`Banner tidak ditemukan: ${id}`, 404);
  }

  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (parsed.data.title !== undefined) patch.title = parsed.data.title;
  if (parsed.data.imageUrl !== undefined) patch.imageUrl = parsed.data.imageUrl;
  if (parsed.data.linkUrl !== undefined) patch.linkUrl = parsed.data.linkUrl || null;
  if (parsed.data.placement !== undefined) patch.placement = parsed.data.placement;
  if (parsed.data.audience !== undefined) patch.audience = parsed.data.audience;
  if (parsed.data.sortOrder !== undefined) patch.sortOrder = parsed.data.sortOrder;
  if (parsed.data.isActive !== undefined) patch.isActive = parsed.data.isActive;
  if (parsed.data.startAt !== undefined) patch.startAt = parsed.data.startAt ? new Date(parsed.data.startAt) : null;
  if (parsed.data.endAt !== undefined) patch.endAt = parsed.data.endAt ? new Date(parsed.data.endAt) : null;

  const [row] = await db.update(banners).set(patch as any).where(eq(banners.id, id as any)).returning();

  await recordAdminAction({
    actorId,
    action: 'banner.update',
    targetType: 'banner',
    targetId: row.id,
    metadata: { changed: Object.keys(patch).filter((key) => key !== 'updatedAt') },
  });

  return row;
}

export async function deleteBanner(actorId: string, id: string) {
  const [existing] = await db.select().from(banners).where(eq(banners.id, id as any)).limit(1);
  if (!existing) {
    throw new ContentError(`Banner tidak ditemukan: ${id}`, 404);
  }

  await db.delete(banners).where(eq(banners.id, id as any));
  await recordAdminAction({
    actorId,
    action: 'banner.delete',
    targetType: 'banner',
    targetId: id,
    metadata: { title: existing.title },
  });

  return { id, deleted: true };
}

export async function findActiveBanner(id: string) {
  const [row] = await db
    .select()
    .from(banners)
    .where(and(eq(banners.id, id as any), eq(banners.isActive, true)))
    .limit(1);
  return row ?? null;
}

/**
 * Appends one impression or click. The banner must exist and be active, otherwise the event
 * would inflate a campaign that is not on screen.
 */
export async function recordBannerEvent(
  bannerId: string,
  input: unknown,
  viewer: { userId?: string | null; audience: 'guest' | 'customer' }
) {
  const parsed = bannerEventSchema.safeParse(input);
  if (!parsed.success) {
    throw new ContentError(
      `Event banner tidak valid: ${parsed.error.issues.map((issue) => issue.message).join('; ')}`
    );
  }

  const banner = await findActiveBanner(bannerId);
  if (!banner) {
    throw new ContentError(`Banner tidak ditemukan: ${bannerId}`, 404);
  }

  const [row] = await db
    .insert(bannerEvents)
    .values({
      bannerId: banner.id,
      eventType: parsed.data.type,
      audience: viewer.audience,
      sessionId: parsed.data.sessionId ?? null,
      userId: viewer.userId ?? null,
    })
    .returning();

  return { id: row.id, bannerId: row.bannerId, type: row.eventType, createdAt: row.createdAt };
}

export interface BannerAnalyticsRow extends BannerMetrics {
  bannerId: string;
  title: string;
  placement: string;
  audience: string;
  isActive: boolean;
}

/**
 * Per-banner views, clicks and CTR for a time window. Every banner is returned, including the
 * ones with zero events, so a campaign with no traffic is visible instead of missing.
 */
export async function getBannerAnalytics(
  from?: Date,
  to?: Date
): Promise<{ from: string; to: string; banners: BannerAnalyticsRow[]; totals: BannerMetrics }> {
  const end = to ?? new Date();
  const start = from ?? new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);

  const events = await db
    .select()
    .from(bannerEvents)
    .where(and(gte(bannerEvents.createdAt, start), lte(bannerEvents.createdAt, end)));

  const byBanner = aggregateBannerMetrics(events as Array<{ bannerId: string; eventType: string }>);
  const rows = await listAllBanners();

  const bannersOut: BannerAnalyticsRow[] = rows.map((row) => {
    const metrics = byBanner.get(row.id) ?? { views: 0, clicks: 0, ctr: 0 };
    return {
      bannerId: row.id,
      title: row.title,
      placement: row.placement,
      audience: row.audience,
      isActive: row.isActive,
      ...metrics,
    };
  });

  return {
    from: start.toISOString(),
    to: end.toISOString(),
    banners: bannersOut,
    totals: computeBannerMetrics(events as Array<{ eventType: string }>),
  };
}
