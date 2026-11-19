/**
 * Recommendation repository (Phase 4, "AI recommendations").
 *
 * This is the only file that reads order history for recommendations. The ranking rules live in
 * `recommendationEngine.ts`, so they stay testable without a database.
 *
 * Candidate loading is deliberately bounded: co-purchase top 50, popularity top 60, seed category
 * top 40, newest 20. A template store never scans the whole catalog to fill one shelf, and the
 * union is deduplicated before the product rows are fetched.
 */

import { and, desc, eq, gt, inArray, notInArray, sql } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { orderItems, orders, products } from '../../db/schema.js';
import {
  clampRecommendationLimit,
  describeRecommendationBasis,
  normalizeSeedProductIds,
  rankRecommendations,
  type CoPurchaseSignal,
  type PopularitySignal,
  type RecommendationCandidate,
  type RecommendationStrategy,
  type ScoredRecommendation,
} from './recommendationEngine.js';

export const PAID_ORDER_STATUSES = [
  'paid',
  'processing',
  'shipped',
  'delivered',
  'completed',
] as const;

const CO_PURCHASE_LIMIT = 50;
const POPULARITY_LIMIT = 60;
const CATEGORY_LIMIT = 40;
const NEWEST_LIMIT = 20;

export class RecommendationError extends Error {
  readonly status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = 'RecommendationError';
    this.status = status;
  }
}

/** Postgres returns count() and sum() as strings, so every aggregate is converted once here. */
function toCount(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export interface RecommendationResult {
  items: ScoredRecommendation[];
  basis: RecommendationStrategy;
  seeds: string[];
  limit: number;
}

interface SeedRow {
  id: string;
  categoryId: string | null;
}

async function loadSeedProducts(seedIds: string[]): Promise<SeedRow[]> {
  if (seedIds.length === 0) return [];
  return db
    .select({ id: products.id, categoryId: products.categoryId })
    .from(products)
    .where(and(inArray(products.id, seedIds as any), eq(products.status, 'published')));
}

async function loadPaidOrderIdsForSeeds(seedIds: string[]): Promise<string[]> {
  if (seedIds.length === 0) return [];
  const rows = await db
    .selectDistinct({ orderId: orderItems.orderId })
    .from(orderItems)
    .innerJoin(orders, eq(orderItems.orderId, orders.id))
    .where(
      and(
        inArray(orderItems.productId, seedIds as any),
        inArray(orders.status, [...PAID_ORDER_STATUSES])
      )
    )
    .limit(500);
  return rows.map((row) => row.orderId);
}

async function loadCoPurchase(orderIds: string[], seedIds: string[]): Promise<CoPurchaseSignal[]> {
  if (orderIds.length === 0) return [];
  const rows = await db
    .select({
      productId: orderItems.productId,
      sharedOrders: sql<number>`count(distinct ${orderItems.orderId})`,
      units: sql<number>`coalesce(sum(${orderItems.quantity}), 0)`,
    })
    .from(orderItems)
    .where(
      and(
        inArray(orderItems.orderId, orderIds as any),
        // A seed product must never recommend itself.
        notInArray(orderItems.productId, seedIds as any)
      )
    )
    .groupBy(orderItems.productId)
    .orderBy(desc(sql`count(distinct ${orderItems.orderId})`))
    .limit(CO_PURCHASE_LIMIT);

  return rows.map((row) => ({
    productId: row.productId,
    sharedOrders: toCount(row.sharedOrders),
    units: toCount(row.units),
  }));
}

async function loadPopularity(): Promise<PopularitySignal[]> {
  const rows = await db
    .select({
      productId: orderItems.productId,
      unitsSold: sql<number>`coalesce(sum(${orderItems.quantity}), 0)`,
    })
    .from(orderItems)
    .innerJoin(orders, eq(orderItems.orderId, orders.id))
    .where(inArray(orders.status, [...PAID_ORDER_STATUSES]))
    .groupBy(orderItems.productId)
    .orderBy(desc(sql`coalesce(sum(${orderItems.quantity}), 0)`))
    .limit(POPULARITY_LIMIT);

  return rows.map((row) => ({
    productId: row.productId,
    unitsSold: toCount(row.unitsSold),
  }));
}

async function loadCategoryCandidateIds(categoryIds: string[]): Promise<string[]> {
  if (categoryIds.length === 0) return [];
  const rows = await db
    .select({ id: products.id })
    .from(products)
    .where(
      and(
        inArray(products.categoryId, categoryIds as any),
        eq(products.status, 'published'),
        gt(products.stock, 0)
      )
    )
    .orderBy(desc(products.createdAt))
    .limit(CATEGORY_LIMIT);
  return rows.map((row) => row.id);
}

async function loadNewestCandidateIds(): Promise<string[]> {
  const rows = await db
    .select({ id: products.id })
    .from(products)
    .where(and(eq(products.status, 'published'), gt(products.stock, 0)))
    .orderBy(desc(products.createdAt))
    .limit(NEWEST_LIMIT);
  return rows.map((row) => row.id);
}

async function loadCandidates(ids: string[]): Promise<RecommendationCandidate[]> {
  if (ids.length === 0) return [];
  return db
    .select({
      id: products.id,
      title: products.title,
      slug: products.slug,
      categoryId: products.categoryId,
      basePrice: products.basePrice,
      stock: products.stock,
      createdAt: products.createdAt,
    })
    .from(products)
    .where(and(inArray(products.id, ids as any), eq(products.status, 'published')));
}

function uniqueIds(ids: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const id of ids) {
    if (!id || seen.has(id)) continue;
    seen.add(id);
    result.push(id);
  }
  return result;
}

