import test from 'node:test';
import assert from 'node:assert';
import {
  assignBannerVariant,
  bannerExperimentSchema,
  bannerVariantSchema,
  computeVariantMetrics,
  hashAssignment,
  pickControlVariant,
  pickWinningVariant,
  resolveVariantForSession,
  type BannerVariantLike,
  type VariantMetricsRow,
} from '../services/content/bannerExperimentService.js';
import { bannerEventSchema } from '../services/content/bannerService.js';

function variant(overrides: Partial<BannerVariantLike> = {}): BannerVariantLike {
  return {
    id: 'v-a',
    name: 'A',
    weight: 50,
    isActive: true,
    isControl: false,
    ...overrides,
  };
}

test('hashAssignment is stable and stays inside the unsigned 32 bit range', () => {
  assert.strictEqual(hashAssignment('session-1banner-1'), hashAssignment('session-1banner-1'));
  assert.notStrictEqual(hashAssignment('session-1banner-1'), hashAssignment('session-2banner-1'));
  assert.strictEqual(hashAssignment(''), 0x811c9dc5);

  for (const seed of ['a', 'abc', 'session-xyz', '🙂']) {
    const value = hashAssignment(seed);
    assert.ok(Number.isInteger(value), `hash must be an integer for ${seed}`);
    assert.ok(value >= 0 && value <= 0xffffffff, `hash out of range for ${seed}`);
  }
});

test('assignBannerVariant is deterministic for the same session and banner', () => {
  const pool = [variant({ id: 'a', weight: 50 }), variant({ id: 'b', weight: 50 })];
  const first = assignBannerVariant(pool, 'session-abc');
  const second = assignBannerVariant(pool, 'session-abc');

  assert.ok(first);
  assert.strictEqual(first?.id, second?.id);
});

test('assignBannerVariant follows the weight split across many sessions', () => {
  const pool = [
    variant({ id: 'control', weight: 80 }),
    variant({ id: 'challenger', weight: 20 }),
  ];

  let control = 0;
  let challenger = 0;
  for (let index = 0; index < 2000; index += 1) {
    const picked = assignBannerVariant(pool, `session-${index}`);
    assert.ok(picked, 'every session must be assigned when weights are valid');
    if (picked?.id === 'control') control += 1;
    if (picked?.id === 'challenger') challenger += 1;
  }

  assert.strictEqual(control + challenger, 2000);
  // 80/20 with a generous band, the point is that weighting is respected at all.
  assert.ok(control > 1400, `control got ${control} of 2000`);
  assert.ok(challenger > 200, `challenger got ${challenger} of 2000`);
});

test('assignBannerVariant skips inactive and zero weight variants', () => {
  const pool = [
    variant({ id: 'off', weight: 100, isActive: false }),
    variant({ id: 'zero', weight: 0 }),
    variant({ id: 'live', weight: 10 }),
  ];

  for (let index = 0; index < 50; index += 1) {
    assert.strictEqual(assignBannerVariant(pool, `s-${index}`)?.id, 'live');
  }

  assert.strictEqual(assignBannerVariant([], 's'), null);
  assert.strictEqual(assignBannerVariant([variant({ weight: 0 })], 's'), null);
});

test('pickControlVariant prefers the control flag and never invents a variant', () => {
  const pool = [
    variant({ id: 'a', isControl: false }),
    variant({ id: 'b', isControl: true }),
    variant({ id: 'off', isControl: true, isActive: false }),
  ];

  assert.strictEqual(pickControlVariant(pool)?.id, 'b');
  assert.strictEqual(pickControlVariant([variant({ id: 'only' })])?.id, 'only');
  assert.strictEqual(pickControlVariant([]), null);
});

test('resolveVariantForSession falls back to the control creative without a session', () => {
  const pool = [
    variant({ id: 'control', weight: 50, isControl: true }),
    variant({ id: 'challenger', weight: 50 }),
  ];

  assert.strictEqual(resolveVariantForSession(pool, null)?.id, 'control');
  assert.strictEqual(resolveVariantForSession(pool, '   ')?.id, 'control');
  assert.strictEqual(resolveVariantForSession(pool, '')?.id, 'control');

  const assigned = resolveVariantForSession(pool, 'session-42');
  assert.ok(assigned);
  assert.strictEqual(resolveVariantForSession(pool, 'session-42')?.id, assigned?.id);
});

test('computeVariantMetrics splits views and clicks per variant', () => {
  const metrics = computeVariantMetrics(
    [variant({ id: 'a', name: 'Kontrol', isControl: true }), variant({ id: 'b', name: 'Uji' })],
    [
      { variantId: 'a', eventType: 'view' },
      { variantId: 'a', eventType: 'view' },
      { variantId: 'a', eventType: 'click' },
      { variantId: 'b', eventType: 'view' },
      { variantId: 'b', eventType: 'view' },
      { variantId: 'b', eventType: 'view' },
      { variantId: 'b', eventType: 'view' },
      { variantId: 'b', eventType: 'click' },
      { variantId: 'b', eventType: 'click' },
      // Events without a variant belong to the banner aggregate, not to a variant bucket.
      { variantId: null, eventType: 'view' },
    ]
  );

  assert.strictEqual(metrics.length, 2);
  assert.deepStrictEqual(
    metrics.map((row) => [row.variantId, row.views, row.clicks, row.ctr, row.isControl]),
    [
      ['a', 2, 1, 50, true],
      ['b', 4, 2, 50, false],
    ]
  );
  assert.strictEqual(metrics[0].name, 'Kontrol');
});

