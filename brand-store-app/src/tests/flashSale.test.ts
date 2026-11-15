import test from 'node:test';
import assert from 'node:assert';
import {
  FlashSaleError,
  assertFlashSaleDiscount,
  assertFlashSaleItemInput,
  assertFlashSalePerUserLimit,
  assertFlashSaleStock,
  assertFlashSaleTitle,
  assertFlashSaleWindow,
  evaluateFlashSalePurchase,
  flashSaleCountdown,
  flashSaleStatus,
  isPubliclyVisibleFlashSale,
  normalizeFlashSaleQuantity,
  remainingFlashStock,
  resolveFlashSalePrice,
  sortFlashSalesForLanding,
} from '../services/promo/flashSaleService.js';

const NOW = new Date('2026-11-15T10:00:00.000Z');
const HOUR = 60 * 60 * 1000;

function windowAround(offsetStartMs: number, offsetEndMs: number, isActive = true) {
  return {
    startAt: new Date(NOW.getTime() + offsetStartMs),
    endAt: new Date(NOW.getTime() + offsetEndMs),
    isActive,
  };
}

test('flash sale window validation', async (t) => {
  await t.test('rejects an end that is not after the start', () => {
    assert.throws(
      () =>
        assertFlashSaleWindow({
          startAt: '2026-11-15T10:00:00.000Z',
          endAt: '2026-11-15T10:00:00.000Z',
        }),
      (err: unknown) => err instanceof FlashSaleError && err.code === 'INVALID_WINDOW'
    );
  });

  await t.test('rejects an unparseable date', () => {
    assert.throws(
      () => assertFlashSaleWindow({ startAt: 'bukan tanggal', endAt: NOW }),
      (err: unknown) => err instanceof FlashSaleError && err.code === 'INVALID_WINDOW'
    );
  });

  await t.test('normalises strings into Date instances', () => {
    const parsed = assertFlashSaleWindow({
      startAt: '2026-11-15T09:00:00.000Z',
      endAt: '2026-11-15T12:00:00.000Z',
    });
    assert.ok(parsed.startAt instanceof Date);
    assert.strictEqual(parsed.startAt.toISOString(), '2026-11-15T09:00:00.000Z');
    assert.strictEqual(parsed.endAt.toISOString(), '2026-11-15T12:00:00.000Z');
  });
});

test('flash sale title and item input validation', async (t) => {
  await t.test('trims a valid title', () => {
    assert.strictEqual(assertFlashSaleTitle('  Serbu Akhir Pekan  '), 'Serbu Akhir Pekan');
  });

  await t.test('rejects a title that is too short', () => {
    assert.throws(
      () => assertFlashSaleTitle('ab'),
      (err: unknown) => err instanceof FlashSaleError && err.code === 'INVALID_TITLE'
    );
  });

  await t.test('accepts percentage and fixed discounts', () => {
    assert.deepStrictEqual(assertFlashSaleDiscount({ discountType: 'percentage', discountValue: 25 }), {
      discountType: 'percentage',
      discountValue: 25,
    });
    assert.deepStrictEqual(assertFlashSaleDiscount({ discountType: 'fixed', discountValue: '15000' }), {
      discountType: 'fixed',
      discountValue: 15000,
    });
  });

  await t.test('rejects an unknown discount type', () => {
    assert.throws(
      () => assertFlashSaleDiscount({ discountType: 'buy-one-get-one', discountValue: 10 }),
      (err: unknown) => err instanceof FlashSaleError && err.code === 'INVALID_DISCOUNT'
    );
  });

  await t.test('rejects a percentage above 100', () => {
    assert.throws(
      () => assertFlashSaleDiscount({ discountType: 'percentage', discountValue: 101 }),
      (err: unknown) => err instanceof FlashSaleError && err.code === 'INVALID_DISCOUNT'
    );
  });

  await t.test('rejects a zero or negative discount', () => {
    assert.throws(() => assertFlashSaleDiscount({ discountType: 'fixed', discountValue: 0 }));
    assert.throws(() => assertFlashSaleDiscount({ discountType: 'fixed', discountValue: -5000 }));
  });

  await t.test('stock must be a non-negative integer', () => {
    assert.strictEqual(assertFlashSaleStock(10), 10);
    assert.strictEqual(assertFlashSaleStock('0'), 0);
    assert.throws(() => assertFlashSaleStock(-1));
    assert.throws(() => assertFlashSaleStock(1.5));
  });

  await t.test('per user limit accepts null for unlimited', () => {
    assert.strictEqual(assertFlashSalePerUserLimit(null), null);
    assert.strictEqual(assertFlashSalePerUserLimit(undefined), null);
    assert.strictEqual(assertFlashSalePerUserLimit(2), 2);
    assert.throws(
      () => assertFlashSalePerUserLimit(0),
      (err: unknown) => err instanceof FlashSaleError && err.code === 'INVALID_LIMIT'
    );
  });

  await t.test('combines item validation and defaults the limit to null', () => {
    assert.deepStrictEqual(
      assertFlashSaleItemInput({
        discountType: 'percentage',
        discountValue: 20,
        stock: 50,
      }),
      { discountType: 'percentage', discountValue: 20, stock: 50, perUserLimit: null }
    );
  });
});