export interface RecommendationQuery {
  seedProductIds?: unknown;
  limit?: unknown;
}

export async function listRecommendations(
  query: RecommendationQuery = {}
): Promise<RecommendationResult> {
  const limit = clampRecommendationLimit(query.limit);
  const requestedSeeds = normalizeSeedProductIds(query.seedProductIds);

  if (requestedSeeds.length === 0) {
    return listTrendingRecommendations(limit);
  }

  const seedRows = await loadSeedProducts(requestedSeeds);
  const seeds = seedRows.map((row) => row.id);
  if (seeds.length === 0) {
    return listTrendingRecommendations(limit);
  }

  const seedCategoryIds = uniqueIds(seedRows.map((row) => row.categoryId));
  const orderIds = await loadPaidOrderIdsForSeeds(seeds);

  const [coPurchase, popularity, categoryIds, newestIds] = await Promise.all([
    loadCoPurchase(orderIds, seeds),
    loadPopularity(),
    loadCategoryCandidateIds(seedCategoryIds),
    loadNewestCandidateIds(),
  ]);

  const candidateIds = uniqueIds([
    ...coPurchase.map((signal) => signal.productId),
    ...popularity.map((signal) => signal.productId),
    ...categoryIds,
    ...newestIds,
  ]);

  const candidates = await loadCandidates(candidateIds);
  const items = rankRecommendations(
    {
      seeds,
      seedOrders: orderIds.length,
      coPurchase,
      seedCategoryIds,
      popularity,
      candidates,
    },
    limit
  );

  return {
    items,
    basis: describeRecommendationBasis(items),
    seeds,
    limit,
  };
}

export async function listTrendingRecommendations(
  limit: unknown = undefined
): Promise<RecommendationResult> {
  const maxResults = clampRecommendationLimit(limit);
  const [popularity, newestIds] = await Promise.all([loadPopularity(), loadNewestCandidateIds()]);

  const candidateIds = uniqueIds([...popularity.map((signal) => signal.productId), ...newestIds]);
  const candidates = await loadCandidates(candidateIds);
  const items = rankRecommendations({ seeds: [], popularity, candidates }, maxResults);

  return {
    items,
    basis: describeRecommendationBasis(items),
    seeds: [],
    limit: maxResults,
  };
}

export interface RelatedRecommendationResult extends RecommendationResult {
  seedProduct: { id: string; title: string; slug: string };
}

export async function listRelatedRecommendationsBySlug(
  slug: string,
  limit: unknown = undefined
): Promise<RelatedRecommendationResult> {
  const normalizedSlug = String(slug ?? '').trim();
  if (normalizedSlug.length === 0) {
    throw new RecommendationError('Slug produk wajib diisi');
  }

  const [seedProduct] = await db
    .select({ id: products.id, title: products.title, slug: products.slug })
    .from(products)
    .where(and(eq(products.slug, normalizedSlug), eq(products.status, 'published')))
    .limit(1);

  if (!seedProduct) {
    throw new RecommendationError(`Produk tidak ditemukan: ${normalizedSlug}`, 404);
  }

  const result = await listRecommendations({ seedProductIds: [seedProduct.id], limit });
  return { ...result, seedProduct };
}
