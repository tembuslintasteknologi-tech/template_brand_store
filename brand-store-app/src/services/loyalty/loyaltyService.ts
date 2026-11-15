/**
 * Loyalty points and tier rules (LTY-001, LTY-002, LTY-003, LTY-004).
 *
 * Everything here is pure: no database, no clock, no environment. The repository composes
 * these helpers with Postgres writes, and the tests exercise them directly.
 *
 * Tier is derived from `lifetimePoints`, never stored as a decision. The account row keeps a
 * cached `tier` column so listings can filter without recomputing, but every write path
 * recomputes it through `resolveTier` so the cache cannot drift.
 */

import { roundCurrency } from '../promoEngine.js';

export type LoyaltyTier = 'bronze' | 'silver' | 'gold' | 'platinum';

export type LoyaltyEarnSource = 'purchase' | 'review' | 'referral';

export type LoyaltyTransactionType = 'earn' | 'redeem' | 'adjust' | 'expire';

export type LoyaltyErrorCode =
  | 'INVALID_TIER'
  | 'INVALID_TIER_THRESHOLD'
  | 'INVALID_DISCOUNT'
  | 'INVALID_EARN_RULE'
  | 'INVALID_REDEEM_RULE'
  | 'INVALID_POINTS'
  | 'INVALID_AMOUNT'
  | 'INVALID_SOURCE'
  | 'MIN_REDEEM_NOT_MET'
  | 'INSUFFICIENT_POINTS'
  | 'ACCOUNT_NOT_FOUND'
  | 'DUPLICATE_EARN';

export class LoyaltyError extends Error {
  readonly code: LoyaltyErrorCode;
  readonly status: number;

  constructor(code: LoyaltyErrorCode, message: string, status = 400) {
    super(message);
    this.name = 'LoyaltyError';
    this.code = code;
    this.status = status;
  }
}

export interface LoyaltyTierRule {
  tier: LoyaltyTier;
  minLifetimePoints: number;
  discountPercent: number;
  /** null means the tier gets no automatic free shipping. 0 means always free. */
  freeShippingMinAmount: number | null;
}

export interface LoyaltyEarnRules {
  /** Rupiah spent per one point. 1000 means Rp1.000 = 1 poin. */
  rupiahPerPoint: number;
  reviewPoints: number;
  referralPoints: number;
}

export interface LoyaltyRedeemRules {
  /** Rupiah value of one point when redeemed. 100 means 1 poin = Rp100. */
  currencyPerPoint: number;
  minPoints: number;
}

export interface LoyaltyProgramConfig {
  tiers: LoyaltyTierRule[];
  earn: LoyaltyEarnRules;
  redeem: LoyaltyRedeemRules;
}

export const LOYALTY_TIER_ORDER: LoyaltyTier[] = ['bronze', 'silver', 'gold', 'platinum'];

export const DEFAULT_LOYALTY_PROGRAM: LoyaltyProgramConfig = {
  tiers: [
    { tier: 'bronze', minLifetimePoints: 0, discountPercent: 0, freeShippingMinAmount: null },
    { tier: 'silver', minLifetimePoints: 500, discountPercent: 2, freeShippingMinAmount: 200000 },
    { tier: 'gold', minLifetimePoints: 2000, discountPercent: 5, freeShippingMinAmount: 150000 },
    { tier: 'platinum', minLifetimePoints: 5000, discountPercent: 8, freeShippingMinAmount: 0 },
  ],
  earn: { rupiahPerPoint: 1000, reviewPoints: 10, referralPoints: 50 },
  redeem: { currencyPerPoint: 100, minPoints: 50 },
};

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

