/**
 * Pricing engine (PRC-002, PRC-003, PRC-004).
 *
 * Three rule families are supported and they share one resolver:
 * - `dynamic`: a percentage off valid inside a time window.
 * - `tiered`: a percentage off that depends on the quantity of the line. The tier with the
 *   highest `minQuantity` that the line reaches wins, which is how wholesale brackets are read.
 * - `customer_group`: a percentage off for buyers that belong to a named group.
 *
 * Discounts are never stacked on one line. The engine picks the single most favorable rule, so
 * two overlapping campaigns cannot multiply into a price the brand never approved. Ties are
 * broken deterministically: bigger percentage, then higher priority, then rule name and id, so
 * repeated quotes of the same cart always produce the same number.
 *
 * Everything here is pure. Database access lives in `pricingRepository.ts`.
 */

export const PRICING_RULE_TYPES = ['dynamic', 'tiered', 'customer_group'] as const;
export type PricingRuleType = (typeof PRICING_RULE_TYPES)[number];

export type PricingRejection =
  | 'INACTIVE'
  | 'NOT_STARTED'
  | 'EXPIRED'
  | 'UNKNOWN_TYPE'
  | 'OUT_OF_SCOPE'
  | 'GROUP_NOT_MATCHED'
  | 'INVALID_RULE';

export interface QuantityTier {
  minQuantity: number;
  percentOff: number;
}

/** The shape the engine consumes. Repository rows are normalized into this before use. */
export interface PricingRule {
  id?: string | null;
  name?: string | null;
  type: string;
  percentOff?: number | null;
  tiers?: QuantityTier[] | null;
  customerGroup?: string | null;
  productId?: string | null;
  variantId?: string | null;
  categoryId?: string | null;
  startAt?: Date | string | null;
  endAt?: Date | string | null;
  isActive?: boolean | null;
  priority?: number | null;
}

export interface PricingContext {
  productId: string;
  variantId?: string | null;
  categoryId?: string | null;
  quantity: number;
  customerGroups?: string[];
  now?: Date;
}

export interface PricingRuleEvaluation {
  ruleId: string | null;
  name: string | null;
  type: string;
  percentOff: number;
  priority: number;
  valid: boolean;
  reason?: PricingRejection;
}

export interface AppliedPricingRule {
  id: string | null;
  name: string | null;
  type: string;
  percentOff: number;
}

export interface PricedLine {
  productId: string;
  variantId: string | null;
  quantity: number;
  basePrice: number;
  unitPrice: number;
  lineTotal: number;
  discountPerUnit: number;
  discountTotal: number;
  appliedRule: AppliedPricingRule | null;
  rejectedRules: Array<{ id: string | null; name: string | null; reason: PricingRejection }>;
}

export interface PricedCart {
  lines: PricedLine[];
  baseSubtotal: number;
  itemsTotal: number;
  discountTotal: number;
}

export function roundMoney(value: number): number {
  if (!Number.isFinite(value)) return 0;
  // Shifting through the string form keeps half cents honest: 1.005 becomes 1.01, while plain
  // `Math.round(1.005 * 100)` returns 100 because the binary float is slightly below 100.5.
  const shifted = Number(`${value}e2`);
  if (!Number.isFinite(shifted)) return Math.round(value * 100) / 100;
  return Number(`${Math.round(shifted)}e-2`);
}

function toTime(value: Date | string | null | undefined): number | null {
  if (!value) return null;
  const time = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isNaN(time) ? null : time;
}

function normalizeText(value: unknown): string | null {
  const text = String(value ?? '').trim();
  return text.length > 0 ? text : null;
}

/** A rule is live when it is not disabled and `now` sits inside its window. */
export function isPricingRuleLive(rule: PricingRule, now: Date = new Date()): boolean {
  if (rule.isActive === false) return false;
  const nowTime = now.getTime();
  const start = toTime(rule.startAt);
  const end = toTime(rule.endAt);
  if (start !== null && start > nowTime) return false;
  if (end !== null && end < nowTime) return false;
  return true;
}

