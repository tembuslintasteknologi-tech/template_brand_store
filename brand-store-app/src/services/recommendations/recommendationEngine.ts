/**
 * Product recommendation engine (Phase 4, "AI recommendations").
 *
 * The PRD names the outcome but not a provider, so the engine reads the store's own paid order
 * history instead of calling an external model. Three signals are combined:
 * - co-purchase: how often a product appears in the same paid order as a seed product. This is
 *   the strongest signal because it reflects what buyers actually put in one basket.
 * - category affinity: the candidate sits in a category the seed products belong to.
 * - popularity: units sold across all paid orders, which doubles as the cold-start fallback.
 *
 * When no signal fires at all, the caller still receives published, in-stock products ordered
 * newest first, so a brand new store shows a useful shelf instead of an empty box.
 *
 * Everything here is pure and deterministic. No clock, no database, no network. Query work lives
 * in `recommendationRepository.ts`.
 */

export const RECOMMENDATION_STRATEGIES = [
  'co_purchase',
  'category',
  'popularity',
  'newest',
] as const;
export type RecommendationStrategy = (typeof RECOMMENDATION_STRATEGIES)[number];

export const DEFAULT_RECOMMENDATION_LIMIT = 8;
export const MAX_RECOMMENDATION_LIMIT = 20;
export const MAX_SEED_PRODUCTS = 10;

// Weights sum to 100 so a score is readable as a percentage of the strongest possible match.
const CO_PURCHASE_WEIGHT = 60;
const CATEGORY_WEIGHT = 20;
const POPULARITY_WEIGHT = 20;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface RecommendationCandidate {
  id: string;
  title: string;
  slug: string;
  categoryId?: string | null;
  basePrice?: number | string | null;
  stock?: number | null;
  createdAt?: Date | string | null;
}

export interface CoPurchaseSignal {
  productId: string;
  sharedOrders: number;
  units: number;
}

export interface PopularitySignal {
  productId: string;
  unitsSold: number;
}

export interface RecommendationInput {
  seeds: string[];
  /** Number of paid orders that contain at least one seed product. */
  seedOrders?: number;
  coPurchase?: CoPurchaseSignal[];
  seedCategoryIds?: string[];
  popularity?: PopularitySignal[];
  /** Already filtered to published products. Stock is checked again here. */
  candidates: RecommendationCandidate[];
}

export interface RecommendationSignals {
  coPurchase: number;
  category: number;
  popularity: number;
}

export interface ScoredRecommendation {
  product: RecommendationCandidate;
  strategy: RecommendationStrategy;
  score: number;
  signals: RecommendationSignals;
}

/** Bad input falls back to the default instead of throwing, because limit comes from a query string. */
export function clampRecommendationLimit(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_RECOMMENDATION_LIMIT;
  return Math.min(Math.floor(parsed), MAX_RECOMMENDATION_LIMIT);
}

/**
 * Accepts a comma separated string, a repeated query parameter, or an array. Non UUID values are
 * dropped rather than forwarded to Postgres, where a bad uuid literal aborts the whole query.
 */
export function normalizeSeedProductIds(value: unknown): string[] {
  const raw: unknown[] = Array.isArray(value) ? value : [value];
  const seen = new Set<string>();
  const seeds: string[] = [];

  for (const entry of raw) {
    if (typeof entry !== 'string') continue;
    for (const part of entry.split(',')) {
      const id = part.trim().toLowerCase();
      if (!UUID_PATTERN.test(id)) continue;
      if (seen.has(id)) continue;
      seen.add(id);
      seeds.push(id);
      if (seeds.length >= MAX_SEED_PRODUCTS) return seeds;
    }
  }

  return seeds;
}

function isAvailable(candidate: RecommendationCandidate): boolean {
  // A null stock means the product row does not track stock, so it is treated as available.
  if (candidate.stock === null || candidate.stock === undefined) return true;
  const stock = Number(candidate.stock);
  return Number.isFinite(stock) ? stock > 0 : true;
}

function dominantStrategy(signals: RecommendationSignals): RecommendationStrategy {
  if (signals.coPurchase > 0) return 'co_purchase';
  if (signals.category > 0) return 'category';
  if (signals.popularity > 0) return 'popularity';
  return 'newest';
}

/**
 * Ranks candidates against the signals. Co-purchase is normalized by the number of seed orders so
 * a product that shares one order out of two outranks a product that shares ten out of a hundred.
 */
