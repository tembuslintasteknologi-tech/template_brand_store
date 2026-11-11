import test from 'node:test';
import assert from 'node:assert';
import { isBannerLive, sortBanners, bannerSchema, ContentError } from '../services/content/bannerService.js';
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
