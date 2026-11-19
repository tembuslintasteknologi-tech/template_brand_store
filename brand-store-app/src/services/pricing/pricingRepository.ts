/**
 * Pricing repository (PRC-002, PRC-003, PRC-004).
 *
 * This is the only file that reads or writes the pricing tables. The math lives in
 * `pricingEngine.ts`, so every rule can be tested without a database and the query layer stays
 * a thin normalizer: DB rows always arrive as strings and JSON, the engine only sees numbers.
 */

import { and, asc, eq } from 'drizzle-orm';
import { db } from '../../db/index.js';
import {
  customerGroupMembers,
  customerGroups,
  pricingRules,
  products,
  productVariants,
} from '../../db/schema.js';
import {
  priceLines,
  resolveLinePrice,
  roundMoney,
  validatePricingRuleInput,
  type PricedCart,
  type PricedLine,
  type PricingRule,
} from './pricingEngine.js';

export class PricingError extends Error {
  readonly status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = 'PricingError';
    this.status = status;
  }
}

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeTiers(value: unknown): Array<{ minQuantity: number; percentOff: number }> {
  if (!Array.isArray(value)) return [];
  return value
    .map((tier) => ({
      minQuantity: Math.floor(Number((tier as any)?.minQuantity)),
      percentOff: Number((tier as any)?.percentOff),
    }))
    .filter((tier) => Number.isFinite(tier.minQuantity) && Number.isFinite(tier.percentOff));
}

/** Drizzle returns decimals as strings, so every numeric field is converted exactly once here. */
export function normalizePricingRuleRow(row: Record<string, any>): PricingRule {
  return {
    id: row.id ?? null,
    name: row.name ?? null,
    type: String(row.type ?? ''),
    percentOff: toNumber(row.percentOff),
    tiers: normalizeTiers(row.tiers),
    customerGroup: row.customerGroup ?? null,
    productId: row.productId ?? null,
    variantId: row.variantId ?? null,
    categoryId: row.categoryId ?? null,
    startAt: row.startAt ?? null,
    endAt: row.endAt ?? null,
    isActive: row.isActive ?? true,
    priority: toNumber(row.priority) ?? 0,
  };
}

export async function listPricingRules(includeInactive = true): Promise<PricingRule[]> {
  const rows = includeInactive
    ? await db.select().from(pricingRules).orderBy(asc(pricingRules.priority), asc(pricingRules.createdAt))
    : await db.select().from(pricingRules).where(eq(pricingRules.isActive, true));
  return rows.map((row) => normalizePricingRuleRow(row as Record<string, any>));
}

export async function listActivePricingRules(): Promise<PricingRule[]> {
  const rows = await db.select().from(pricingRules).where(eq(pricingRules.isActive, true));
  return rows.map((row) => normalizePricingRuleRow(row as Record<string, any>));
}

export interface PricingRuleInput {
  name?: unknown;
  type?: unknown;
  percentOff?: unknown;
  tiers?: unknown;
  customerGroup?: unknown;
  productId?: unknown;
  variantId?: unknown;
  categoryId?: unknown;
  priority?: unknown;
  isActive?: unknown;
  startAt?: unknown;
  endAt?: unknown;
}

function blankToNull(value: unknown): string | null {
  const text = String(value ?? '').trim();
  return text.length > 0 ? text : null;
}

function assertRuleInput(input: PricingRuleInput, partial: boolean, existing?: PricingRule): void {
  const merged: Record<string, unknown> = {
    type: partial && input.type === undefined ? existing?.type : input.type,
    percentOff:
      partial && input.percentOff === undefined ? existing?.percentOff : input.percentOff,
    tiers: partial && input.tiers === undefined ? existing?.tiers : input.tiers,
    customerGroup:
      partial && input.customerGroup === undefined ? existing?.customerGroup : input.customerGroup,
    startAt: partial && input.startAt === undefined ? existing?.startAt : input.startAt,
    endAt: partial && input.endAt === undefined ? existing?.endAt : input.endAt,
  };

  const errors = validatePricingRuleInput(merged, { partial });
  if (errors.length > 0) {
    throw new PricingError(`Aturan harga tidak valid: ${errors.join('; ')}`);
  }

  if (blankToNull(input.name) === null && !partial) {
    throw new PricingError('Aturan harga tidak valid: name wajib diisi');
  }
}

