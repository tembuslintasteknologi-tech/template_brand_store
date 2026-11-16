import test from 'node:test';
import assert from 'node:assert';
import { isBannerLive, sortBanners, bannerSchema, ContentError } from '../services/content/bannerService.js';
import {
  aggregateBannerMetrics,
  bannerEventSchema,
  computeBannerMetrics,
  isBannerVisibleToAudience,
  resolveViewerAudience,
} from '../services/content/bannerService.js';
import { isPagePublic, pageSchema, SLUG_PATTERN } from '../services/content/pageService.js';

const now = new Date('2026-11-10T12:00:00.000Z');

test('isBannerLive honours the active flag and the schedule window', () => {
  assert.strictEqual(isBannerLive({ isActive: true }, now), true);
  assert.strictEqual(isBannerLive({ isActive: false }, now), false);
  assert.strictEqual(isBannerLive({ isActive: true, startAt: '2026-11-10T10:00:00.000Z' }, now), true);
  assert.strictEqual(isBannerLive({ isActive: true, startAt: '2026-11-11T10:00:00.000Z' }, now), false);
  assert.strictEqual(isBannerLive({ isActive: true, endAt: '2026-11-10T11:00:00.000Z' }, now), false);
  assert.strictEqual(isBannerLive({ isActive: true, endAt: '2026-11-10T13:00:00.000Z' }, now), true);
  assert.strictEqual(isBannerLive({ isActive: true, startAt: new Date('2026-11-10T11:00:00Z'), endAt: new Date('2026-11-10T13:00:00Z') }, now), true);
  assert.strictEqual(isBannerLive({ isActive: true, startAt: null, endAt: null }, now), true);
});

test('sortBanners orders by sortOrder then createdAt', () => {
  const rows = [
    { id: 'b', sortOrder: 2, createdAt: '2026-11-10T10:00:00Z' },
    { id: 'a', sortOrder: 1, createdAt: '2026-11-10T11:00:00Z' },
    { id: 'c', sortOrder: 1, createdAt: '2026-11-10T09:00:00Z' },
  ];
  assert.deepStrictEqual(sortBanners(rows).map((row) => row.id), ['c', 'a', 'b']);
});

test('bannerSchema requires a title and an image url', () => {
  assert.strictEqual(bannerSchema.safeParse({ title: 'Promo', imageUrl: 'https://cdn.example/b.png' }).success, true);
  assert.strictEqual(bannerSchema.safeParse({ title: '', imageUrl: 'https://cdn.example/b.png' }).success, false);
  assert.strictEqual(bannerSchema.safeParse({ title: 'Promo', imageUrl: 'not-a-url' }).success, false);
  assert.strictEqual(
    bannerSchema.safeParse({ title: 'Promo', imageUrl: 'https://cdn.example/b.png', startAt: '2026-11-10' }).success,
    false
  );
});

test('isPagePublic only allows published pages', () => {
  assert.strictEqual(isPagePublic({ isPublished: true }), true);
  assert.strictEqual(isPagePublic({ isPublished: false }), false);
  assert.strictEqual(isPagePublic(null), false);
  assert.strictEqual(isPagePublic(undefined), false);
});

test('pageSchema enforces slug format and required content', () => {
  assert.strictEqual(pageSchema.safeParse({ slug: 'about-us', title: 'About', content: 'Halo' }).success, true);
  assert.strictEqual(pageSchema.safeParse({ slug: 'About Us', title: 'About', content: 'Halo' }).success, false);
  assert.strictEqual(pageSchema.safeParse({ slug: 'about_us', title: 'About', content: 'Halo' }).success, false);
  assert.strictEqual(pageSchema.safeParse({ slug: 'about', title: 'About', content: '' }).success, false);
});

test('SLUG_PATTERN accepts kebab case only', () => {
  assert.strictEqual(SLUG_PATTERN.test('syarat-ketentuan'), true);
  assert.strictEqual(SLUG_PATTERN.test('faq2'), true);
  assert.strictEqual(SLUG_PATTERN.test('-faq'), false);
  assert.strictEqual(SLUG_PATTERN.test('faq-'), false);
  assert.strictEqual(SLUG_PATTERN.test('faq--page'), false);
});