test('computeVariantMetrics reports zero CTR for a variant with no events', () => {
  const metrics = computeVariantMetrics([variant({ id: 'a' })], []);
  assert.deepStrictEqual(metrics[0], {
    variantId: 'a',
    name: 'A',
    isControl: false,
    weight: 50,
    views: 0,
    clicks: 0,
    ctr: 0,
  });
});

function metricRow(overrides: Partial<VariantMetricsRow> = {}): VariantMetricsRow {
  return {
    variantId: 'v-a',
    name: 'A',
    isControl: false,
    weight: 50,
    views: 100,
    clicks: 5,
    ctr: 5,
    ...overrides,
  };
}

test('pickWinningVariant refuses to pick before every variant reaches minViews', () => {
  const decision = pickWinningVariant(
    [metricRow({ variantId: 'a', views: 500, ctr: 9 }), metricRow({ variantId: 'b', views: 40, ctr: 20 })],
    100
  );

  assert.strictEqual(decision.variantId, null);
  assert.strictEqual(decision.reason, 'NOT_ENOUGH_DATA');
  assert.strictEqual(decision.minViews, 100);
  assert.strictEqual(decision.evaluated, 1);
});

test('pickWinningVariant returns NO_VARIANTS when there is nothing to compare', () => {
  const decision = pickWinningVariant([], 100);
  assert.strictEqual(decision.variantId, null);
  assert.strictEqual(decision.reason, 'NO_VARIANTS');
});

test('pickWinningVariant picks the higher CTR once both variants qualify', () => {
  const decision = pickWinningVariant(
    [
      metricRow({ variantId: 'control', views: 200, clicks: 10, ctr: 5 }),
      metricRow({ variantId: 'challenger', views: 200, clicks: 18, ctr: 9 }),
    ],
    100
  );

  assert.strictEqual(decision.variantId, 'challenger');
  assert.strictEqual(decision.reason, 'WINNER');
});

test('pickWinningVariant breaks ties by clicks, then views, then variant id', () => {
  const byClicks = pickWinningVariant(
    [
      metricRow({ variantId: 'a', views: 100, clicks: 5, ctr: 5 }),
      metricRow({ variantId: 'b', views: 100, clicks: 8, ctr: 5 }),
    ],
    100
  );
  assert.strictEqual(byClicks.variantId, 'b');

  const byViews = pickWinningVariant(
    [
      metricRow({ variantId: 'a', views: 100, clicks: 5, ctr: 5 }),
      metricRow({ variantId: 'b', views: 150, clicks: 5, ctr: 5 }),
    ],
    100
  );
  assert.strictEqual(byViews.variantId, 'b');

  const byId = pickWinningVariant(
    [
      metricRow({ variantId: 'v-z', views: 100, clicks: 5, ctr: 5 }),
      metricRow({ variantId: 'v-a', views: 100, clicks: 5, ctr: 5 }),
    ],
    100
  );
  assert.strictEqual(byId.variantId, 'v-a');
});

test('pickWinningVariant clamps a malformed minViews to at least one', () => {
  const zero = pickWinningVariant([metricRow({ variantId: 'a', views: 1 }), metricRow({ variantId: 'b', views: 1 })], 0);
  assert.strictEqual(zero.minViews, 1);
  assert.strictEqual(zero.reason, 'WINNER');

  const negative = pickWinningVariant([metricRow({ variantId: 'a' }), metricRow({ variantId: 'b' })], -5);
  assert.strictEqual(negative.minViews, 1);
});

test('bannerVariantSchema accepts a normal creative and rejects invalid weights', () => {
  const parsed = bannerVariantSchema.safeParse({
    name: 'Versi diskon',
    imageUrl: 'https://cdn.example.com/banner-a.jpg',
    linkUrl: 'https://example.com/promo',
    weight: 70,
    isControl: false,
  });
  assert.strictEqual(parsed.success, true);

  assert.strictEqual(bannerVariantSchema.safeParse({ name: '', imageUrl: 'https://x.test/a.jpg' }).success, false);
  assert.strictEqual(bannerVariantSchema.safeParse({ name: 'A', imageUrl: 'not-a-url' }).success, false);
  assert.strictEqual(
    bannerVariantSchema.safeParse({ name: 'A', imageUrl: 'https://x.test/a.jpg', weight: 0 }).success,
    false
  );
  assert.strictEqual(
    bannerVariantSchema.safeParse({ name: 'A', imageUrl: 'https://x.test/a.jpg', weight: 1.5 }).success,
    false
  );
});

test('bannerExperimentSchema limits status and minViews to sane values', () => {
  assert.strictEqual(bannerExperimentSchema.safeParse({ status: 'running', minViews: 100 }).success, true);
  assert.strictEqual(bannerExperimentSchema.safeParse({ status: 'paused' }).success, false);
  assert.strictEqual(bannerExperimentSchema.safeParse({ minViews: 0 }).success, false);
  assert.strictEqual(bannerExperimentSchema.safeParse({ minViews: 1000001 }).success, false);
  assert.strictEqual(bannerExperimentSchema.safeParse({}).success, true);
});

test('bannerEventSchema accepts an optional variant id and rejects a non uuid', () => {
  const uuid = '3f1f9d4e-1b2c-4d5e-8f90-1a2b3c4d5e6f';

  assert.strictEqual(bannerEventSchema.safeParse({ type: 'view' }).success, true);
  assert.strictEqual(bannerEventSchema.safeParse({ type: 'click', variantId: uuid }).success, true);
  assert.strictEqual(bannerEventSchema.safeParse({ type: 'click', variantId: 'variant-1' }).success, false);
  assert.strictEqual(bannerEventSchema.safeParse({ type: 'hover' }).success, false);
});