test('flash sale status boundaries', async (t) => {
  await t.test('upcoming before the start', () => {
    assert.strictEqual(flashSaleStatus(windowAround(HOUR, 2 * HOUR), NOW), 'upcoming');
  });

  await t.test('active exactly at the start, inclusive', () => {
    assert.strictEqual(flashSaleStatus(windowAround(0, HOUR), NOW), 'active');
  });

  await t.test('active exactly at the end, inclusive', () => {
    assert.strictEqual(flashSaleStatus(windowAround(-HOUR, 0), NOW), 'active');
  });

  await t.test('ended one millisecond after the end', () => {
    const sale = {
      startAt: new Date(NOW.getTime() - HOUR),
      endAt: new Date(NOW.getTime() - 1),
    };
    assert.strictEqual(flashSaleStatus(sale, NOW), 'ended');
  });

  await t.test('manual deactivate wins over an open window', () => {
    assert.strictEqual(flashSaleStatus(windowAround(-HOUR, HOUR, false), NOW), 'inactive');
  });

  await t.test('manual deactivate also hides an upcoming sale', () => {
    assert.strictEqual(flashSaleStatus(windowAround(HOUR, 2 * HOUR, false), NOW), 'inactive');
  });
});

test('flash sale countdown payload', async (t) => {
  await t.test('upcoming counts down to the start and also reports the end', () => {
    const countdown = flashSaleCountdown(windowAround(HOUR, 3 * HOUR), NOW);
    assert.strictEqual(countdown.status, 'upcoming');
    assert.strictEqual(countdown.startsInMs, HOUR);
    assert.strictEqual(countdown.endsInMs, 3 * HOUR);
    assert.strictEqual(countdown.remainingMs, HOUR);
    assert.strictEqual(countdown.serverTime, NOW.toISOString());
  });

  await t.test('active counts down to the end', () => {
    const countdown = flashSaleCountdown(windowAround(-HOUR, 2 * HOUR), NOW);
    assert.strictEqual(countdown.status, 'active');
    assert.strictEqual(countdown.startsInMs, null);
    assert.strictEqual(countdown.endsInMs, 2 * HOUR);
    assert.strictEqual(countdown.remainingMs, 2 * HOUR);
  });

  await t.test('ended has no remaining time', () => {
    const countdown = flashSaleCountdown(windowAround(-2 * HOUR, -HOUR), NOW);
    assert.strictEqual(countdown.status, 'ended');
    assert.strictEqual(countdown.startsInMs, null);
    assert.strictEqual(countdown.endsInMs, null);
    assert.strictEqual(countdown.remainingMs, 0);
  });

  await t.test('inactive has no countdown', () => {
    const countdown = flashSaleCountdown(windowAround(-HOUR, HOUR, false), NOW);
    assert.strictEqual(countdown.status, 'inactive');
    assert.strictEqual(countdown.remainingMs, 0);
  });
});

