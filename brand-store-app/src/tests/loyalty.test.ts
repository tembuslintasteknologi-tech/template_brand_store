import test from 'node:test';
import assert from 'node:assert';
import {
  DEFAULT_LOYALTY_PROGRAM,
  LOYALTY_TIER_ORDER,
  LoyaltyError,
  applyPointDelta,
  applyTierDiscount,
  assertEarnSource,
  assertLoyaltyProgramConfig,
  assertPoints,
  computeEarnedPoints,
  evaluateRedemption,
  nextTierProgress,
  qualifiesForFreeShipping,
  resolveTier,
  tierBenefits,
  type LoyaltyProgramConfig,
} from '../services/loyalty/loyaltyService.js';

function customProgram(): LoyaltyProgramConfig {
  return {
    tiers: [
      { tier: 'bronze', minLifetimePoints: 0, discountPercent: 0, freeShippingMinAmount: null },
      { tier: 'silver', minLifetimePoints: 100, discountPercent: 1, freeShippingMinAmount: 100000 },
      { tier: 'gold', minLifetimePoints: 500, discountPercent: 3, freeShippingMinAmount: 50000 },
      { tier: 'platinum', minLifetimePoints: 1000, discountPercent: 6, freeShippingMinAmount: 0 },
    ],
    earn: { rupiahPerPoint: 500, reviewPoints: 5, referralPoints: 25 },
    redeem: { currencyPerPoint: 50, minPoints: 20 },
  };
}

test('loyalty program config validation', async (t) => {
  await t.test('the default program passes validation unchanged', () => {
    const parsed = assertLoyaltyProgramConfig(DEFAULT_LOYALTY_PROGRAM);
    assert.deepStrictEqual(parsed, DEFAULT_LOYALTY_PROGRAM);
  });

  await t.test('the default program has all four tiers in order', () => {
    assert.deepStrictEqual(
      DEFAULT_LOYALTY_PROGRAM.tiers.map((rule) => rule.tier),
      LOYALTY_TIER_ORDER
    );
    assert.strictEqual(DEFAULT_LOYALTY_PROGRAM.tiers[0].minLifetimePoints, 0);
  });

  await t.test('rejects a non-object', () => {
    assert.throws(
      () => assertLoyaltyProgramConfig(null),
      (err: unknown) => err instanceof LoyaltyError && err.code === 'INVALID_TIER'
    );
    assert.throws(() => assertLoyaltyProgramConfig('bronze'));
  });

  await t.test('rejects a missing tier', () => {
    const broken = customProgram();
    broken.tiers.pop();
    assert.throws(
      () => assertLoyaltyProgramConfig(broken),
      (err: unknown) => err instanceof LoyaltyError && err.code === 'INVALID_TIER'
    );
  });

  await t.test('rejects a duplicate tier', () => {
    const program = customProgram();
    program.tiers[1].tier = 'gold';
    assert.throws(
      () => assertLoyaltyProgramConfig(program),
      (err: unknown) => err instanceof LoyaltyError && err.code === 'INVALID_TIER'
    );
  });

  await t.test('rejects an unknown tier name', () => {
    const program: any = customProgram();
    program.tiers[2].tier = 'diamond';
    assert.throws(
      () => assertLoyaltyProgramConfig(program),
      (err: unknown) => err instanceof LoyaltyError && err.code === 'INVALID_TIER'
    );
  });

  await t.test('requires bronze to start at zero', () => {
    const program = customProgram();
    program.tiers[0].minLifetimePoints = 10;
    assert.throws(
      () => assertLoyaltyProgramConfig(program),
      (err: unknown) => err instanceof LoyaltyError && err.code === 'INVALID_TIER_THRESHOLD'
    );
  });

  await t.test('rejects duplicate thresholds, since two tiers cannot start at the same point', () => {
    const equal = customProgram();
    equal.tiers[2].minLifetimePoints = 100;
    assert.throws(
      () => assertLoyaltyProgramConfig(equal),
      (err: unknown) => err instanceof LoyaltyError && err.code === 'INVALID_TIER_THRESHOLD'
    );
  });

  await t.test('accepts out of order thresholds and normalises them, by design', () => {
    const descending = customProgram();
    descending.tiers[1].minLifetimePoints = 500;
    descending.tiers[2].minLifetimePoints = 100;
    const parsed = assertLoyaltyProgramConfig(descending);
    assert.deepStrictEqual(parsed.tiers.map((rule) => rule.tier), [
      'bronze',
      'gold',
      'silver',
      'platinum',
    ]);
    assert.deepStrictEqual(
      parsed.tiers.map((rule) => rule.minLifetimePoints),
      [0, 100, 500, 1000]
    );
  });

  await t.test('sorts tiers by threshold before returning', () => {
    const program = customProgram();
    const shuffled = {
      ...program,
      tiers: [program.tiers[2], program.tiers[0], program.tiers[3], program.tiers[1]],
    };
    const parsed = assertLoyaltyProgramConfig(shuffled);
    assert.deepStrictEqual(
      parsed.tiers.map((rule) => rule.tier),
      ['bronze', 'silver', 'gold', 'platinum']
    );
  });

  await t.test('rejects a discount outside 0 to 100', () => {
    const high = customProgram();
    high.tiers[2].discountPercent = 101;
    assert.throws(
      () => assertLoyaltyProgramConfig(high),
      (err: unknown) => err instanceof LoyaltyError && err.code === 'INVALID_DISCOUNT'
    );

    const negative = customProgram();
    negative.tiers[2].discountPercent = -1;
    assert.throws(
      () => assertLoyaltyProgramConfig(negative),
      (err: unknown) => err instanceof LoyaltyError && err.code === 'INVALID_DISCOUNT'
    );
  });

  await t.test('rejects a fractional threshold', () => {
    const program = customProgram();
    program.tiers[1].minLifetimePoints = 99.5;
    assert.throws(
      () => assertLoyaltyProgramConfig(program),
      (err: unknown) => err instanceof LoyaltyError && err.code === 'INVALID_TIER_THRESHOLD'
    );
  });

  await t.test('rejects broken earn and redeem rules', () => {
    const zeroPerPoint = customProgram();
    zeroPerPoint.earn.rupiahPerPoint = 0;
    assert.throws(
      () => assertLoyaltyProgramConfig(zeroPerPoint),
      (err: unknown) => err instanceof LoyaltyError && err.code === 'INVALID_EARN_RULE'
    );

    const negativeReview = customProgram();
    negativeReview.earn.reviewPoints = -1;
    assert.throws(
      () => assertLoyaltyProgramConfig(negativeReview),
      (err: unknown) => err instanceof LoyaltyError && err.code === 'INVALID_EARN_RULE'
    );

    const zeroCurrency = customProgram();
    zeroCurrency.redeem.currencyPerPoint = 0;
    assert.throws(
      () => assertLoyaltyProgramConfig(zeroCurrency),
      (err: unknown) => err instanceof LoyaltyError && err.code === 'INVALID_REDEEM_RULE'
    );
  });
});