/**
 * Every scope field that is filled must match. An empty field means "all products" or
 * "all categories", so a rule can be written at brand level without touching every SKU.
 */
export function matchesPricingScope(rule: PricingRule, context: PricingContext): boolean {
  const productId = normalizeText(rule.productId);
  if (productId && productId !== normalizeText(context.productId)) return false;

  const variantId = normalizeText(rule.variantId);
  if (variantId && variantId !== normalizeText(context.variantId)) return false;

  const categoryId = normalizeText(rule.categoryId);
  if (categoryId && categoryId !== normalizeText(context.categoryId)) return false;

  return true;
}

/**
 * The tier table is read as brackets: the applicable tier is the one with the largest
 * `minQuantity` the line reaches. Invalid entries are skipped rather than poisoning the quote,
 * because one hand-edited row must not break checkout for every product.
 */
export function resolveTierPercent(
  tiers: QuantityTier[] | null | undefined,
  quantity: number
): number | null {
  if (!Array.isArray(tiers) || tiers.length === 0) return null;
  const qty = Math.max(0, Math.floor(Number(quantity) || 0));

  let winner: QuantityTier | null = null;
  for (const tier of tiers) {
    const min = Math.floor(Number(tier?.minQuantity));
    const percent = Number(tier?.percentOff);
    if (!Number.isFinite(min) || min < 1) continue;
    if (!Number.isFinite(percent) || percent <= 0 || percent > 100) continue;
    if (qty < min) continue;
    if (!winner || min > winner.minQuantity) {
      winner = { minQuantity: min, percentOff: percent };
    }
  }

  return winner ? winner.percentOff : null;
}

function baseEvaluation(rule: PricingRule): PricingRuleEvaluation {
  return {
    ruleId: normalizeText(rule.id),
    name: normalizeText(rule.name),
    type: String(rule.type ?? ''),
    percentOff: 0,
    priority: Number.isFinite(Number(rule.priority)) ? Number(rule.priority) : 0,
    valid: false,
  };
}

function reject(evaluation: PricingRuleEvaluation, reason: PricingRejection): PricingRuleEvaluation {
  return { ...evaluation, valid: false, reason };
}

function accept(evaluation: PricingRuleEvaluation, percentOff: number): PricingRuleEvaluation {
  return { ...evaluation, valid: true, percentOff, reason: undefined };
}

/** Evaluates one rule against one line. Never throws; every refusal is a typed reason. */
export function evaluatePricingRule(
  rule: PricingRule,
  context: PricingContext,
  now: Date = context.now ?? new Date()
): PricingRuleEvaluation {
  const evaluation = baseEvaluation(rule);

  if (!(PRICING_RULE_TYPES as readonly string[]).includes(evaluation.type)) {
    return reject(evaluation, 'UNKNOWN_TYPE');
  }
  if (!isPricingRuleLive(rule, now)) {
    const nowTime = now.getTime();
    const start = toTime(rule.startAt);
    const end = toTime(rule.endAt);
    if (rule.isActive === false) return reject(evaluation, 'INACTIVE');
    if (start !== null && start > nowTime) return reject(evaluation, 'NOT_STARTED');
    if (end !== null && end < nowTime) return reject(evaluation, 'EXPIRED');
    return reject(evaluation, 'INACTIVE');
  }
  if (!matchesPricingScope(rule, context)) {
    return reject(evaluation, 'OUT_OF_SCOPE');
  }

  if (evaluation.type === 'tiered') {
    const percent = resolveTierPercent(rule.tiers, context.quantity);
    if (percent === null) return reject(evaluation, 'INVALID_RULE');
    return accept(evaluation, percent);
  }

  const percent = Number(rule.percentOff);
  if (!Number.isFinite(percent) || percent <= 0 || percent > 100) {
    return reject(evaluation, 'INVALID_RULE');
  }

  if (evaluation.type === 'customer_group') {
    const group = normalizeText(rule.customerGroup);
    const groups = (context.customerGroups ?? []).map((value) => String(value).trim());
    if (!group || !groups.includes(group)) {
      return reject(evaluation, 'GROUP_NOT_MATCHED');
    }
  }

  return accept(evaluation, percent);
}