test('flash sale price resolution', async (t) => {
  await t.test('percentage discount on a 200000 base', () => {
    assert.deepStrictEqual(resolveFlashSalePrice(200000, { discountType: 'percentage', discountValue: 25 }), {
      basePrice: 200000,
      finalPrice: 150000,
      discountAmount: 50000,
      discountPercent: 25,
    });
  });

  await t.test('fixed discount', () => {
    assert.deepStrictEqual(resolveFlashSalePrice('150000', { discountType: 'fixed', discountValue: 25000 }), {
      basePrice: 150000,
      finalPrice: 125000,
      discountAmount: 25000,
      discountPercent: 16.67,
    });
  });

  await t.test('fixed discount larger than the price is clamped', () => {
    const price = resolveFlashSalePrice(10000, { discountType: 'fixed', discountValue: 25000 });
    assert.strictEqual(price.finalPrice, 0);
    assert.strictEqual(price.discountAmount, 10000);
  });

  await t.test('100 percent discount yields zero', () => {
    const price = resolveFlashSalePrice(50000, { discountType: 'percentage', discountValue: 100 });
    assert.strictEqual(price.finalPrice, 0);
    assert.strictEqual(price.discountPercent, 100);
  });

  await t.test('rounds to two decimals', () => {
    const price = resolveFlashSalePrice(9999, { discountType: 'percentage', discountValue: 33 });
    assert.strictEqual(price.discountAmount, 3299.67);
    assert.strictEqual(price.finalPrice, 6699.33);
  });

  await t.test('a zero base price never produces a negative final price', () => {
    const price = resolveFlashSalePrice(0, { discountType: 'fixed', discountValue: 5000 });
    assert.strictEqual(price.finalPrice, 0);
    assert.strictEqual(price.discountPercent, 0);
  });
});

test('flash sale stock accounting', async (t) => {
  await t.test('remaining subtracts sold from stock', () => {
    assert.strictEqual(remainingFlashStock({ stock: 100, sold: 35 }), 65);
  });

  await t.test('never returns a negative remainder', () => {
    assert.strictEqual(remainingFlashStock({ stock: 10, sold: 15 }), 0);
  });

  await t.test('treats missing sold as zero', () => {
    assert.strictEqual(remainingFlashStock({ stock: 7 }), 7);
  });
});

test('quantity normalisation', async (t) => {
  await t.test('accepts positive integers', () => {
    assert.strictEqual(normalizeFlashSaleQuantity(3), 3);
    assert.strictEqual(normalizeFlashSaleQuantity('2'), 2);
  });

  await t.test('rejects zero, negatives, and fractions', () => {
    assert.throws(
      () => normalizeFlashSaleQuantity(0),
      (err: unknown) => err instanceof FlashSaleError && err.code === 'INVALID_QUANTITY'
    );
    assert.throws(() => normalizeFlashSaleQuantity(-2));
    assert.throws(() => normalizeFlashSaleQuantity(1.5));
  });
});

