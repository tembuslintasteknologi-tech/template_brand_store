import test from 'node:test';
import assert from 'node:assert';
import {
  dedupeProductIds,
  discountPercent,
  formatPrice,
  shouldNotifyBackInStock,
  shouldNotifyPriceDrop,
} from '../services/wishlist/wishlistService.js';

test('shouldNotifyPriceDrop fires only on a real, unseen price drop', () => {
  assert.strictEqual(shouldNotifyPriceDrop({ notifyPriceDrop: true }, 100000, 80000), true);
  assert.strictEqual(shouldNotifyPriceDrop({}, 100000, 80000), true);

  // price unchanged or higher
  assert.strictEqual(shouldNotifyPriceDrop({}, 100000, 100000), false);
  assert.strictEqual(shouldNotifyPriceDrop({}, 100000, 120000), false);

  // customer opted out
  assert.strictEqual(shouldNotifyPriceDrop({ notifyPriceDrop: false }, 100000, 80000), false);

  // already alerted for this exact price
  assert.strictEqual(shouldNotifyPriceDrop({ lastNotifiedPrice: '80000' }, 100000, 80000), false);

  // a further drop must alert again
  assert.strictEqual(shouldNotifyPriceDrop({ lastNotifiedPrice: '80000' }, 80000, 70000), true);
});

test('shouldNotifyPriceDrop rejects non-numeric prices', () => {
  assert.strictEqual(shouldNotifyPriceDrop({}, Number.NaN, 1000), false);
  assert.strictEqual(shouldNotifyPriceDrop({}, 1000, Number.NaN), false);
});

test('shouldNotifyBackInStock fires only on the zero to positive transition', () => {
  assert.strictEqual(shouldNotifyBackInStock({}, 0, 10), true);
  assert.strictEqual(shouldNotifyBackInStock({}, -1, 10), true);
  assert.strictEqual(shouldNotifyBackInStock({}, 5, 10), false);
  assert.strictEqual(shouldNotifyBackInStock({}, 0, 0), false);
  assert.strictEqual(shouldNotifyBackInStock({ notifyBackInStock: false }, 0, 10), false);
});

test('discountPercent rounds to a whole percent and never goes negative', () => {
  assert.strictEqual(discountPercent(100000, 75000), 25);
  assert.strictEqual(discountPercent(99000, 80000), 19);
  assert.strictEqual(discountPercent(100000, 100000), 0);
  assert.strictEqual(discountPercent(0, 0), 0);
});

test('formatPrice renders rupiah with dot thousand separators', () => {
  assert.strictEqual(formatPrice(1250000), 'Rp 1.250.000');
  assert.strictEqual(formatPrice('89000'), 'Rp 89.000');
});

test('dedupeProductIds removes blanks and duplicates but keeps order', () => {
  assert.deepStrictEqual(dedupeProductIds(['a', 'b', 'a', '', 'c']), ['a', 'b', 'c']);
});
