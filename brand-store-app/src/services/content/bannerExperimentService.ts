/**
 * Banner A/B testing (CMS-005).
 *
 * A banner keeps its own creative as the control. Variants are alternate creatives, and the
 * experiment row only decides whether assignment is running and how much evidence is needed
 * before a winner may be applied.
 *
 * Assignment is deterministic: the same session gets the same variant for the same banner for
 * the whole campaign, so a visitor does not see the hero flip between two images on every
 * navigation. It is derived from a hash of `sessionId + bannerId`, never from random, so no
 * assignment table is needed and a restart does not reshuffle traffic.
 *
 * The pure functions are separated from the database helpers for the same reason as the pricing
 * engine: the math can be tested without Postgres.
 */

import { z } from 'zod';
import { and, asc, eq, gte, inArray, lte } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { bannerEvents, bannerExperiments, bannerVariants, banners } from '../../db/schema.js';
import { ContentError, computeBannerMetrics, isBannerLive, type BannerMetrics } from './bannerService.js';
import { recordAdminAction } from '../admin/auditLog.js';

export const EXPERIMENT_STATUSES = ['draft', 'running', 'stopped'] as const;
export type ExperimentStatus = (typeof EXPERIMENT_STATUSES)[number];

export interface BannerVariantLike {
  id: string;
  name?: string | null;
  weight?: number | null;
  isActive?: boolean | null;
  isControl?: boolean | null;
}

/**
 * FNV-1a, 32 bit. Small, dependency free, and stable across runs. Cryptographic quality is not
 * required: the input is a session id and the output only chooses a creative.
 */