/**
 * Picks one winner from the evaluations. A single rule per line is a deliberate limit:
 * stacking discounts across campaigns is how stores end up selling below cost by accident.
 */
export function selectBestPricingRule(
  evaluations: PricingRuleEvaluation[]
): PricingRuleEvaluation | null {
  const candidates = (evaluations ?? []).filter((item) => item.valid && item.percentOff > 0);
  if (candidates.length === 0) return null;

  candidates.sort((a, b) => {
    if (b.percentOff !== a.percentOff) return b.percentOff - a.percentOff;
    if (b.priority !== a.priority) return b.priority - a.priority;
    const nameDiff = String(a.name ?? '').localeCompare(String(b.name ?? ''));
    if (nameDiff !== 0) return nameDiff;
    return String(a.ruleId ?? '').localeCompare(String(b.ruleId ?? ''));
  });

  return candidates[0];
}

/** Resolves the unit price for one line, with the applied rule recorded for support. */
export function resolveLinePrice(
  basePrice: number,
  context: PricingContext,
  rules: PricingRule[] = []
): PricedLine {
  const normalizedBase = roundMoney(Math.max(0, Number(basePrice) || 0));
  const quantity = Math.max(0, Math.floor(Number(context.quantity) || 0));

  const evaluations = (rules ?? []).map((rule) => evaluatePricingRule(rule, context));
  const winner = selectBestPricingRule(evaluations);

  const percent = winner?.percentOff ?? 0;
  const unitPrice = roundMoney(normalizedBase * (1 - percent / 100));
  const lineTotal = roundMoney(unitPrice * quantity);
  const discountPerUnit = roundMoney(normalizedBase - unitPrice);

  return {
    productId: String(context.productId),
    variantId: normalizeText(context.variantId),
    quantity,
    basePrice: normalizedBase,
    unitPrice,
    lineTotal,
    discountPerUnit,
    discountTotal: roundMoney(discountPerUnit * quantity),
    appliedRule: winner
      ? {
          id: winner.ruleId,
          name: winner.name,
          type: winner.type,
          percentOff: winner.percentOff,
        }
      : null,
    rejectedRules: evaluations
      .filter((item) => !item.valid)
      .map((item) => ({ id: item.ruleId, name: item.name, reason: item.reason ?? 'INVALID_RULE' })),
  };
}

export interface PricingLineInput {
  productId: string;
  variantId?: string | null;
  categoryId?: string | null;
  quantity: number;
  basePrice: number;
}

/** Prices a whole cart. The caller supplies base prices; this module never reads the database. */
export function priceLines(
  lines: PricingLineInput[],
  rules: PricingRule[] = [],
  options: { customerGroups?: string[]; now?: Date } = {}
): PricedCart {
  const priced: PricedLine[] = [];
  for (const line of lines ?? []) {
    priced.push(
      resolveLinePrice(
        line.basePrice,
        {
          productId: line.productId,
          variantId: line.variantId ?? null,
          categoryId: line.categoryId ?? null,
          quantity: line.quantity,
          customerGroups: options.customerGroups ?? [],
          now: options.now ?? new Date(),
        },
        rules
      )
    );
  }

  const baseSubtotal = roundMoney(priced.reduce((sum, line) => sum + line.basePrice * line.quantity, 0));
  const itemsTotal = roundMoney(priced.reduce((sum, line) => sum + line.lineTotal, 0));

  return {
    lines: priced,
    baseSubtotal,
    itemsTotal,
    discountTotal: roundMoney(baseSubtotal - itemsTotal),
  };
}

