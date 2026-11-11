import { test } from 'node:test';
import assert from 'node:assert';
import { computeCartTotals, PromoRule } from '../services/promoEngine.js';

test('promos stack correctly', () => {
  const promos: PromoRule[] = [
    {
      code: 'TEN-PERCENT',
      discountType: 'percentage',
      discountValue: 10,
      startDate: new Date('2026-01-01'),
      endDate: new Date('2026-12-31'),
      isActive: true,
    },
    {
      code: 'FIXED-50',
      discountType: 'fixed',
      discountValue: 50,
      startDate: new Date('2026-01-01'),
      endDate: new Date('2026-12-31'),
      isActive: true,
    }
  ];

  const subtotal = 1000;
  const totals = computeCartTotals({ subtotal, promos });
  
  // 10% of 1000 = 100. Remaining: 900.
  // Then fixed 50. Discount total = 150.
  assert.strictEqual(totals.discountTotal, 150);
  assert.strictEqual(totals.appliedPromos.length, 2);
});