export function rankRecommendations(
  input: RecommendationInput,
  limit: unknown = DEFAULT_RECOMMENDATION_LIMIT
): ScoredRecommendation[] {
  const maxResults = clampRecommendationLimit(limit);
  if (maxResults <= 0) return [];

  const seedSet = new Set(input.seeds.map((id) => id.toLowerCase()));
  const seedOrders = Math.max(Number(input.seedOrders ?? 0), 0);
  const seedCategories = new Set(
    (input.seedCategoryIds ?? []).filter(
      (id): id is string => typeof id === 'string' && id.length > 0
    )
  );

  const coPurchase = new Map<string, CoPurchaseSignal>();
  for (const signal of input.coPurchase ?? []) {
    if (!signal?.productId || seedSet.has(signal.productId.toLowerCase())) continue;
    const sharedOrders = Math.max(Number(signal.sharedOrders ?? 0), 0);
    const units = Math.max(Number(signal.units ?? 0), 0);
    if (sharedOrders <= 0) continue;
    const current = coPurchase.get(signal.productId);
    coPurchase.set(signal.productId, {
      productId: signal.productId,
      sharedOrders: (current?.sharedOrders ?? 0) + sharedOrders,
      units: (current?.units ?? 0) + units,
    });
  }

  const popularity = new Map<string, number>();
  for (const signal of input.popularity ?? []) {
    if (!signal?.productId) continue;
    const unitsSold = Math.max(Number(signal.unitsSold ?? 0), 0);
    if (unitsSold <= 0) continue;
    popularity.set(signal.productId, (popularity.get(signal.productId) ?? 0) + unitsSold);
  }

  const maxUnits = Math.max(0, ...popularity.values());
  const denominator = Math.max(seedOrders, 1);

  const scored: ScoredRecommendation[] = [];

  for (const candidate of input.candidates) {
    if (!candidate?.id) continue;
    if (seedSet.has(candidate.id.toLowerCase())) continue;
    if (!isAvailable(candidate)) continue;

    const shared = coPurchase.get(candidate.id);
    const unitsSold = popularity.get(candidate.id) ?? 0;

    const coPurchaseScore = shared
      ? Math.min(shared.sharedOrders / denominator, 1) * CO_PURCHASE_WEIGHT
      : 0;
    const categoryScore =
      candidate.categoryId && seedCategories.has(candidate.categoryId) ? CATEGORY_WEIGHT : 0;
    const popularityScore = maxUnits > 0 ? (unitsSold / maxUnits) * POPULARITY_WEIGHT : 0;

    // Rounded so the API does not leak floating point noise from the division.
    const signals: RecommendationSignals = {
      coPurchase: Number(coPurchaseScore.toFixed(4)),
      category: categoryScore,
      popularity: Number(popularityScore.toFixed(4)),
    };
    const score = Number((coPurchaseScore + categoryScore + popularityScore).toFixed(4));

    scored.push({
      product: candidate,
      strategy: dominantStrategy(signals),
      score,
      signals,
    });
  }

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const unitsA = popularity.get(a.product.id) ?? 0;
    const unitsB = popularity.get(b.product.id) ?? 0;
    if (unitsB !== unitsA) return unitsB - unitsA;
    // Cold-start shelves rely on this branch: with every score at zero the newest product wins.
    const createdA = a.product.createdAt ? new Date(a.product.createdAt).getTime() : 0;
    const createdB = b.product.createdAt ? new Date(b.product.createdAt).getTime() : 0;
    const timeA = Number.isFinite(createdA) ? createdA : 0;
    const timeB = Number.isFinite(createdB) ? createdB : 0;
    if (timeB !== timeA) return timeB - timeA;
    const titleA = a.product.title ?? '';
    const titleB = b.product.title ?? '';
    if (titleA !== titleB) return titleA.localeCompare(titleB);
    return a.product.id.localeCompare(b.product.id);
  });

  return scored.slice(0, maxResults);
}

/**
 * One label for the whole shelf. It reports the strongest signal actually used, not the signal the
 * caller hoped for, so the storefront never claims "sering dibeli bersama" on a popularity list.
 */
export function describeRecommendationBasis(items: ScoredRecommendation[]): RecommendationStrategy {
  return items[0]?.strategy ?? 'newest';
}