test('ContentError carries an HTTP status', () => {
  const err = new ContentError('tidak ada', 404);
  assert.strictEqual(err.status, 404);
  assert.strictEqual(err.name, 'ContentError');
});

test('resolveViewerAudience maps presence of a user to customer or guest', () => {
  assert.strictEqual(resolveViewerAudience(true), 'customer');
  assert.strictEqual(resolveViewerAudience(false), 'guest');
});

test('isBannerVisibleToAudience treats all as universal and segments as exclusive', () => {
  assert.strictEqual(isBannerVisibleToAudience({ audience: 'all' }, 'guest'), true);
  assert.strictEqual(isBannerVisibleToAudience({ audience: 'all' }, 'customer'), true);
  assert.strictEqual(isBannerVisibleToAudience({ audience: 'guest' }, 'guest'), true);
  assert.strictEqual(isBannerVisibleToAudience({ audience: 'guest' }, 'customer'), false);
  assert.strictEqual(isBannerVisibleToAudience({ audience: 'customer' }, 'customer'), true);
  assert.strictEqual(isBannerVisibleToAudience({ audience: 'customer' }, 'guest'), false);
  // Legacy rows and unknown values fall back to 'all' rather than disappearing.
  assert.strictEqual(isBannerVisibleToAudience({ audience: null }, 'guest'), true);
  assert.strictEqual(isBannerVisibleToAudience({ audience: 'vip' }, 'customer'), true);
});

test('bannerSchema accepts a segment and rejects an unknown one', () => {
  const base = { title: 'Promo', imageUrl: 'https://cdn.example/b.png' };
  assert.strictEqual(bannerSchema.safeParse({ ...base, audience: 'customer' }).success, true);
  assert.strictEqual(bannerSchema.safeParse({ ...base, audience: 'vip' }).success, false);
});

test('bannerEventSchema only accepts view and click', () => {
  assert.strictEqual(bannerEventSchema.safeParse({ type: 'view' }).success, true);
  assert.strictEqual(bannerEventSchema.safeParse({ type: 'click', sessionId: 'sess-1' }).success, true);
  assert.strictEqual(bannerEventSchema.safeParse({ type: 'purchase' }).success, false);
  assert.strictEqual(bannerEventSchema.safeParse({}).success, false);
  assert.strictEqual(bannerEventSchema.safeParse({ type: 'view', sessionId: '' }).success, false);
});

test('computeBannerMetrics counts views, clicks and CTR with two decimals', () => {
  assert.deepStrictEqual(
    computeBannerMetrics([
      { eventType: 'view' },
      { eventType: 'view' },
      { eventType: 'view' },
      { eventType: 'click' },
    ]),
    { views: 3, clicks: 1, ctr: 33.33 }
  );
  assert.deepStrictEqual(computeBannerMetrics([]), { views: 0, clicks: 0, ctr: 0 });
  assert.deepStrictEqual(computeBannerMetrics([{ eventType: 'click' }]), { views: 0, clicks: 1, ctr: 0 });
  assert.deepStrictEqual(
    computeBannerMetrics([{ eventType: 'view' }, { eventType: 'click' }]),
    { views: 1, clicks: 1, ctr: 100 }
  );
});

test('aggregateBannerMetrics groups events per banner id', () => {
  const grouped = aggregateBannerMetrics([
    { bannerId: 'a', eventType: 'view' },
    { bannerId: 'a', eventType: 'view' },
    { bannerId: 'a', eventType: 'click' },
    { bannerId: 'b', eventType: 'view' },
  ]);
  assert.deepStrictEqual(grouped.get('a'), { views: 2, clicks: 1, ctr: 50 });
  assert.deepStrictEqual(grouped.get('b'), { views: 1, clicks: 0, ctr: 0 });
  assert.strictEqual(grouped.has('c'), false);
});