test('tier resolution', async (t) => {
  await t.test('bronze covers zero up to just below silver', () => {
    assert.strictEqual(resolveTier(0), 'bronze');
    assert.strictEqual(resolveTier(499), 'bronze');
  });

  await t.test('exact thresholds are inclusive', () => {
    assert.strictEqual(resolveTier(500), 'silver');
    assert.strictEqual(resolveTier(2000), 'gold');
    assert.strictEqual(resolveTier(5000), 'platinum');
  });

  await t.test('just below a threshold stays on the lower tier', () => {
    assert.strictEqual(resolveTier(1999), 'silver');
    assert.strictEqual(resolveTier(4999), 'gold');
  });

  await t.test('huge lifetimes stay platinum', () => {
    assert.strictEqual(resolveTier(1_000_000), 'platinum');
  });

  await t.test('negative and non-finite input falls back to bronze', () => {
    assert.strictEqual(resolveTier(-50), 'bronze');
    assert.strictEqual(resolveTier(Number.NaN), 'bronze');
  });

  await t.test('a custom program is respected', () => {
    assert.strictEqual(resolveTier(99, customProgram()), 'bronze');
    assert.strictEqual(resolveTier(100, customProgram()), 'silver');
    assert.strictEqual(resolveTier(500, customProgram()), 'gold');
  });
});