export async function createPricingRule(actorId: string, input: PricingRuleInput): Promise<PricingRule> {
  assertRuleInput(input, false);

  const [row] = await db
    .insert(pricingRules)
    .values({
      name: String(input.name).trim(),
      type: String(input.type),
      percentOff: input.percentOff === undefined || input.percentOff === null ? null : String(input.percentOff),
      tiers: normalizeTiers(input.tiers),
      customerGroup: blankToNull(input.customerGroup),
      productId: blankToNull(input.productId),
      variantId: blankToNull(input.variantId),
      categoryId: blankToNull(input.categoryId),
      priority: toNumber(input.priority) ?? 0,
      isActive: input.isActive === undefined ? true : Boolean(input.isActive),
      startAt: input.startAt ? new Date(String(input.startAt)) : null,
      endAt: input.endAt ? new Date(String(input.endAt)) : null,
      createdBy: /^[0-9a-f-]{36}$/i.test(String(actorId ?? '')) ? actorId : null,
    } as any)
    .returning();

  return normalizePricingRuleRow(row as Record<string, any>);
}

export async function updatePricingRule(
  actorId: string,
  id: string,
  input: PricingRuleInput
): Promise<PricingRule> {
  const [existingRow] = await db.select().from(pricingRules).where(eq(pricingRules.id, id as any)).limit(1);
  if (!existingRow) {
    throw new PricingError(`Aturan harga tidak ditemukan: ${id}`, 404);
  }

  const existing = normalizePricingRuleRow(existingRow as Record<string, any>);
  assertRuleInput(input, true, existing);

  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (input.name !== undefined) patch.name = String(input.name).trim();
  if (input.type !== undefined) patch.type = String(input.type);
  if (input.percentOff !== undefined) {
    patch.percentOff = input.percentOff === null ? null : String(input.percentOff);
  }
  if (input.tiers !== undefined) patch.tiers = normalizeTiers(input.tiers);
  if (input.customerGroup !== undefined) patch.customerGroup = blankToNull(input.customerGroup);
  if (input.productId !== undefined) patch.productId = blankToNull(input.productId);
  if (input.variantId !== undefined) patch.variantId = blankToNull(input.variantId);
  if (input.categoryId !== undefined) patch.categoryId = blankToNull(input.categoryId);
  if (input.priority !== undefined) patch.priority = toNumber(input.priority) ?? 0;
  if (input.isActive !== undefined) patch.isActive = Boolean(input.isActive);
  if (input.startAt !== undefined) patch.startAt = input.startAt ? new Date(String(input.startAt)) : null;
  if (input.endAt !== undefined) patch.endAt = input.endAt ? new Date(String(input.endAt)) : null;

  const [row] = await db
    .update(pricingRules)
    .set(patch as any)
    .where(eq(pricingRules.id, id as any))
    .returning();

  return normalizePricingRuleRow(row as Record<string, any>);
}

export async function deletePricingRule(id: string): Promise<{ id: string; deleted: true }> {
  const [existing] = await db.select().from(pricingRules).where(eq(pricingRules.id, id as any)).limit(1);
  if (!existing) {
    throw new PricingError(`Aturan harga tidak ditemukan: ${id}`, 404);
  }
  await db.delete(pricingRules).where(eq(pricingRules.id, id as any));
  return { id, deleted: true };
}

export interface CustomerGroupRow {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  isActive: boolean;
}

type CustomerGroupSelected = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  isActive: boolean;
};

export async function listCustomerGroups(): Promise<CustomerGroupRow[]> {
  return db
    .select({
      id: customerGroups.id,
      slug: customerGroups.slug,
      name: customerGroups.name,
      description: customerGroups.description,
      isActive: customerGroups.isActive,
    })
    .from(customerGroups)
    .orderBy(asc(customerGroups.slug));
}

