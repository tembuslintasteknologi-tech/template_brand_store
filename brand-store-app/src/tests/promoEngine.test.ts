import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  evaluatePromo,
  computeCartTotals,
  PromoRule,
  roundCurrency,
} from '../services/promoEngine.js';

const now = new Date('2026-11-10T10:00:00Z');

const basePromo = (overrides: Partial<PromoRule> = {}): PromoRule => ({
  code: 'HEMAT10',
  discountType: 'percentage',
  discountValue: 10,
  minOrderAmount: 0,
  maxDiscount: null,
  startDate: new Date('2026-11-01T00:00:00Z'),
  endDate: new Date('2026-11-30T23:59:59Z'),
  isActive: true,
  usageLimit: null,
  usageCount: 0,
  ...overrides,
});

describe('evaluatePromo', () => {
  it('applies a percentage discount', () => {
    const result = evaluatePromo(basePromo(), 200000, now);
    assert.strictEqual(result.valid, true);
    assert.strictEqual(result.discountAmount, 20000);
  });

  it('applies a fixed discount', () => {
    const result = evaluatePromo(
      basePromo({ discountType: 'fixed', discountValue: 25000 }),
      100000,
      now
    );
    assert.strictEqual(result.valid, true);
    assert.strictEqual(result.discountAmount, 25000);
  });

  it('caps a percentage discount with maxDiscount', () => {
    const result = evaluatePromo(basePromo({ maxDiscount: 15000 }), 500000, now);
    assert.strictEqual(result.valid, true);
    assert.strictEqual(result.discountAmount, 15000);
  });

  it('never discounts more than the subtotal', () => {
    const result = evaluatePromo(
      basePromo({ discountType: 'fixed', discountValue: 999999 }),
      50000,
      now
    );
    assert.strictEqual(result.valid, true);
    assert.strictEqual(result.discountAmount, 50000);
  });

  it('rejects an inactive promo', () => {
    const result = evaluatePromo(basePromo({ isActive: false }), 100000, now);
    assert.strictEqual(result.valid, false);
    assert.strictEqual(result.reason, 'INACTIVE');
  });

  it('rejects a promo that has not started', () => {
    const result = evaluatePromo(
      basePromo({ startDate: new Date('2026-12-01T00:00:00Z') }),
      100000,
      now
    );
    assert.strictEqual(result.reason, 'NOT_STARTED');
  });

  it('rejects an expired promo', () => {
    const result = evaluatePromo(
      basePromo({ endDate: new Date('2026-11-05T00:00:00Z') }),
      100000,
      now
    );
    assert.strictEqual(result.reason, 'EXPIRED');
  });

  it('rejects when the minimum order amount is not met', () => {
    const result = evaluatePromo(basePromo({ minOrderAmount: 150000 }), 100000, now);
    assert.strictEqual(result.reason, 'MIN_ORDER_NOT_MET');
  });

  it('rejects when the usage limit is reached', () => {
    const result = evaluatePromo(basePromo({ usageLimit: 5, usageCount: 5 }), 100000, now);
    assert.strictEqual(result.reason, 'USAGE_LIMIT_REACHED');
  });

  it('rejects an invalid rule', () => {
    assert.strictEqual(
      evaluatePromo(basePromo({ discountValue: 0 }), 100000, now).reason,
      'INVALID_RULE'
    );
    assert.strictEqual(
      evaluatePromo(basePromo({ discountType: 'bogus' as any }), 100000, now).reason,
      'INVALID_RULE'
    );
  });
});

describe('computeCartTotals', () => {
  it('applies discount, tax and shipping in the right order', () => {
    const totals = computeCartTotals({
      subtotal: 200000,
      promos: [basePromo()],
      taxPercent: 11,
      shippingAmount: 18000,
      now,
    });

    assert.strictEqual(totals.discountTotal, 20000);
    assert.strictEqual(totals.taxableAmount, 180000);
    assert.strictEqual(totals.taxAmount, 19800);
    assert.strictEqual(totals.grandTotal, 217800);
    assert.deepStrictEqual(totals.appliedPromos, ['HEMAT10']);
  });

  it('stacks promos without discounting below zero', () => {
    const totals = computeCartTotals({
      subtotal: 100000,
      promos: [
        basePromo({ code: 'A', discountType: 'fixed', discountValue: 60000 }),
        basePromo({ code: 'B', discountType: 'fixed', discountValue: 60000 }),
      ],
      taxPercent: 0,
      now,
    });

    assert.strictEqual(totals.discountTotal, 100000);
    assert.strictEqual(totals.taxableAmount, 0);
    assert.strictEqual(totals.grandTotal, 0);
    assert.deepStrictEqual(totals.appliedPromos, ['A', 'B']);
  });

  it('reports rejected promos with reasons', () => {
    const totals = computeCartTotals({
      subtotal: 50000,
      promos: [
        basePromo({ code: 'MIN', minOrderAmount: 100000 }),
        basePromo({ code: 'OFF', isActive: false }),
      ],
      now,
    });

    assert.deepStrictEqual(totals.rejectedPromos, [
      { code: 'MIN', reason: 'MIN_ORDER_NOT_MET' },
      { code: 'OFF', reason: 'INACTIVE' },
    ]);
    assert.strictEqual(totals.discountTotal, 0);
  });

  it('handles an empty cart', () => {
    const totals = computeCartTotals({ subtotal: 0, taxPercent: 11, shippingAmount: 0, now });
    assert.strictEqual(totals.grandTotal, 0);
    assert.strictEqual(totals.taxAmount, 0);
  });

  it('rounds currencies to two decimals', () => {
    assert.strictEqual(roundCurrency(10.005), 10.01);
    assert.strictEqual(roundCurrency(Number.NaN), 0);

    const totals = computeCartTotals({
      subtotal: 33333,
      promos: [basePromo({ discountValue: 7.5 })],
      taxPercent: 11,
      now,
    });
    // 33333 * 7.5% = 2499.975 -> 2499.98, taxable 30833.02, tax 3391.63, grand total 34224.65
    assert.strictEqual(totals.discountTotal, 2499.98);
    assert.strictEqual(totals.taxableAmount, 30833.02);
    assert.strictEqual(totals.taxAmount, 3391.63);
    assert.strictEqual(totals.grandTotal, 34224.65);
  });
});