test('tier benefits', async (t) => {
  await t.test('bronze has no discount and no free shipping', () => {
    const benefits = tierBenefits('bronze');
    assert.strictEqual(benefits.discountPercent, 0);
    assert.strictEqual(benefits.freeShippingMinAmount, null);
    assert.strictEqual(benefits.freeShippingAlways, false);
  });

  await t.test('silver and gold carry their thresholds', () => {
    assert.strictEqual(tierBenefits('silver').discountPercent, 2);
    assert.strictEqual(tierBenefits('silver').freeShippingMinAmount, 200000);
    assert.strictEqual(tierBenefits('gold').discountPercent, 5);
    assert.strictEqual(tierBenefits('gold').freeShippingMinAmount, 150000);
  });

  await t.test('platinum always ships free', () => {
    const benefits = tierBenefits('platinum');
    assert.strictEqual(benefits.discountPercent, 8);
    assert.strictEqual(benefits.freeShippingMinAmount, 0);
    assert.strictEqual(benefits.freeShippingAlways, true);
  });

  await t.test('an unknown tier is rejected', () => {
    assert.throws(
      () => tierBenefits('diamond' as any),
      (err: unknown) => err instanceof LoyaltyError && err.code === 'INVALID_TIER'
    );
  });
});

test('progress toward the next tier', async (t) => {
  await t.test('a new account starts at bronze and needs 500 points', () => {
    const progress = nextTierProgress(0);
    assert.strictEqual(progress.currentTier, 'bronze');
    assert.strictEqual(progress.nextTier, 'silver');
    assert.strictEqual(progress.pointsToNext, 500);
    assert.strictEqual(progress.progressPercent, 0);
  });

  await t.test('halfway through bronze is 50 percent', () => {
    const progress = nextTierProgress(250);
    assert.strictEqual(progress.progressPercent, 50);
    assert.strictEqual(progress.pointsToNext, 250);
  });

  await t.test('landing exactly on a tier restarts the bar', () => {
    const progress = nextTierProgress(500);
    assert.strictEqual(progress.currentTier, 'silver');
    assert.strictEqual(progress.nextTier, 'gold');
    assert.strictEqual(progress.pointsToNext, 1500);
    assert.strictEqual(progress.progressPercent, 0);
  });

  await t.test('gold to platinum span is measured from 2000 to 5000', () => {
    const progress = nextTierProgress(3500);
    assert.strictEqual(progress.currentTier, 'gold');
    assert.strictEqual(progress.progressPercent, 50);
    assert.strictEqual(progress.pointsToNext, 1500);
  });

  await t.test('platinum has no next tier', () => {
    const progress = nextTierProgress(6000);
    assert.strictEqual(progress.currentTier, 'platinum');
    assert.strictEqual(progress.nextTier, null);
    assert.strictEqual(progress.pointsToNext, null);
    assert.strictEqual(progress.progressPercent, 100);
  });

  await t.test('a custom program changes the maths', () => {
    const progress = nextTierProgress(50, customProgram());
    assert.strictEqual(progress.nextTier, 'silver');
    assert.strictEqual(progress.pointsToNext, 50);
    assert.strictEqual(progress.progressPercent, 50);
  });
});

test('points earning', async (t) => {
  await t.test('purchase earns one point per 1000 rupiah, rounded down', () => {
    assert.strictEqual(computeEarnedPoints({ source: 'purchase', orderTotal: 250000 }), 250);
    assert.strictEqual(computeEarnedPoints({ source: 'purchase', orderTotal: '999' }), 0);
    assert.strictEqual(computeEarnedPoints({ source: 'purchase', orderTotal: 1999 }), 1);
  });

  await t.test('purchase accepts a numeric string total', () => {
    assert.strictEqual(computeEarnedPoints({ source: 'purchase', orderTotal: '15000' }), 15);
  });

  await t.test('review and referral use flat amounts', () => {
    assert.strictEqual(computeEarnedPoints({ source: 'review' }), 10);
    assert.strictEqual(computeEarnedPoints({ source: 'referral' }), 50);
  });

  await t.test('a missing order total counts as zero, not an error', () => {
    assert.strictEqual(computeEarnedPoints({ source: 'purchase' }), 0);
  });

  await t.test('a negative total is rejected', () => {
    assert.throws(
      () => computeEarnedPoints({ source: 'purchase', orderTotal: -1000 }),
      (err: unknown) => err instanceof LoyaltyError && err.code === 'INVALID_AMOUNT'
    );
  });

  await t.test('an unknown source is rejected', () => {
    assert.throws(
      () => assertEarnSource('bonus'),
      (err: unknown) => err instanceof LoyaltyError && err.code === 'INVALID_SOURCE'
    );
  });

  await t.test('a custom earn rate applies', () => {
    assert.strictEqual(
      computeEarnedPoints({ source: 'purchase', orderTotal: 5000 }, customProgram()),
      10
    );
    assert.strictEqual(computeEarnedPoints({ source: 'review' }, customProgram()), 5);
  });
});

