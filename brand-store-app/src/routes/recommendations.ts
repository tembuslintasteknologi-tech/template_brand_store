/**
 * Public recommendation routes (Phase 4).
 *
 * Read-only and anonymous: a shelf is shown to guests too, and nothing here is user specific. The
 * response carries `meta.basis` so the storefront can label the shelf honestly, for example
 * "sering dibeli bersama" only when co-purchase data actually drove the ranking.
 */

import { Hono } from 'hono';
import {
  RecommendationError,
  listRecommendations,
  listRelatedRecommendationsBySlug,
  listTrendingRecommendations,
} from '../services/recommendations/recommendationRepository.js';
import type { ScoredRecommendation } from '../services/recommendations/recommendationEngine.js';

const CACHE_CONTROL = 'public, max-age=300, stale-while-revalidate=600';

function present(items: ScoredRecommendation[]) {
  return items.map((item) => ({
    id: item.product.id,
    title: item.product.title,
    slug: item.product.slug,
    categoryId: item.product.categoryId ?? null,
    price: item.product.basePrice ?? null,
    stock: item.product.stock ?? null,
    strategy: item.strategy,
    score: item.score,
    signals: item.signals,
  }));
}

function fail(c: any, err: any) {
  if (err instanceof RecommendationError) {
    return c.json(
      { success: false, error: { code: 'RECOMMENDATION_ERROR', message: err.message } },
      err.status as any
    );
  }
  console.error('[recommendations]', err?.message);
  return c.json(
    {
      success: false,
      error: { code: 'RECOMMENDATION_FAILED', message: 'Gagal memuat rekomendasi' },
    },
    500
  );
}

function cache(c: any) {
  c.header('Cache-Control', CACHE_CONTROL);
  c.header('Vary', 'Accept-Encoding');
}

export const recommendationPublicRoutes = new Hono();

// GET /api/v1/recommendations?productIds=<uuid>,<uuid>&limit=8
recommendationPublicRoutes.get('/recommendations', async (c) => {
  try {
    const result = await listRecommendations({
      seedProductIds: c.req.queries('productIds'),
      limit: c.req.query('limit'),
    });

    cache(c);
    return c.json({
      success: true,
      data: present(result.items),
      meta: {
        basis: result.basis,
        limit: result.limit,
        seeds: result.seeds,
        count: result.items.length,
      },
    });
  } catch (err: any) {
    return fail(c, err);
  }
});

// GET /api/v1/recommendations/trending?limit=8
recommendationPublicRoutes.get('/recommendations/trending', async (c) => {
  try {
    const result = await listTrendingRecommendations(c.req.query('limit'));

    cache(c);
    return c.json({
      success: true,
      data: present(result.items),
      meta: {
        basis: result.basis,
        limit: result.limit,
        seeds: [],
        count: result.items.length,
      },
    });
  } catch (err: any) {
    return fail(c, err);
  }
});

// GET /api/v1/products/:slug/recommendations?limit=8
recommendationPublicRoutes.get('/products/:slug/recommendations', async (c) => {
  try {
    const result = await listRelatedRecommendationsBySlug(
      c.req.param('slug') as string,
      c.req.query('limit')
    );

    cache(c);
    return c.json({
      success: true,
      data: present(result.items),
      meta: {
        basis: result.basis,
        limit: result.limit,
        seeds: result.seeds,
        count: result.items.length,
        seedProduct: result.seedProduct,
      },
    });
  } catch (err: any) {
    return fail(c, err);
  }
});