/**
 * Cross field validation. Kept separate from zod so the rules can be tested without a schema,
 * and so `PATCH` can validate only the fields it received.
 */
export function validatePricingRuleInput(
  input: Partial<Record<keyof PricingRule, unknown>>,
  options: { partial?: boolean } = {}
): string[] {
  const errors: string[] = [];
  const partial = options.partial === true;
  const has = (key: keyof PricingRule) => input[key] !== undefined;

  if (!partial || has('type')) {
    if (!(PRICING_RULE_TYPES as readonly string[]).includes(String(input.type ?? ''))) {
      errors.push('type harus dynamic, tiered, atau customer_group');
    }
  }

  const type = String(input.type ?? '');
  const percent = input.percentOff;
  const hasPercent = percent !== undefined && percent !== null;
  const percentOk = hasPercent && Number.isFinite(Number(percent)) && Number(percent) > 0 && Number(percent) <= 100;

  // A bare percentage on a PATCH still has to make sense, even before the type is known. The
  // type specific messages below already cover dynamic and customer_group, so this avoids
  // reporting the same bad number twice.
  const typeOwnsPercent = type === 'dynamic' || type === 'customer_group';
  if (hasPercent && !percentOk && !typeOwnsPercent) {
    errors.push('percentOff harus antara 0 dan 100');
  }

  if ((!partial || has('type') || hasPercent) && type === 'dynamic') {
    if (!percentOk) errors.push('percentOff wajib diisi antara 0 dan 100 untuk dynamic');
  }

  if ((!partial || has('type') || has('customerGroup')) && type === 'customer_group') {
    if (!percentOk) errors.push('percentOff wajib diisi antara 0 dan 100 untuk customer_group');
    if (normalizeText(input.customerGroup) === null) {
      errors.push('customerGroup wajib diisi untuk customer_group');
    }
  }

  if (!partial || has('type') || has('tiers')) {
    if (type === 'tiered') {
      const tiers = input.tiers;
      if (!Array.isArray(tiers) || tiers.length === 0) {
        errors.push('tiers wajib berisi minimal satu bracket untuk tiered');
      } else {
        const seen = new Set<number>();
        let previous = 0;
        tiers.forEach((tier: any, index: number) => {
          const min = Math.floor(Number(tier?.minQuantity));
          const off = Number(tier?.percentOff);
          if (!Number.isFinite(min) || min < 1) {
            errors.push(`tiers[${index}].minQuantity harus bilangan bulat minimal 1`);
          } else {
            if (seen.has(min)) errors.push(`tiers[${index}].minQuantity duplikat`);
            if (min <= previous) errors.push('tiers harus urut naik berdasarkan minQuantity');
            seen.add(min);
            previous = min;
          }
          if (!Number.isFinite(off) || off <= 0 || off > 100) {
            errors.push(`tiers[${index}].percentOff harus antara 0 dan 100`);
          }
        });
      }
    }
  }

  const parseTime = (value: unknown): number | null => {
    if (value === undefined || value === null || value === '') return null;
    const time = new Date(String(value)).getTime();
    return Number.isNaN(time) ? NaN : time;
  };

  if (!partial || has('startAt') || has('endAt')) {
    const start = parseTime(input.startAt);
    const end = parseTime(input.endAt);
    if (start !== null && Number.isNaN(start)) errors.push('startAt bukan tanggal valid');
    if (end !== null && Number.isNaN(end)) errors.push('endAt bukan tanggal valid');
    if (start !== null && end !== null && !Number.isNaN(start) && !Number.isNaN(end) && start >= end) {
      errors.push('startAt harus lebih awal dari endAt');
    }
  }

  for (const key of ['productId', 'variantId', 'categoryId'] as const) {
    if (has(key) && input[key] !== null && input[key] !== '' && normalizeText(input[key]) === null) {
      errors.push(`${key} tidak boleh kosong`);
    }
  }

  return errors;
}
