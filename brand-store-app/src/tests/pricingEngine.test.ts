import test from 'node:test';
import assert from 'node:assert';
import {
  evaluatePricingRule,
  isPricingRuleLive,
  matchesPricingScope,
  priceLines,
  resolveLinePrice,
  resolveTierPercent,
  roundMoney,
  selectBestPricingRule,
  validatePricingRuleInput,
  type PricingRule,
} from '../services/pricing/pricingEngine.js';
import { normalizePricingRuleRow } from '../services/pricing/pricingRepository.js';

const now = new Date('2026-11-17T12:00:00.000Z');

function rule(overrides: Partial<PricingRule> = {}): PricingRule {
  return {
    id: 'rule-1',
    name: 'Aturan',
    type: 'dynamic',
    percentOff: 10,
    isActive: true,
    priority: 0,
    ...overrides,
  };
}

test('isPricingRuleLive honours the active flag and the time window', () => {
  assert.strictEqual(isPricingRuleLive(rule(), now), true);
  assert.strictEqual(isPricingRuleLive(rule({ isActive: false }), now), false);
  assert.strictEqual(isPricingRuleLive(rule({ startAt: '2026-11-17T10:00:00.000Z' }), now), true);
  assert.strictEqual(isPricingRuleLive(rule({ startAt: '2026-11-17T13:00:00.000Z' }), now), false);
  assert.strictEqual(isPricingRuleLive(rule({ endAt: '2026-11-17T11:00:00.000Z' }), now), false);
  assert.strictEqual(isPricingRuleLive(rule({ startAt: new Date('2026-11-01T00:00:00Z') }), now), true);
});

test('matchesPricingScope treats an empty field as all products and requires filled fields to match', () => {
  const context = { productId: 'p-1', variantId: 'v-1', categoryId: 'c-1', quantity: 2 };

  assert.strictEqual(matchesPricingScope(rule(), context), true);
  assert.strictEqual(matchesPricingScope(rule({ productId: 'p-1' }), context), true);
  assert.strictEqual(matchesPricingScope(rule({ productId: 'p-2' }), context), false);
  assert.strictEqual(matchesPricingScope(rule({ variantId: 'v-1' }), context), true);
  assert.strictEqual(matchesPricingScope(rule({ variantId: 'v-9' }), context), false);
  assert.strictEqual(matchesPricingScope(rule({ categoryId: 'c-1' }), context), true);
  assert.strictEqual(matchesPricingScope(rule({ categoryId: 'c-9' }), context), false);
  assert.strictEqual(matchesPricingScope(rule({ categoryId: 'c-1', productId: 'p-9' }), context), false);
});

test('resolveTierPercent uses the highest reached bracket and skips malformed tiers', () => {
  const tiers = [
    { minQuantity: 1, percentOff: 2 },
    { minQuantity: 10, percentOff: 5 },
    { minQuantity: 50, percentOff: 9 },
  ];

  assert.strictEqual(resolveTierPercent(tiers, 0), null);
  assert.strictEqual(resolveTierPercent(tiers, 1), 2);
  assert.strictEqual(resolveTierPercent(tiers, 9), 2);
  assert.strictEqual(resolveTierPercent(tiers, 10), 5);
  assert.strictEqual(resolveTierPercent(tiers, 49), 5);
  assert.strictEqual(resolveTierPercent(tiers, 500), 9);

  const messy = [
    { minQuantity: 0, percentOff: 5 },
    { minQuantity: 5, percentOff: 0 },
    { minQuantity: 6, percentOff: 120 },
    { minQuantity: 7, percentOff: 4 },
  ] as any;
  assert.strictEqual(resolveTierPercent(messy, 100), 4);
  assert.strictEqual(resolveTierPercent([], 10), null);
  assert.strictEqual(resolveTierPercent(null, 10), null);
});

test('evaluatePricingRule returns typed rejections instead of throwing', () => {
  const context = { productId: 'p-1', quantity: 5, customerGroups: ['wholesale'] };

  assert.strictEqual(evaluatePricingRule(rule(), context, now).valid, true);
  assert.strictEqual(evaluatePricingRule(rule({ isActive: false }), context, now).reason, 'INACTIVE');
  assert.strictEqual(
    evaluatePricingRule(rule({ startAt: '2026-12-01T00:00:00Z' }), context, now).reason,
    'NOT_STARTED'
  );
  assert.strictEqual(
    evaluatePricingRule(rule({ endAt: '2026-11-01T00:00:00Z' }), context, now).reason,
    'EXPIRED'
  );
  assert.strictEqual(evaluatePricingRule(rule({ type: 'bogus' }), context, now).reason, 'UNKNOWN_TYPE');
  assert.strictEqual(
    evaluatePricingRule(rule({ productId: 'p-2' }), context, now).reason,
    'OUT_OF_SCOPE'
  );
  assert.strictEqual(evaluatePricingRule(rule({ percentOff: 0 }), context, now).reason, 'INVALID_RULE');
  assert.strictEqual(evaluatePricingRule(rule({ percentOff: 150 }), context, now).reason, 'INVALID_RULE');
});