export async function createCustomerGroup(input: {
  slug?: unknown;
  name?: unknown;
  description?: unknown;
  isActive?: unknown;
}): Promise<CustomerGroupRow> {
  const slug = String(input.slug ?? '').trim().toLowerCase();
  const name = String(input.name ?? '').trim();
  if (!/^[a-z0-9][a-z0-9-_]{1,79}$/.test(slug)) {
    throw new PricingError('Slug grup harus huruf kecil, angka, tanda hubung, atau garis bawah (2-80 karakter)');
  }
  if (!name) throw new PricingError('Nama grup wajib diisi');

  const [row] = await db
    .insert(customerGroups)
    .values({
      slug,
      name,
      description: blankToNull(input.description),
      isActive: input.isActive === undefined ? true : Boolean(input.isActive),
    } as any)
    .returning();

  return row as CustomerGroupSelected;
}

export async function updateCustomerGroup(
  id: string,
  input: { slug?: unknown; name?: unknown; description?: unknown; isActive?: unknown }
): Promise<CustomerGroupRow> {
  const [existing] = await db.select().from(customerGroups).where(eq(customerGroups.id, id as any)).limit(1);
  if (!existing) throw new PricingError(`Grup tidak ditemukan: ${id}`, 404);

  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (input.slug !== undefined) {
    const slug = String(input.slug).trim().toLowerCase();
    if (!/^[a-z0-9][a-z0-9-_]{1,79}$/.test(slug)) {
      throw new PricingError('Slug grup harus huruf kecil, angka, tanda hubung, atau garis bawah (2-80 karakter)');
    }
    patch.slug = slug;
  }
  if (input.name !== undefined) {
    const name = String(input.name).trim();
    if (!name) throw new PricingError('Nama grup wajib diisi');
    patch.name = name;
  }
  if (input.description !== undefined) patch.description = blankToNull(input.description);
  if (input.isActive !== undefined) patch.isActive = Boolean(input.isActive);

  const [row] = await db
    .update(customerGroups)
    .set(patch as any)
    .where(eq(customerGroups.id, id as any))
    .returning();

  return row as CustomerGroupSelected;
}

export async function deleteCustomerGroup(id: string): Promise<{ id: string; deleted: true }> {
  const [existing] = await db.select().from(customerGroups).where(eq(customerGroups.id, id as any)).limit(1);
  if (!existing) throw new PricingError(`Grup tidak ditemukan: ${id}`, 404);
  await db.delete(customerGroups).where(eq(customerGroups.id, id as any));
  return { id, deleted: true };
}

export async function listGroupMembers(groupId: string): Promise<Array<{ userId: string; createdAt: Date }>> {
  return db
    .select({ userId: customerGroupMembers.userId, createdAt: customerGroupMembers.createdAt })
    .from(customerGroupMembers)
    .where(eq(customerGroupMembers.groupId, groupId as any));
}

export async function addGroupMember(
  groupId: string,
  userId: string
): Promise<{ groupId: string; userId: string; added: boolean }> {
  const [group] = await db.select().from(customerGroups).where(eq(customerGroups.id, groupId as any)).limit(1);
  if (!group) throw new PricingError(`Grup tidak ditemukan: ${groupId}`, 404);

  const existing = await db
    .select({ id: customerGroupMembers.id })
    .from(customerGroupMembers)
    .where(and(eq(customerGroupMembers.groupId, groupId as any), eq(customerGroupMembers.userId, userId as any)))
    .limit(1);

  if (existing.length > 0) return { groupId, userId, added: false };

  await db.insert(customerGroupMembers).values({ groupId, userId } as any);
  return { groupId, userId, added: true };
}

export async function removeGroupMember(
  groupId: string,
  userId: string
): Promise<{ groupId: string; userId: string; removed: boolean }> {
  const result = await db
    .delete(customerGroupMembers)
    .where(and(eq(customerGroupMembers.groupId, groupId as any), eq(customerGroupMembers.userId, userId as any)))
    .returning({ id: customerGroupMembers.id });

  return { groupId, userId, removed: result.length > 0 };
}

/** Active group slugs for one buyer. A guest has no groups, which is not an error. */
export async function getCustomerGroupSlugs(userId: string | null | undefined): Promise<string[]> {
  if (!userId) return [];
  const rows = await db
    .select({ slug: customerGroups.slug })
    .from(customerGroupMembers)
    .innerJoin(customerGroups, eq(customerGroupMembers.groupId, customerGroups.id))
    .where(and(eq(customerGroupMembers.userId, userId as any), eq(customerGroups.isActive, true)));

  return rows.map((row) => row.slug).filter(Boolean);
}

