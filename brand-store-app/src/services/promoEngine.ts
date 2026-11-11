export type DiscountType = 'percentage' | 'fixed';

export interface PromoRule {
  code: string;
  discountType: DiscountType;
  discountValue: number;
  minOrderAmount?: number | null;
  maxDiscount?: number | null;
  startDate: Date;
  endDate: Date;
  isActive: boolean;
  usageLimit?: number | null;
  usageCount?: number | null;
}

export type PromoRejection =
  | 'INACTIVE'
  | 'NOT_STARTED'
  | 'EXPIRED'
  | 'MIN_ORDER_NOT_MET'
  | 'USAGE_LIMIT_REACHED'
  | 'INVALID_RULE';

export interface PromoEvaluation {
  code: string;
  valid: boolean;
  discountAmount: number;
  reason?: PromoRejection;
}

export interface CartTotals {
  subtotal: number;
  discountTotal: number;
  taxableAmount: number;
  taxAmount: number;
  grandTotal: number;
  appliedPromos: string[];
  rejectedPromos: Array<{ code: string; reason: PromoRejection }>;
}

export function roundCurrency(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100) / 100;
}

export function evaluatePromo(
  promo: PromoRule,
  subtotal: number,
  now: Date = new Date()
): PromoEvaluation {
  const reject = (reason: PromoRejection): PromoEvaluation => ({
    code: promo.code,
    valid: false,
    discountAmount: 0,
    reason,
  });

  if (!Number.isFinite(promo.discountValue) || promo.discountValue <= 0)
    return reject('INVALID_RULE');
  if (promo.discountType !== 'percentage' && promo.discountType !== 'fixed')
    return reject('INVALID_RULE');
  if (!promo.isActive) return reject('INACTIVE');
  if (promo.startDate && now < promo.startDate) return reject('NOT_STARTED');
  if (promo.endDate && now > promo.endDate) return reject('EXPIRED');
  if (promo.usageLimit != null && (promo.usageCount ?? 0) >= promo.usageLimit)
    return reject('USAGE_LIMIT_REACHED');

  const minimum = promo.minOrderAmount ?? 0;
  if (subtotal < minimum) return reject('MIN_ORDER_NOT_MET');

  let discount =
    promo.discountType === 'percentage'
      ? (subtotal * promo.discountValue) / 100
      : promo.discountValue;

  if (promo.maxDiscount != null && promo.maxDiscount > 0) {
    discount = Math.min(discount, promo.maxDiscount);
  }

  discount = Math.min(discount, subtotal);

  return { code: promo.code, valid: true, discountAmount: roundCurrency(discount) };
}

export interface ComputeTotalsInput {
  subtotal: number;
  promos?: PromoRule[];
  taxPercent?: number;
  shippingAmount?: number;
  now?: Date;
}

/**
 * Recalculates cart totals: promo discounts first, then tax on the discounted amount,
 * then shipping added on top (CRT-006).
 */
export function computeCartTotals(input: ComputeTotalsInput): CartTotals {
  const subtotal = Math.max(0, roundCurrency(input.subtotal));
  const now = input.now ?? new Date();
  const promos = input.promos ?? [];
  const taxPercent = Math.max(0, input.taxPercent ?? 0);
  const shippingAmount = Math.max(0, roundCurrency(input.shippingAmount ?? 0));

  const appliedPromos: string[] = [];
  const rejectedPromos: Array<{ code: string; reason: PromoRejection }> = [];

  let discountTotal = 0;
  for (const promo of promos) {
    const evaluation = evaluatePromo(promo, subtotal, now);
    if (!evaluation.valid) {
      rejectedPromos.push({ code: promo.code, reason: evaluation.reason ?? 'INVALID_RULE' });
      continue;
    }
    const remaining = subtotal - discountTotal;
    const applied = Math.min(evaluation.discountAmount, remaining);
    if (applied > 0) {
      discountTotal += applied;
      appliedPromos.push(promo.code);
    }
  }

  discountTotal = roundCurrency(Math.min(discountTotal, subtotal));
  const taxableAmount = roundCurrency(subtotal - discountTotal);
  const taxAmount = roundCurrency((taxableAmount * taxPercent) / 100);
  const grandTotal = roundCurrency(taxableAmount + taxAmount + shippingAmount);

  return {
    subtotal,
    discountTotal,
    taxableAmount,
    taxAmount,
    grandTotal,
    appliedPromos,
    rejectedPromos,
  };
}