/** Validates and normalises a program config. Throws LoyaltyError instead of returning null. */
export function assertLoyaltyProgramConfig(input: unknown): LoyaltyProgramConfig {
  if (input === null || typeof input !== 'object') {
    throw new LoyaltyError('INVALID_TIER', 'Konfigurasi loyalty harus berupa objek');
  }

  const raw = input as { tiers?: unknown; earn?: any; redeem?: any };
  if (!Array.isArray(raw.tiers) || raw.tiers.length !== LOYALTY_TIER_ORDER.length) {
    throw new LoyaltyError(
      'INVALID_TIER',
      'Konfigurasi tiers harus berisi tepat empat tier: bronze, silver, gold, platinum'
    );
  }

  const seen = new Set<string>();
  const tiers: LoyaltyTierRule[] = raw.tiers.map((rule) => {
    if (!rule || typeof rule !== 'object') {
      throw new LoyaltyError('INVALID_TIER', 'Setiap tier harus berupa objek');
    }
    const tier = rule.tier as LoyaltyTier;
    if (!LOYALTY_TIER_ORDER.includes(tier)) {
      throw new LoyaltyError('INVALID_TIER', `Tier tidak dikenal: ${String(rule.tier)}`);
    }
    if (seen.has(tier)) {
      throw new LoyaltyError('INVALID_TIER', `Tier duplikat: ${tier}`);
    }
    seen.add(tier);

    if (!isNonNegativeInteger(rule.minLifetimePoints)) {
      throw new LoyaltyError(
        'INVALID_TIER_THRESHOLD',
        `minLifetimePoints untuk ${tier} harus bilangan bulat >= 0`
      );
    }
    if (
      typeof rule.discountPercent !== 'number' ||
      !Number.isFinite(rule.discountPercent) ||
      rule.discountPercent < 0 ||
      rule.discountPercent > 100
    ) {
      throw new LoyaltyError(
        'INVALID_DISCOUNT',
        `discountPercent untuk ${tier} harus di antara 0 dan 100`
      );
    }
    if (
      rule.freeShippingMinAmount !== null &&
      rule.freeShippingMinAmount !== undefined &&
      (typeof rule.freeShippingMinAmount !== 'number' ||
        !Number.isFinite(rule.freeShippingMinAmount) ||
        rule.freeShippingMinAmount < 0)
    ) {
      throw new LoyaltyError(
        'INVALID_AMOUNT',
        `freeShippingMinAmount untuk ${tier} harus null atau angka >= 0`
      );
    }

    return {
      tier,
      minLifetimePoints: rule.minLifetimePoints,
      discountPercent: rule.discountPercent,
      freeShippingMinAmount:
        rule.freeShippingMinAmount === undefined ? null : rule.freeShippingMinAmount,
    };
  });

  const sorted = [...tiers].sort((a, b) => a.minLifetimePoints - b.minLifetimePoints);
  if (sorted[0].tier !== 'bronze' || sorted[0].minLifetimePoints !== 0) {
    throw new LoyaltyError('INVALID_TIER_THRESHOLD', 'Tier bronze harus mulai dari 0 poin');
  }
  for (let i = 1; i < sorted.length; i += 1) {
    if (sorted[i].minLifetimePoints <= sorted[i - 1].minLifetimePoints) {
      throw new LoyaltyError(
        'INVALID_TIER_THRESHOLD',
        'Ambang tier harus naik ketat, tidak boleh sama atau turun'
      );
    }
  }

  const earn = raw.earn;
  if (
    !earn ||
    !isPositiveInteger(earn.rupiahPerPoint) ||
    !isNonNegativeInteger(earn.reviewPoints) ||
    !isNonNegativeInteger(earn.referralPoints)
  ) {
    throw new LoyaltyError(
      'INVALID_EARN_RULE',
      'Aturan earn butuh rupiahPerPoint > 0 serta reviewPoints dan referralPoints >= 0'
    );
  }

  const redeem = raw.redeem;
  if (
    !redeem ||
    !isPositiveInteger(redeem.currencyPerPoint) ||
    !isNonNegativeInteger(redeem.minPoints)
  ) {
    throw new LoyaltyError(
      'INVALID_REDEEM_RULE',
      'Aturan redeem butuh currencyPerPoint > 0 dan minPoints >= 0'
    );
  }

  return { tiers: sorted, earn, redeem };
}

/** Highest tier whose threshold is reached. Negative lifetimes fall back to bronze. */
export function resolveTier(
  lifetimePoints: number,
  config: LoyaltyProgramConfig = DEFAULT_LOYALTY_PROGRAM
): LoyaltyTier {
  const points = Number.isFinite(lifetimePoints) ? lifetimePoints : 0;
  let resolved: LoyaltyTier = 'bronze';
  for (const rule of config.tiers) {
    if (points >= rule.minLifetimePoints) resolved = rule.tier;
  }
  return resolved;
}

export interface TierBenefits {
  tier: LoyaltyTier;
  discountPercent: number;
  freeShippingMinAmount: number | null;
  freeShippingAlways: boolean;
}

export function tierBenefits(
  tier: LoyaltyTier,
  config: LoyaltyProgramConfig = DEFAULT_LOYALTY_PROGRAM
): TierBenefits {
  const rule = config.tiers.find((entry) => entry.tier === tier);
  if (!rule) {
    throw new LoyaltyError('INVALID_TIER', `Tier tidak dikenal: ${tier}`);
  }
  return {
    tier: rule.tier,
    discountPercent: rule.discountPercent,
    freeShippingMinAmount: rule.freeShippingMinAmount,
    freeShippingAlways: rule.freeShippingMinAmount === 0,
  };
}

export interface TierProgress {
  currentTier: LoyaltyTier;
  nextTier: LoyaltyTier | null;
  pointsToNext: number | null;
  /** 0 to 100, measured from the current tier floor to the next tier floor. */
  progressPercent: number;
}

