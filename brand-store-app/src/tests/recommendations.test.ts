import test from 'node:test';
import assert from 'node:assert';
import {
  DEFAULT_RECOMMENDATION_LIMIT,
  MAX_RECOMMENDATION_LIMIT,
  clampRecommendationLimit,
  describeRecommendationBasis,
  normalizeSeedProductIds,
  rankRecommendations,
  type RecommendationCandidate,
} from '../services/recommendations/recommendationEngine.js';
import { recommendationPublicRoutes } from '../routes/recommendations.js';

const SEED = '11111111-1111-4111-8111-111111111111';
const SEED_TWO = '22222222-2222-4222-8222-222222222222';
const CANDIDATE_A = '33333333-3333-4333-8333-333333333333';
const CANDIDATE_B = '44444444-4444-4444-8444-444444444444';
const CANDIDATE_C = '55555555-5555-4555-8555-555555555555';
const CANDIDATE_D = '66666666-6666-4666-8666-666666666666';
const UNKNOWN = 'not-a-uuid';

function candidate(
  overrides: Partial<RecommendationCandidate> & { id: string }
): RecommendationCandidate {
  return {
    title: `Produk ${overrides.id.slice(0, 4)}`,
    slug: `produk-${overrides.id.slice(0, 4)}`,
    categoryId: null,
    basePrice: '10000.00',
    stock: 10,
    createdAt: '2026-11-01T00:00:00.000Z',
    ...overrides,
  };
}

test('clampRecommendationLimit memakai default untuk nilai rusak dan membatasi di langit-langit', () => {
  assert.strictEqual(clampRecommendationLimit(undefined), DEFAULT_RECOMMENDATION_LIMIT);
  assert.strictEqual(clampRecommendationLimit(''), DEFAULT_RECOMMENDATION_LIMIT);
  assert.strictEqual(clampRecommendationLimit('abc'), DEFAULT_RECOMMENDATION_LIMIT);
  assert.strictEqual(clampRecommendationLimit(0), DEFAULT_RECOMMENDATION_LIMIT);
  assert.strictEqual(clampRecommendationLimit(-3), DEFAULT_RECOMMENDATION_LIMIT);
  assert.strictEqual(clampRecommendationLimit('5'), 5);
  assert.strictEqual(clampRecommendationLimit('2.9'), 2);
  assert.strictEqual(clampRecommendationLimit('999'), MAX_RECOMMENDATION_LIMIT);
});

test('normalizeSeedProductIds menerima koma, array, membuang non UUID, dan membatasi sepuluh', () => {
  assert.deepStrictEqual(normalizeSeedProductIds(`${SEED}, ${SEED_TWO}`), [SEED, SEED_TWO]);
  assert.deepStrictEqual(normalizeSeedProductIds([SEED, SEED]), [SEED]);
  assert.deepStrictEqual(normalizeSeedProductIds([SEED, UNKNOWN, '', null]), [SEED]);
  assert.deepStrictEqual(normalizeSeedProductIds(SEED.toUpperCase()), [SEED]);

  const many = Array.from(
    { length: 14 },
    (_, index) => `${String(index).padStart(8, '0')}-0000-4000-8000-000000000000`
  );
  assert.strictEqual(normalizeSeedProductIds(many.join(',')).length, 10);
});

test('rankRecommendations membuang seed, stok kosong, dan produk tanpa id', () => {
  const items = rankRecommendations({
    seeds: [SEED],
    seedOrders: 4,
    coPurchase: [
      { productId: SEED, sharedOrders: 4, units: 4 },
      { productId: CANDIDATE_A, sharedOrders: 2, units: 2 },
    ],
    candidates: [
      candidate({ id: SEED, stock: 50 }),
      candidate({ id: CANDIDATE_A }),
      candidate({ id: CANDIDATE_B, stock: 0 }),
      candidate({ id: CANDIDATE_C, stock: -2 }),
    ],
  });

  assert.deepStrictEqual(
    items.map((item) => item.product.id),
    [CANDIDATE_A]
  );
});

test('co-purchase mengalahkan popularitas saat rasio kemunculan kuat', () => {
  const items = rankRecommendations({
    seeds: [SEED],
    seedOrders: 2,
    coPurchase: [{ productId: CANDIDATE_A, sharedOrders: 2, units: 3 }],
    popularity: [
      { productId: CANDIDATE_B, unitsSold: 100 },
      { productId: CANDIDATE_A, unitsSold: 3 },
    ],
    candidates: [candidate({ id: CANDIDATE_A }), candidate({ id: CANDIDATE_B })],
  });

  assert.strictEqual(items[0].product.id, CANDIDATE_A);
  assert.strictEqual(items[0].strategy, 'co_purchase');
  assert.strictEqual(items[0].score, 60.6);
});

test('co-purchase dinormalisasi terhadap jumlah order seed, bukan angka mentah', () => {
  const items = rankRecommendations({
    seeds: [SEED],
    seedOrders: 100,
    coPurchase: [{ productId: CANDIDATE_A, sharedOrders: 1, units: 1 }],
    popularity: [
      { productId: CANDIDATE_A, unitsSold: 1 },
      { productId: CANDIDATE_B, unitsSold: 100 },
    ],
    candidates: [candidate({ id: CANDIDATE_A }), candidate({ id: CANDIDATE_B })],
  });

  assert.strictEqual(items[0].product.id, CANDIDATE_B);
  assert.strictEqual(items[0].strategy, 'popularity');
  assert.strictEqual(items[1].signals.coPurchase, 0.6);
});

