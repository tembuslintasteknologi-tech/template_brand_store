import { z } from 'zod';
import { db } from '../../db/index.js';
import { banners } from '../../db/schema.js';
import { and, asc, eq } from 'drizzle-orm';
import { recordAdminAction } from '../admin/auditLog.js';

export class ContentError extends Error {
  readonly status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = 'ContentError';
    this.status = status;
  }
}

export const bannerSchema = z.object({
  title: z.string().min(1).max(150),
  imageUrl: z.string().url(),
  linkUrl: z.string().url().optional().or(z.literal('')),
  placement: z.string().min(1).max(50).optional(),
  sortOrder: z.number().int().min(0).max(9999).optional(),
  isActive: z.boolean().optional(),
  startAt: z.string().datetime().optional().or(z.literal('')),
  endAt: z.string().datetime().optional().or(z.literal('')),
});

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

export async function listPublicBanners(placement?: string, now: Date = new Date()) {
  const rows = placement
    ? await db.select().from(banners).where(eq(banners.placement, placement)).orderBy(asc(banners.sortOrder))
    : await db.select().from(banners).orderBy(asc(banners.sortOrder));

  return sortBanners(rows.filter((row) => isBannerLive(row, now)));
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