export function hashAssignment(seed: string): number {
  let hash = 0x811c9dc5;
  const text = String(seed ?? '');
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function variantPool<T extends BannerVariantLike>(variants: T[]): T[] {
  return (variants ?? []).filter(
    (variant) => variant.isActive !== false && Number(variant.weight ?? 0) > 0
  );
}

/**
 * Weighted, deterministic assignment. Returns null when nothing is eligible, which lets the
 * caller fall back to the banner's own creative instead of showing an empty slot.
 */
export function assignBannerVariant<T extends BannerVariantLike>(
  variants: T[],
  seed: string
): T | null {
  const pool = variantPool(variants);
  if (pool.length === 0) return null;

  const totalWeight = pool.reduce((sum, variant) => sum + Number(variant.weight ?? 0), 0);
  if (totalWeight <= 0) return null;

  const bucket = hashAssignment(seed) % totalWeight;
  let cursor = 0;
  for (const variant of pool) {
    cursor += Number(variant.weight ?? 0);
    if (bucket < cursor) return variant;
  }

  return pool[pool.length - 1];
}

/**
 * A guest without a session id cannot be bucketed consistently, so the control creative is the
 * only honest answer. Falling back to a random variant would corrupt the experiment counts.
 */
export function pickControlVariant<T extends BannerVariantLike>(variants: T[]): T | null {
  const pool = (variants ?? []).filter((variant) => variant.isActive !== false);
  if (pool.length === 0) return null;
  return pool.find((variant) => variant.isControl === true) ?? pool[0];
}

export function resolveVariantForSession<T extends BannerVariantLike>(
  variants: T[],
  sessionId: string | null | undefined
): T | null {
  const seed = String(sessionId ?? '').trim();
  if (seed.length === 0) return pickControlVariant(variants);
  return assignBannerVariant(variants, seed) ?? pickControlVariant(variants);
}

export interface VariantMetricsRow extends BannerMetrics {
  variantId: string;
  name: string;
  isControl: boolean;
  weight: number;
}

/** Splits events per variant. Events without a variant are ignored here on purpose. */
export function computeVariantMetrics(
  variants: BannerVariantLike[],
  events: Array<{ variantId?: string | null; eventType: string }>
): VariantMetricsRow[] {
  return (variants ?? []).map((variant) => {
    const bucket = (events ?? []).filter((event) => event.variantId === variant.id);
    return {
      variantId: variant.id,
      name: String(variant.name ?? variant.id),
      isControl: variant.isControl === true,
      weight: Number(variant.weight ?? 0),
      ...computeBannerMetrics(bucket),
    };
  });
}

export interface WinnerDecision {
  variantId: string | null;
  reason: 'NO_VARIANTS' | 'NOT_ENOUGH_DATA' | 'WINNER';
  minViews: number;
  evaluated: number;
}

/**
 * A winner needs at least two variants that each collected `minViews` impressions. CTR decides,
 * clicks break the tie, then the variant id, so re-running the report never flips the result.
 */
export function pickWinningVariant(metrics: VariantMetricsRow[], minViews = 100): WinnerDecision {
  const threshold = Math.max(1, Math.floor(Number(minViews) || 1));
  const eligible = (metrics ?? []).filter((row) => row.views >= threshold);

  if ((metrics ?? []).length === 0) {
    return { variantId: null, reason: 'NO_VARIANTS', minViews: threshold, evaluated: 0 };
  }
  if (eligible.length < 2) {
    return {
      variantId: null,
      reason: 'NOT_ENOUGH_DATA',
      minViews: threshold,
      evaluated: eligible.length,
    };
  }

  const ranked = [...eligible].sort((a, b) => {
    if (b.ctr !== a.ctr) return b.ctr - a.ctr;
    if (b.clicks !== a.clicks) return b.clicks - a.clicks;
    if (b.views !== a.views) return b.views - a.views;
    return String(a.variantId).localeCompare(String(b.variantId));
  });

  return {
    variantId: ranked[0].variantId,
    reason: 'WINNER',
    minViews: threshold,
    evaluated: eligible.length,
  };
}

export const bannerVariantSchema = z.object({
  name: z.string().min(1).max(80),
  imageUrl: z.string().url(),
  linkUrl: z.string().url().optional().or(z.literal('')),
  weight: z.number().int().min(1).max(1000).optional(),
  isControl: z.boolean().optional(),
  isActive: z.boolean().optional(),
});

export const bannerExperimentSchema = z.object({
  status: z.enum(EXPERIMENT_STATUSES).optional(),
  minViews: z.number().int().min(1).max(1000000).optional(),
  winnerVariantId: z.string().uuid().nullable().optional(),
});

function fail(message: string, status = 400): never {
  throw new ContentError(message, status);
}

async function requireBanner(bannerId: string) {
  const [banner] = await db.select().from(banners).where(eq(banners.id, bannerId as any)).limit(1);
  if (!banner) fail(`Banner tidak ditemukan: ${bannerId}`, 404);
  return banner;
}

export async function listBannerVariants(bannerId: string) {
  await requireBanner(bannerId);
  return db
    .select()
    .from(bannerVariants)
    .where(eq(bannerVariants.bannerId, bannerId as any))
    .orderBy(asc(bannerVariants.createdAt));
}

export async function createBannerVariant(actorId: string, bannerId: string, input: unknown) {
  await requireBanner(bannerId);

  const parsed = bannerVariantSchema.safeParse(input);
  if (!parsed.success) {
    fail(`Varian tidak valid: ${parsed.error.issues.map((issue) => issue.message).join('; ')}`);
  }
  const data = parsed.data;

  if (data.isControl) {
    // Only one control per banner. Demoting the old one keeps the fallback unambiguous.
    await db
      .update(bannerVariants)
      .set({ isControl: false, updatedAt: new Date() } as any)
      .where(eq(bannerVariants.bannerId, bannerId as any));
  }

  const [row] = await db
    .insert(bannerVariants)
    .values({
      bannerId,
      name: data.name,
      imageUrl: data.imageUrl,
      linkUrl: data.linkUrl ? data.linkUrl : null,
      weight: data.weight ?? 50,
      isControl: data.isControl ?? false,
      isActive: data.isActive ?? true,
    } as any)
    .returning();

  await recordAdminAction({
    actorId,
    action: 'banner.variant.create',
    targetType: 'banner',
    targetId: bannerId,
    metadata: { variantId: row.id, name: row.name, isControl: row.isControl },
  });

  return row;
}

export async function updateBannerVariant(actorId: string, bannerId: string, variantId: string, input: unknown) {
  const parsed = bannerVariantSchema.partial().safeParse(input);
  if (!parsed.success) {
    fail(`Varian tidak valid: ${parsed.error.issues.map((issue) => issue.message).join('; ')}`);
  }

  const [existing] = await db
    .select()
    .from(bannerVariants)
    .where(and(eq(bannerVariants.id, variantId as any), eq(bannerVariants.bannerId, bannerId as any)))
    .limit(1);

  if (!existing) fail(`Varian tidak ditemukan: ${variantId}`, 404);

  if (parsed.data.isControl === true) {
    await db
      .update(bannerVariants)
      .set({ isControl: false, updatedAt: new Date() } as any)
      .where(eq(bannerVariants.bannerId, bannerId as any));
  }

  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (parsed.data.name !== undefined) patch.name = parsed.data.name;
  if (parsed.data.imageUrl !== undefined) patch.imageUrl = parsed.data.imageUrl;
  if (parsed.data.linkUrl !== undefined) patch.linkUrl = parsed.data.linkUrl || null;
  if (parsed.data.weight !== undefined) patch.weight = parsed.data.weight;
  if (parsed.data.isControl !== undefined) patch.isControl = parsed.data.isControl;
  if (parsed.data.isActive !== undefined) patch.isActive = parsed.data.isActive;

  const [row] = await db
    .update(bannerVariants)
    .set(patch as any)
    .where(eq(bannerVariants.id, variantId as any))
    .returning();

  await recordAdminAction({
    actorId,
    action: 'banner.variant.update',
    targetType: 'banner',
    targetId: bannerId,
    metadata: { variantId, changed: Object.keys(patch).filter((key) => key !== 'updatedAt') },
  });

  return row;
}

export async function deleteBannerVariant(actorId: string, bannerId: string, variantId: string) {
  const [existing] = await db
    .select()
    .from(bannerVariants)
    .where(and(eq(bannerVariants.id, variantId as any), eq(bannerVariants.bannerId, bannerId as any)))
    .limit(1);

  if (!existing) fail(`Varian tidak ditemukan: ${variantId}`, 404);

  await db.delete(bannerVariants).where(eq(bannerVariants.id, variantId as any));

  await recordAdminAction({
    actorId,
    action: 'banner.variant.delete',
    targetType: 'banner',
    targetId: bannerId,
    metadata: { variantId, name: existing.name },
  });

  return { id: variantId, bannerId, deleted: true };
}

export async function getBannerExperiment(bannerId: string) {
  await requireBanner(bannerId);
  const [row] = await db
    .select()
    .from(bannerExperiments)
    .where(eq(bannerExperiments.bannerId, bannerId as any))
    .limit(1);
  return row ?? null;
}

/**
 * Creates or updates the experiment row. Starting twice keeps the original `startedAt`, so the
 * report window does not silently reset when an admin toggles the status back on.
 */
export async function setBannerExperiment(actorId: string, bannerId: string, input: unknown) {
  await requireBanner(bannerId);

  const parsed = bannerExperimentSchema.safeParse(input);
  if (!parsed.success) {
    fail(`Eksperimen tidak valid: ${parsed.error.issues.map((issue) => issue.message).join('; ')}`);
  }
  const data = parsed.data;
  const now = new Date();

  const [existing] = await db
    .select()
    .from(bannerExperiments)
    .where(eq(bannerExperiments.bannerId, bannerId as any))
    .limit(1);

  let row: Record<string, any>;
  if (!existing) {
    [row] = await db
      .insert(bannerExperiments)
      .values({
        bannerId,
        status: data.status ?? 'draft',
        minViews: data.minViews ?? 100,
        winnerVariantId: data.winnerVariantId ?? null,
        startedAt: (data.status ?? 'draft') === 'running' ? now : null,
      } as any)
      .returning();
  } else {
    const patch: Record<string, unknown> = { updatedAt: now };
    if (data.status !== undefined) {
      patch.status = data.status;
      if (data.status === 'running' && !existing.startedAt) patch.startedAt = now;
      if (data.status === 'stopped') patch.endedAt = existing.endedAt ?? now;
    }
    if (data.minViews !== undefined) patch.minViews = data.minViews;
    if (data.winnerVariantId !== undefined) patch.winnerVariantId = data.winnerVariantId;

    [row] = await db
      .update(bannerExperiments)
      .set(patch as any)
      .where(eq(bannerExperiments.id, existing.id as any))
      .returning();
  }

  await recordAdminAction({
    actorId,
    action: 'banner.experiment.update',
    targetType: 'banner',
    targetId: bannerId,
    metadata: { status: row.status, minViews: row.minViews },
  });

  return row;
}

export interface ExperimentReport {
  bannerId: string;
  experiment: Record<string, any> | null;
  variants: VariantMetricsRow[];
  decision: WinnerDecision;
  metrics: {
    totalViews: number;
    totalClicks: number;
    ctr: number;
  };
}

export async function getBannerExperimentReport(
  bannerId: string,
  window: { from?: Date; to?: Date } = {}
): Promise<ExperimentReport> {
  await requireBanner(bannerId);

  const experiment = await getBannerExperiment(bannerId);
  const variants = await listBannerVariants(bannerId);
  if (variants.length === 0) {
    return {
      bannerId,
      experiment: experiment ?? null,
      variants: [],
      decision: pickWinningVariant([], experiment?.minViews ?? 100),
      metrics: { totalViews: 0, totalClicks: 0, ctr: 0 },
    };
  }

  const end = window.to ?? new Date();
  const start = window.from ?? new Date(0);

  const events = await db
    .select({ variantId: bannerEvents.variantId, eventType: bannerEvents.eventType })
    .from(bannerEvents)
    .where(
      and(
        eq(bannerEvents.bannerId, bannerId as any),
        gte(bannerEvents.createdAt, start),
        lte(bannerEvents.createdAt, end)
      )
    );

  const metrics = computeVariantMetrics(variants as BannerVariantLike[], events);
  const totals = computeBannerMetrics(events as Array<{ eventType: string }>);

  return {
    bannerId,
    experiment: experiment ?? null,
    variants: metrics,
    decision: pickWinningVariant(metrics, experiment?.minViews ?? 100),
    metrics: { totalViews: totals.views, totalClicks: totals.clicks, ctr: totals.ctr },
  };
}

/**
 * Copies the winning creative into the banner itself and stops the experiment. The banner keeps
 * serving the winning image through the normal path, so no visitor depends on the variant table
 * after the campaign ends.
 */
export async function applyExperimentWinner(
  actorId: string,
  bannerId: string,
  variantId?: string | null,
  window: { from?: Date; to?: Date } = {}
) {
  await requireBanner(bannerId);
  const report = await getBannerExperimentReport(bannerId, window);

  const chosenId = String(variantId ?? report.decision.variantId ?? '').trim();
  if (!chosenId) {
    const reason =
      report.decision.reason === 'NOT_ENOUGH_DATA'
        ? `Belum cukup data, minimal ${report.decision.minViews} view per varian`
        : 'Tidak ada varian untuk dijadikan pemenang';
    fail(reason, 409);
  }

  const chosen = report.variants.find((row) => row.variantId === chosenId);
  if (!chosen) fail(`Varian bukan bagian dari banner ini: ${chosenId}`, 404);

  const [variant] = await db
    .select()
    .from(bannerVariants)
    .where(eq(bannerVariants.id, chosenId as any))
    .limit(1);

  if (!variant) fail(`Varian tidak ditemukan: ${chosenId}`, 404);

  const now = new Date();
  const [updatedBanner] = await db
    .update(banners)
    .set({ imageUrl: variant.imageUrl, linkUrl: variant.linkUrl, updatedAt: now } as any)
    .where(eq(banners.id, bannerId as any))
    .returning();

  const [experiment] = await db
    .update(bannerExperiments)
    .set({
      status: 'stopped',
      winnerVariantId: variant.id,
      endedAt: now,
      updatedAt: now,
    } as any)
    .where(eq(bannerExperiments.bannerId, bannerId as any))
    .returning();

  await recordAdminAction({
    actorId,
    action: 'banner.experiment.apply',
    targetType: 'banner',
    targetId: bannerId,
    metadata: { variantId: variant.id, name: variant.name, ctr: chosen.ctr },
  });

  return { banner: updatedBanner, experiment: experiment ?? null, winner: chosen };
}

export interface PublicVariantResult {
  bannerId: string;
  variant: Record<string, any> | null;
  fallback: boolean;
}

/**
 * Public resolver. Returns null at every step that is not safely servable: unknown banner,
 * inactive banner, experiment not running, or no eligible variant. The caller then shows the
 * banner itself, which is why a broken experiment can never blank the home page.
 */
export async function resolvePublicBannerVariant(
  bannerId: string,
  sessionId?: string | null
): Promise<PublicVariantResult> {
  const [banner] = await db.select().from(banners).where(eq(banners.id, bannerId as any)).limit(1);
  if (!banner || !isBannerLive(banner)) {
    return { bannerId, variant: null, fallback: true };
  }

  const [experiment] = await db
    .select()
    .from(bannerExperiments)
    .where(eq(bannerExperiments.bannerId, banner.id as any))
    .limit(1);

  if (!experiment || experiment.status !== 'running') {
    return { bannerId, variant: null, fallback: true };
  }

  const variants = await db
    .select()
    .from(bannerVariants)
    .where(and(eq(bannerVariants.bannerId, banner.id as any), eq(bannerVariants.isActive, true)));

  const chosen = resolveVariantForSession(variants as BannerVariantLike[], sessionId);
  return { bannerId, variant: (chosen as Record<string, any> | null) ?? null, fallback: chosen === null };
}

/** Convenience used by the admin report when a caller already has the variant ids. */
export async function listVariantEvents(bannerId: string, variantIds: string[]) {
  if (variantIds.length === 0) return [];
  return db
    .select()
    .from(bannerEvents)
    .where(
      and(
        eq(bannerEvents.bannerId, bannerId as any),
        inArray(bannerEvents.variantId, variantIds as any)
      )
    );
}
