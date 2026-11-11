import test from 'node:test';
import assert from 'node:assert';
import {
  canWriteReview,
  isPublicReview,
  parseReviewSort,
  sortReviews,
  summarizeRatings,
} from '../services/reviews/reviewService.js';

test('canWriteReview requires a verified purchase and blocks duplicates', () => {
  assert.deepStrictEqual(canWriteReview({ purchased: true, alreadyReviewed: false }), {
    allowed: true,
    verifiedPurchase: true,
  });

  const notPurchased = canWriteReview({ purchased: false, alreadyReviewed: false });
  assert.strictEqual(notPurchased.allowed, false);
  assert.strictEqual(notPurchased.reason, 'not_purchased');

  const duplicate = canWriteReview({ purchased: true, alreadyReviewed: true });
  assert.strictEqual(duplicate.allowed, false);
  assert.strictEqual(duplicate.reason, 'already_reviewed');
});

test('summarizeRatings computes average and distribution', () => {
  const summary = summarizeRatings([5, 4, 4, 1, 5]);
  assert.strictEqual(summary.count, 5);
  assert.strictEqual(summary.average, 3.8);
  assert.deepStrictEqual(summary.distribution, { 1: 1, 2: 0, 3: 0, 4: 2, 5: 2 });

  const empty = summarizeRatings([]);
  assert.strictEqual(empty.count, 0);
  assert.strictEqual(empty.average, 0);
});

test('summarizeRatings ignores out of range values', () => {
  const summary = summarizeRatings([0, 6, 5, Number.NaN]);
  assert.strictEqual(summary.count, 1);
  assert.strictEqual(summary.average, 5);
});

test('sortReviews orders by recency, rating, and helpful count', () => {
  const rows = [
    { rating: 3, helpfulCount: 1, createdAt: '2026-11-01T00:00:00Z' },
    { rating: 5, helpfulCount: 0, createdAt: '2026-11-02T00:00:00Z' },
    { rating: 1, helpfulCount: 9, createdAt: '2026-11-03T00:00:00Z' },
  ];

  assert.deepStrictEqual(sortReviews(rows, 'recent').map((row) => row.rating), [1, 5, 3]);
  assert.deepStrictEqual(sortReviews(rows, 'highest').map((row) => row.rating), [5, 3, 1]);
  assert.deepStrictEqual(sortReviews(rows, 'lowest').map((row) => row.rating), [1, 3, 5]);
  assert.deepStrictEqual(sortReviews(rows, 'helpful').map((row) => row.rating), [1, 3, 5]);
});

test('parseReviewSort falls back to recent for unknown input', () => {
  assert.strictEqual(parseReviewSort('helpful'), 'helpful');
  assert.strictEqual(parseReviewSort('bogus'), 'recent');
  assert.strictEqual(parseReviewSort(undefined), 'recent');
});

test('isPublicReview treats null as hidden and undefined as visible', () => {
  assert.strictEqual(isPublicReview({ isVisible: true }), true);
  assert.strictEqual(isPublicReview({ isVisible: false }), false);
  assert.strictEqual(isPublicReview({}), true);
  assert.strictEqual(isPublicReview(null), false);
});