test('evaluatePricingRule enforces customer group membership', () => {
  const groupRule = rule({ type: 'customer_group', customerGroup: 'wholesale', percentOff: 15 });
  const matching = evaluatePricingRule(groupRule, { productId: 'p-1', quantity: 1, customerGroups: ['wholesale'] }, now);
  const missing = evaluatePricingRule(groupRule, { productId: 'p-1', quantity: 1, customerGroups: ['retail'] }, now);
  const anonymous = evaluatePricingRule(groupRule, { productId: 'p-1', quantity: 1 }, now);

  assert.strictEqual(matching.valid, true);
  assert.strictEqual(matching.percentOff, 15);
  assert.strictEqual(missing.reason, 'GROUP_NOT_MATCHED');
  assert.strictEqual(anonymous.reason, 'GROUP_NOT_MATCHED');
});

test('evaluatePricingRule resolves the tier for the requested quantity', () => {
  const tiered = rule({
    type: 'tiered',
    percentOff: null,
    tiers: [
      { minQuantity: 1, percentOff: 3 },
      { minQuantity: 12, percentOff: 8 },
    ],
  });

  assert.strictEqual(evaluatePricingRule(tiered, { productId: 'p-1', quantity: 11 }, now).percentOff, 3);
  assert.strictEqual(evaluatePricingRule(tiered, { productId: 'p-1', quantity: 12 }, now).percentOff, 8);
  assert.strictEqual(evaluatePricingRule(tiered, { productId: 'p-1', quantity: 100 }, now).percentOff, 8);
});

test('selectBestPricingRule never stacks discounts and breaks ties deterministically', () => {
  const evaluations = [
    evaluatePricingRule(rule({ id: 'a', name: 'A', percentOff: 10, priority: 5 }), { productId: 'p', quantity: 1 }, now),
    evaluatePricingRule(rule({ id: 'b', name: 'B', percentOff: 20, priority: 1 }), { productId: 'p', quantity: 1 }, now),
    evaluatePricingRule(rule({ id: 'c', name: 'C', percentOff: 5 }), { productId: 'p', quantity: 1, customerGroups: [] }, now),
  ];

  assert.strictEqual(selectBestPricingRule(evaluations)?.ruleId, 'b');
  assert.strictEqual(selectBestPricingRule(evaluations)?.percentOff, 20);

  const tie = [
    evaluatePricingRule(rule({ id: 'z', name: 'Zulu', percentOff: 10, priority: 2 }), { productId: 'p', quantity: 1 }, now),
    evaluatePricingRule(rule({ id: 'y', name: 'Alpha', percentOff: 10, priority: 2 }), { productId: 'p', quantity: 1 }, now),
    evaluatePricingRule(rule({ id: 'x', name: 'Bravo', percentOff: 10, priority: 9 }), { productId: 'p', quantity: 1 }, now),
  ];

  // Priority breaks the percentage tie before the name does.
  assert.strictEqual(selectBestPricingRule(tie)?.ruleId, 'x');

  const nameTie = [
    evaluatePricingRule(rule({ id: 'b', name: 'Bravo', percentOff: 10 }), { productId: 'p', quantity: 1 }, now),
    evaluatePricingRule(rule({ id: 'a', name: 'Alpha', percentOff: 10 }), { productId: 'p', quantity: 1 }, now),
  ];
  assert.strictEqual(selectBestPricingRule(nameTie)?.ruleId, 'a');

  assert.strictEqual(selectBestPricingRule([]), null);
  assert.strictEqual(selectBestPricingRule([evaluatePricingRule(rule({ isActive: false }), { productId: 'p', quantity: 1 }, now)]), null);
});

test('resolveLinePrice rounds each line and records the applied rule', () => {
  const line = resolveLinePrice(
    199.99,
    { productId: 'p-1', quantity: 3, customerGroups: [] },
    [rule({ name: 'Diskon 12.5', percentOff: 12.5 })]
  );

  assert.strictEqual(line.basePrice, 199.99);
  assert.strictEqual(line.unitPrice, 174.99);
  assert.strictEqual(line.quantity, 3);
  assert.strictEqual(line.lineTotal, 524.97);
  assert.strictEqual(line.appliedRule?.percentOff, 12.5);
  assert.strictEqual(line.rejectedRules.length, 0);

  const undiscounted = resolveLinePrice(10, { productId: 'p-1', quantity: 2 });
  assert.strictEqual(undiscounted.unitPrice, 10);
  assert.strictEqual(undiscounted.lineTotal, 20);
  assert.strictEqual(undiscounted.appliedRule, null);
});