test('purchase gate combines window, stock, and per user limit', async (t) => {
  const active = windowAround(-HOUR, HOUR);

  await t.test('allows a purchase inside stock and limit', () => {
    const decision = evaluateFlashSalePurchase({
      sale: active,
      item: { discountType: 'percentage', discountValue: 20, stock: 10, sold: 4, perUserLimit: 3 },
      quantity: 2,
      purchasedByUser: 1,
      now: NOW,
    });
    assert.strictEqual(decision.allowed, true);
    assert.strictEqual(decision.remainingStock, 6);
    assert.strictEqual(decision.userRemaining, 2);
    assert.strictEqual(decision.reason, undefined);
  });

  await t.test('rejects when quantity exceeds remaining stock', () => {
    const decision = evaluateFlashSalePurchase({
      sale: active,
      item: { discountType: 'fixed', discountValue: 1000, stock: 5, sold: 4 },
      quantity: 2,
      now: NOW,
    });
    assert.strictEqual(decision.allowed, false);
    assert.strictEqual(decision.reason, 'OUT_OF_STOCK');
  });

  await t.test('rejects when the per user limit would be exceeded', () => {
    const decision = evaluateFlashSalePurchase({
      sale: active,
      item: { discountType: 'fixed', discountValue: 1000, stock: 100, sold: 0, perUserLimit: 2 },
      quantity: 1,
      purchasedByUser: 2,
      now: NOW,
    });
    assert.strictEqual(decision.allowed, false);
    assert.strictEqual(decision.reason, 'PER_USER_LIMIT_REACHED');
    assert.strictEqual(decision.userRemaining, 0);
  });

  await t.test('null limit means unlimited', () => {
    const decision = evaluateFlashSalePurchase({
      sale: active,
      item: { discountType: 'fixed', discountValue: 1000, stock: 100, sold: 0, perUserLimit: null },
      quantity: 10,
      purchasedByUser: 99,
      now: NOW,
    });
    assert.strictEqual(decision.allowed, true);
    assert.strictEqual(decision.userRemaining, null);
  });

  await t.test('rejects an upcoming sale', () => {
    const decision = evaluateFlashSalePurchase({
      sale: windowAround(HOUR, 2 * HOUR),
      item: { discountType: 'fixed', discountValue: 1000, stock: 10, sold: 0 },
      quantity: 1,
      now: NOW,
    });
    assert.strictEqual(decision.allowed, false);
    assert.strictEqual(decision.reason, 'SALE_NOT_STARTED');
  });

  await t.test('rejects an ended sale', () => {
    const decision = evaluateFlashSalePurchase({
      sale: windowAround(-2 * HOUR, -HOUR),
      item: { discountType: 'fixed', discountValue: 1000, stock: 10, sold: 0 },
      quantity: 1,
      now: NOW,
    });
    assert.strictEqual(decision.reason, 'SALE_ENDED');
  });

  await t.test('rejects a deactivated sale', () => {
    const decision = evaluateFlashSalePurchase({
      sale: windowAround(-HOUR, HOUR, false),
      item: { discountType: 'fixed', discountValue: 1000, stock: 10, sold: 0 },
      quantity: 1,
      now: NOW,
    });
    assert.strictEqual(decision.reason, 'SALE_INACTIVE');
  });

  await t.test('checks stock before the per user limit', () => {
    const decision = evaluateFlashSalePurchase({
      sale: active,
      item: { discountType: 'fixed', discountValue: 1000, stock: 1, sold: 1, perUserLimit: 1 },
      quantity: 1,
      purchasedByUser: 0,
      now: NOW,
    });
    assert.strictEqual(decision.reason, 'OUT_OF_STOCK');
  });
});

test('landing page ordering and visibility', async (t) => {
  const ended = { id: 'ended', startAt: new Date(NOW.getTime() - 3 * HOUR), endAt: new Date(NOW.getTime() - 2 * HOUR) };
  const activeLater = { id: 'active-later', startAt: new Date(NOW.getTime() - HOUR), endAt: new Date(NOW.getTime() + HOUR) };
  const upcoming = { id: 'upcoming', startAt: new Date(NOW.getTime() + HOUR), endAt: new Date(NOW.getTime() + 2 * HOUR) };
  const activeNow = { id: 'active-now', startAt: new Date(NOW.getTime() - 2 * HOUR), endAt: new Date(NOW.getTime() + HOUR) };
  const inactive = {
    id: 'inactive',
    startAt: new Date(NOW.getTime() - HOUR),
    endAt: new Date(NOW.getTime() + HOUR),
    isActive: false,
  };

  await t.test('running sales come first, then upcoming, then ended, then inactive', () => {
    const sorted = sortFlashSalesForLanding([ended, upcoming, activeLater, inactive, activeNow], NOW);
    assert.deepStrictEqual(
      sorted.map((sale) => sale.id),
      ['active-now', 'active-later', 'upcoming', 'ended', 'inactive']
    );
  });

  await t.test('an invalid window is pushed to the end instead of throwing', () => {
    const broken = { id: 'broken', startAt: new Date('x'), endAt: new Date('y') };
    const sorted = sortFlashSalesForLanding([broken, activeNow], NOW);
    assert.deepStrictEqual(sorted.map((sale) => sale.id), ['active-now', 'broken']);
  });

  await t.test('only active and upcoming are publicly visible', () => {
    assert.strictEqual(isPubliclyVisibleFlashSale(activeNow, NOW), true);
    assert.strictEqual(isPubliclyVisibleFlashSale(upcoming, NOW), true);
    assert.strictEqual(isPubliclyVisibleFlashSale(ended, NOW), false);
    assert.strictEqual(isPubliclyVisibleFlashSale(inactive, NOW), false);
  });

  await t.test('an invalid window is not publicly visible', () => {
    assert.strictEqual(
      isPubliclyVisibleFlashSale({ startAt: 'x', endAt: 'y' }, NOW),
      false
    );
  });
});