export function nextTierProgress(
  lifetimePoints: number,
  config: LoyaltyProgramConfig = DEFAULT_LOYALTY_PROGRAM
): TierProgress {
  const points = Number.isFinite(lifetimePoints) ? Math.max(0, lifetimePoints) : 0;
  const currentTier = resolveTier(points, config);
  const currentRule = config.tiers.find((rule) => rule.tier === currentTier)!;
  const nextRule = config.tiers.find((rule) => rule.minLifetimePoints > currentRule.minLifetimePoints);

  if (!nextRule) {
    return { currentTier, nextTier: null, pointsToNext: null, progressPercent: 100 };
  }

  const span = nextRule.minLifetimePoints - currentRule.minLifetimePoints;
  const travelled = points - currentRule.minLifetimePoints;
  const progressPercent =
    span <= 0 ? 100 : Math.min(100, Math.max(0, roundCurrency((travelled / span) * 100)));

  return {
    currentTier,
    nextTier: nextRule.tier,
    pointsToNext: Math.max(0, nextRule.minLifetimePoints - points),
    progressPercent,
  };
}

export function assertEarnSource(source: unknown): LoyaltyEarnSource {
  if (source === 'purchase' || source === 'review' || source === 'referral') {
    return source;
  }
  throw new LoyaltyError('INVALID_SOURCE', 'Sumber poin harus purchase, review, atau referral');
}

/**
 * Points earned for a source. Purchase uses the order total before shipping, because
 * shipping cost is not brand revenue. Rounding is floor so the brand never over-credits.
 */
export function computeEarnedPoints(
  input: { source: LoyaltyEarnSource; orderTotal?: number | string | null },
  config: LoyaltyProgramConfig = DEFAULT_LOYALTY_PROGRAM
): number {
  const source = assertEarnSource(input.source);

  if (source === 'review') return config.earn.reviewPoints;
  if (source === 'referral') return config.earn.referralPoints;

  const total = Number(input.orderTotal ?? 0);
  if (!Number.isFinite(total) || total < 0) {
    throw new LoyaltyError('INVALID_AMOUNT', 'orderTotal harus angka >= 0');
  }
  return Math.floor(total / config.earn.rupiahPerPoint);
}

export function assertPoints(value: unknown, code: LoyaltyErrorCode = 'INVALID_POINTS'): number {
  const points = typeof value === 'string' ? Number(value) : value;
  if (typeof points !== 'number' || !Number.isInteger(points) || points <= 0) {
    throw new LoyaltyError(code, 'Points harus bilangan bulat positif');
  }
  return points;
}

export interface RedeemDecision {
  points: number;
  discountAmount: number;
  balanceAfter: number;
}

/** Validates a redemption against the balance and the program floor. */
export function evaluateRedemption(
  input: { points: number | string; balance: number },
  config: LoyaltyProgramConfig = DEFAULT_LOYALTY_PROGRAM
): RedeemDecision {
  const points = assertPoints(input.points);
  const balance = Number.isFinite(input.balance) ? Math.max(0, input.balance) : 0;

  if (points < config.redeem.minPoints) {
    throw new LoyaltyError(
      'MIN_REDEEM_NOT_MET',
      `Minimal penukaran ${config.redeem.minPoints} poin`
    );
  }
  if (points > balance) {
    throw new LoyaltyError('INSUFFICIENT_POINTS', 'Saldo poin tidak cukup');
  }

  return {
    points,
    discountAmount: roundCurrency(points * config.redeem.currencyPerPoint),
    balanceAfter: balance - points,
  };
}

/** Tier discount applied to an order subtotal. Never returns a negative amount. */
export function applyTierDiscount(amount: number | string, discountPercent: number): number {
  const base = Number(amount);
  if (!Number.isFinite(base) || base <= 0) return 0;
  if (!Number.isFinite(discountPercent) || discountPercent <= 0) return 0;
  const percent = Math.min(100, discountPercent);
  return Math.min(roundCurrency(base), roundCurrency((base * percent) / 100));
}

/**
 * Free shipping decision for a tier. `null` threshold means the tier never gets it, while 0
 * means it always does.
 */
export function qualifiesForFreeShipping(
  amount: number | string,
  benefits: TierBenefits
): boolean {
  if (benefits.freeShippingMinAmount === null) return false;
  const base = Number(amount);
  if (!Number.isFinite(base)) return false;
  return base >= benefits.freeShippingMinAmount;
}

/** Applies a signed point delta with a floor of zero. Used by admin adjustment. */
export function applyPointDelta(balance: number, delta: number): number {
  const base = Number.isFinite(balance) ? Math.max(0, balance) : 0;
  if (!Number.isInteger(delta)) {
    throw new LoyaltyError('INVALID_POINTS', 'Delta poin harus bilangan bulat');
  }
  const next = base + delta;
  if (next < 0) {
    throw new LoyaltyError('INSUFFICIENT_POINTS', 'Penyesuaian akan membuat saldo negatif');
  }
  return next;
}