test('category affinity mengalahkan popularitas kecil tanpa co-purchase', () => {
  const items = rankRecommendations({
    seeds: [SEED],
    seedOrders: 0,
    seedCategoryIds: ['cat-a'],
    popularity: [
      { productId: CANDIDATE_A, unitsSold: 1 },
      { productId: CANDIDATE_B, unitsSold: 100 },
    ],
    candidates: [
      candidate({ id: CANDIDATE_A, categoryId: 'cat-a' }),
      candidate({ id: CANDIDATE_B, categoryId: 'cat-b' }),
    ],
  });

  assert.strictEqual(items[0].product.id, CANDIDATE_A);
  assert.strictEqual(items[0].signals.category, 20);
  assert.strictEqual(items[0].strategy, 'category');
});

test('skor co-purchase di-clamp 60 ketika sharedOrders melebihi jumlah order seed', () => {
  const items = rankRecommendations({
    seeds: [SEED],
    seedOrders: 2,
    coPurchase: [{ productId: CANDIDATE_A, sharedOrders: 9, units: 9 }],
    candidates: [candidate({ id: CANDIDATE_A, categoryId: 'cat-a' })],
    seedCategoryIds: ['cat-a'],
  });

  assert.strictEqual(items[0].signals.coPurchase, 60);
  assert.strictEqual(items[0].score, 80);
});

test('cold start memakai produk terbaru lalu judul supaya shelf tidak kosong', () => {
  const items = rankRecommendations({
    seeds: [SEED],
    candidates: [
      candidate({ id: CANDIDATE_A, title: 'Batik', createdAt: '2026-11-01T00:00:00.000Z' }),
      candidate({ id: CANDIDATE_B, title: 'Azalea', createdAt: '2026-11-03T00:00:00.000Z' }),
      candidate({ id: CANDIDATE_C, title: 'Celana', createdAt: '2026-11-03T00:00:00.000Z' }),
    ],
  });

  assert.deepStrictEqual(
    items.map((item) => item.product.title),
    ['Azalea', 'Celana', 'Batik']
  );
  assert.strictEqual(items[0].strategy, 'newest');
  assert.strictEqual(items[0].score, 0);
});

test('popularitas gabungan jumlahnya dan tie-break judul stabil', () => {
  const items = rankRecommendations({
    seeds: [],
    popularity: [
      { productId: CANDIDATE_A, unitsSold: 4 },
      { productId: CANDIDATE_A, unitsSold: 6 },
      { productId: CANDIDATE_B, unitsSold: 10 },
    ],
    candidates: [
      candidate({ id: CANDIDATE_A, title: 'Sama' }),
      candidate({ id: CANDIDATE_B, title: 'Sama' }),
    ],
  });

  assert.deepStrictEqual(
    items.map((item) => item.product.id),
    [CANDIDATE_A, CANDIDATE_B]
  );
  assert.strictEqual(items[0].signals.popularity, 20);
});

test('rankRecommendations menghormati limit dan memperlakukan limit nol sebagai default', () => {
  const input = {
    seeds: [SEED],
    candidates: [
      candidate({ id: CANDIDATE_A }),
      candidate({ id: CANDIDATE_B }),
      candidate({ id: CANDIDATE_C }),
      candidate({ id: CANDIDATE_D }),
    ],
  };

  assert.strictEqual(rankRecommendations(input, 2).length, 2);
  assert.strictEqual(rankRecommendations(input, 99).length, 4);
  // Query string `limit=0` is invalid input, so it falls back to the default shelf size.
  assert.strictEqual(rankRecommendations(input, 0).length, 4);
});

test('describeRecommendationBasis melaporkan sinyal item teratas, bukan sinyal yang diharapkan', () => {
  assert.strictEqual(describeRecommendationBasis([]), 'newest');

  const coPurchase = rankRecommendations({
    seeds: [SEED],
    seedOrders: 1,
    coPurchase: [{ productId: CANDIDATE_A, sharedOrders: 1, units: 1 }],
    popularity: [{ productId: CANDIDATE_B, unitsSold: 50 }],
    candidates: [candidate({ id: CANDIDATE_A }), candidate({ id: CANDIDATE_B })],
  });
  assert.strictEqual(describeRecommendationBasis(coPurchase), 'co_purchase');

  const trending = rankRecommendations({
    seeds: [],
    popularity: [{ productId: CANDIDATE_A, unitsSold: 50 }],
    candidates: [candidate({ id: CANDIDATE_A })],
  });
  assert.strictEqual(describeRecommendationBasis(trending), 'popularity');
});

test('route rekomendasi publik terdaftar di grup v1', () => {
  const paths = recommendationPublicRoutes.routes.map((route) => `${route.method} ${route.path}`);

  assert.ok(paths.includes('GET /recommendations'));
  assert.ok(paths.includes('GET /recommendations/trending'));
  assert.ok(paths.includes('GET /products/:slug/recommendations'));
});