export interface ResolveProductPriceInput {
  productId: string;
  variantId?: string | null;
  quantity: number;
  userId?: string | null;
  now?: Date;
}

/**
 * Reads the catalog price (variant wins over product) and applies the pricing rules. Unknown
 * products return null so the caller can keep its own 404 message.
 */
export async function resolveProductPrice(
  input: ResolveProductPriceInput
): Promise<{ product: Record<string, any>; line: PricedLine; customerGroups: string[] } | null> {
  const [product] = await db
    .select()
    .from(products)
    .where(eq(products.id, input.productId as any))
    .limit(1);

  if (!product) return null;

  let basePrice = toNumber(product.basePrice) ?? 0;
  if (input.variantId) {
    const [variant] = await db
      .select()
      .from(productVariants)
      .where(and(eq(productVariants.id, input.variantId as any), eq(productVariants.productId, product.id)))
      .limit(1);
    if (variant) basePrice = toNumber(variant.price) ?? basePrice;
  }

  const rules = await listActivePricingRules();
  const customerGroups = await getCustomerGroupSlugs(input.userId);

  const line = resolveLinePrice(
    basePrice,
    {
      productId: product.id,
      variantId: input.variantId ?? null,
      categoryId: product.categoryId ?? null,
      quantity: input.quantity,
      customerGroups,
      now: input.now ?? new Date(),
    },
    rules
  );

  return { product: product as Record<string, any>, line, customerGroups };
}

export interface QuoteLineInput {
  productId: string;
  variantId?: string | null;
  quantity: number;
  /** Optional caller-supplied price. When omitted the catalog price is used. */
  basePrice?: number | null;
  categoryId?: string | null;
}

/**
 * Prices a whole cart. Missing catalog prices abort the quote instead of silently quoting zero,
 * because a zero line would look like a free product at checkout.
 */
export async function quotePricing(input: {
  lines: QuoteLineInput[];
  userId?: string | null;
  now?: Date;
}): Promise<PricedCart & { customerGroups: string[] }> {
  if (!Array.isArray(input.lines) || input.lines.length === 0) {
    throw new PricingError('Minimal satu baris untuk dihitung');
  }

  const normalized: Array<{
    productId: string;
    variantId: string | null;
    categoryId: string | null;
    quantity: number;
    basePrice: number;
  }> = [];

  for (const line of input.lines) {
    const quantity = Math.floor(Number(line.quantity));
    if (!Number.isFinite(quantity) || quantity < 1) {
      throw new PricingError(`Quantity tidak valid untuk produk ${line.productId}`);
    }

    if (line.basePrice !== undefined && line.basePrice !== null) {
      normalized.push({
        productId: String(line.productId),
        variantId: line.variantId ?? null,
        categoryId: line.categoryId ?? null,
        quantity,
        basePrice: Math.max(0, Number(line.basePrice) || 0),
      });
      continue;
    }

    const resolved = await resolveProductPrice({
      productId: String(line.productId),
      variantId: line.variantId ?? null,
      quantity,
      userId: input.userId ?? null,
      now: input.now,
    });

    if (!resolved) {
      throw new PricingError(`Produk tidak ditemukan: ${line.productId}`, 404);
    }

    normalized.push({
      productId: resolved.product.id,
      variantId: line.variantId ?? null,
      categoryId: resolved.product.categoryId ?? null,
      quantity,
      basePrice: resolved.line.basePrice,
    });
  }

  const rules = await listActivePricingRules();
  const customerGroups = await getCustomerGroupSlugs(input.userId);
  const cart = priceLines(normalized, rules, { customerGroups, now: input.now });

  return { ...cart, customerGroups };
}

/** Rounds a line total the same way the engine does, exported for route level summaries. */
export function sumLineTotals(lines: Array<{ lineTotal: number }>): number {
  return roundMoney(lines.reduce((sum, line) => sum + Number(line.lineTotal || 0), 0));
}