test('points redemption', async (t) => {
  await t.test('50 points become 5000 rupiah', () => {
    const decision = evaluateRedemption({ points: 50, balance: 120 });
    assert.strictEqual(decision.points, 50);
    assert.strictEqual(decision.discountAmount, 5000);
    assert.strictEqual(decision.balanceAfter, 70);
  });

  await t.test('the full balance can be redeemed', () => {
    const decision = evaluateRedemption({ points: 100, balance: 100 });
    assert.strictEqual(decision.discountAmount, 10000);
    assert.strictEqual(decision.balanceAfter, 0);
  });

  await t.test('below the minimum is rejected', () => {
    assert.throws(
      () => evaluateRedemption({ points: 49, balance: 100 }),
      (err: unknown) => err instanceof LoyaltyError && err.code === 'MIN_REDEEM_NOT_MET'
    );
  });

  await t.test('above the balance is rejected', () => {
    assert.throws(
      () => evaluateRedemption({ points: 200, balance: 100 }),
      (err: unknown) => err instanceof LoyaltyError && err.code === 'INSUFFICIENT_POINTS'
    );
  });

  await t.test('fractional or zero points are rejected', () => {
    assert.throws(() => evaluateRedemption({ points: 10.5, balance: 100 }));
    assert.throws(() => evaluateRedemption({ points: 0, balance: 100 }));
    assert.throws(() => evaluateRedemption({ points: -10, balance: 100 }));
  });

  await t.test('a custom program changes the conversion and the floor', () => {
    const decision = evaluateRedemption({ points: 20, balance: 20 }, customProgram());
    assert.strictEqual(decision.discountAmount, 1000);
    assert.strictEqual(decision.balanceAfter, 0);
    assert.throws(() => evaluateRedemption({ points: 19, balance: 100 }, customProgram()));
  });

  await t.test('assertPoints is shared by callers', () => {
    assert.strictEqual(assertPoints('25'), 25);
    assert.throws(
      () => assertPoints('dua puluh'),
      (err: unknown) => err instanceof LoyaltyError && err.code === 'INVALID_POINTS'
    );
  });
});

test('tier discount and free shipping helpers', async (t) => {
  await t.test('applies a whole percent', () => {
    assert.strictEqual(applyTierDiscount(100000, 5), 5000);
    assert.strictEqual(applyTierDiscount('200000', 2), 4000);
  });

  await t.test('rounds to two decimals', () => {
    assert.strictEqual(applyTierDiscount(9999, 5), 499.95);
  });

  await t.test('a zero discount or zero amount returns zero', () => {
    assert.strictEqual(applyTierDiscount(100000, 0), 0);
    assert.strictEqual(applyTierDiscount(0, 8), 0);
    assert.strictEqual(applyTierDiscount(-500, 8), 0);
  });

  await t.test('a discount can never exceed the amount', () => {
    assert.strictEqual(applyTierDiscount(1000, 100), 1000);
    assert.strictEqual(applyTierDiscount(1000, 150), 1000);
  });

  await t.test('a null threshold never ships free', () => {
    assert.strictEqual(qualifiesForFreeShipping(1_000_000, tierBenefits('bronze')), false);
  });

  await t.test('a zero threshold always ships free', () => {
    assert.strictEqual(qualifiesForFreeShipping(0, tierBenefits('platinum')), true);
  });

  await t.test('a numeric threshold is inclusive', () => {
    assert.strictEqual(qualifiesForFreeShipping(199999, tierBenefits('silver')), false);
    assert.strictEqual(qualifiesForFreeShipping(200000, tierBenefits('silver')), true);
  });
});

test('signed point adjustments', async (t) => {
  await t.test('credits and debits move the balance', () => {
    assert.strictEqual(applyPointDelta(100, 50), 150);
    assert.strictEqual(applyPointDelta(100, -30), 70);
  });

  await t.test('a debit cannot take the balance below zero', () => {
    assert.throws(
      () => applyPointDelta(10, -11),
      (err: unknown) => err instanceof LoyaltyError && err.code === 'INSUFFICIENT_POINTS'
    );
  });

  await t.test('a fractional delta is rejected', () => {
    assert.throws(
      () => applyPointDelta(100, 1.5),
      (err: unknown) => err instanceof LoyaltyError && err.code === 'INVALID_POINTS'
    );
  });
});