test('priceLines sums base and discounted totals without stacking rules', () => {
  const cart = priceLines(
    [
      { productId: 'p-1', quantity: 2, basePrice: 100, categoryId: 'c-1' },
      { productId: 'p-2', quantity: 1, basePrice: 50 },
    ],
    [
      rule({ id: 'cat', name: 'Kategori', percentOff: 10, categoryId: 'c-1', priority: 1 }),
      rule({ id: 'global', name: 'Global', percentOff: 5, priority: 2 }),
    ],
    { now }
  );

  assert.strictEqual(cart.baseSubtotal, 250);
  assert.strictEqual(cart.itemsTotal, 227.5);
  assert.strictEqual(cart.discountTotal, 22.5);
  assert.strictEqual(cart.lines[0].appliedRule?.id, 'cat');
  assert.strictEqual(cart.lines[1].appliedRule?.id, 'global');
});

test('roundMoney clamps invalid input to zero and keeps two decimals', () => {
  assert.strictEqual(roundMoney(1.005), 1.01);
  assert.strictEqual(roundMoney(1.004), 1);
  assert.strictEqual(roundMoney(Number.NaN), 0);
  assert.strictEqual(roundMoney(Number.POSITIVE_INFINITY), 0);
});

test('validatePricingRuleInput rejects incomplete or contradictory rules', () => {
  assert.deepStrictEqual(validatePricingRuleInput({ name: 'A', type: 'dynamic', percentOff: 10 }), []);
  assert.deepStrictEqual(validatePricingRuleInput({ name: 'A', type: 'dynamic' }), [
    'percentOff wajib diisi antara 0 dan 100 untuk dynamic',
  ]);
  assert.deepStrictEqual(
    validatePricingRuleInput({ name: 'A', type: 'customer_group', percentOff: 10 }),
    ['customerGroup wajib diisi untuk customer_group']
  );
  assert.deepStrictEqual(
    validatePricingRuleInput({ name: 'A', type: 'tiered', tiers: [] }),
    ['tiers wajib berisi minimal satu bracket untuk tiered']
  );
  assert.deepStrictEqual(
    validatePricingRuleInput({
      name: 'A',
      type: 'tiered',
      tiers: [
        { minQuantity: 5, percentOff: 5 },
        { minQuantity: 5, percentOff: 6 },
      ],
    }),
    ['tiers[1].minQuantity duplikat', 'tiers harus urut naik berdasarkan minQuantity']
  );
  assert.deepStrictEqual(
    validatePricingRuleInput({
      name: 'A',
      type: 'dynamic',
      percentOff: 10,
      startAt: '2026-11-20T00:00:00Z',
      endAt: '2026-11-10T00:00:00Z',
    }),
    ['startAt harus lebih awal dari endAt']
  );
  // A type-only patch cannot know the resulting percentage, so the validator asks for it.
  assert.deepStrictEqual(validatePricingRuleInput({ type: 'dynamic' }, { partial: true }), [
    'percentOff wajib diisi antara 0 dan 100 untuk dynamic',
  ]);
  // A bare percentage on a patch is still range checked before the type is known.
  assert.deepStrictEqual(validatePricingRuleInput({ percentOff: 500 }, { partial: true }), [
    'percentOff harus antara 0 dan 100',
  ]);
  assert.deepStrictEqual(validatePricingRuleInput({ percentOff: 25 }, { partial: true }), []);
});

test('normalizePricingRuleRow converts decimal strings and json tiers for the engine', () => {
  const normalized = normalizePricingRuleRow({
    id: 'r-1',
    name: 'Grosir',
    type: 'tiered',
    percentOff: null,
    tiers: [
      { minQuantity: '12', percentOff: '8' },
      { minQuantity: 'bad', percentOff: 4 },
    ],
    priority: '3',
    isActive: true,
  });

  assert.strictEqual(normalized.id, 'r-1');
  assert.deepStrictEqual(normalized.tiers, [{ minQuantity: 12, percentOff: 8 }]);
  assert.strictEqual(normalized.priority, 3);
  assert.strictEqual(normalized.percentOff, null);
});

test('an inactive rule can never win, even with the largest discount', () => {
  const line = resolveLinePrice(
    100,
    { productId: 'p-1', quantity: 1, now },
    [
      rule({ id: 'off', name: 'Nonaktif', percentOff: 90, isActive: false }),
      rule({ id: 'on', name: 'Aktif', percentOff: 5 }),
    ]
  );

  assert.strictEqual(line.unitPrice, 95);
  assert.strictEqual(line.appliedRule?.id, 'on');
  assert.ok(line.rejectedRules.some((item) => item.id === 'off'));
});
