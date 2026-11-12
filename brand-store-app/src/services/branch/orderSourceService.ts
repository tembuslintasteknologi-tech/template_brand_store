/**
 * Order source resolution (BR-009).
 *
 * Every order line has to remember which branch ships it, because a branch can close, change
 * its name, or stop selling an item, and the order history must not change with it. This file
 * keeps that decision pure: the helpers take plain objects so the rules can be tested without
 * a database, and the two async helpers at the bottom only read.
 *
 * OD-A is still open. Until it is decided, one branch equals one shipment group, so the
 * grouping helper is the single place a different convention would have to change.
 */

import { db } from '../../db/index.js';
import { branchInventory, productVariants, storeLocations } from '../../db/schema.js';
import { and, eq, sql } from 'drizzle-orm';

export const FULFILLMENT_SOURCES = ['branch', 'multi_branch'] as const;
export type FulfillmentSource = (typeof FULFILLMENT_SOURCES)[number];

export const FULFILLMENT_MODES = ['ondemand', 'aggregator'] as const;
export type FulfillmentMode = (typeof FULFILLMENT_MODES)[number];

export class OrderSourceError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status = 400) {
    super(message);
    this.name = 'OrderSourceError';
    this.code = code;
    this.status = status;
  }
}

export interface BranchSnapshot {
  id: string;
  code: string | null;
  name: string;
  city: string;
}

export interface BranchSnapshotInput {
  id: string;
  code?: string | null;
  name: string;
  city?: string | null;
}

/**
 * Branch identity frozen into `product_snapshot`. Only the fields a customer or a support
 * agent needs to read months later, not the full branch row.
 */
export function buildBranchSnapshot(branch: BranchSnapshotInput | null | undefined): BranchSnapshot | null {
  if (!branch) return null;
  return {
    id: branch.id,
    code: branch.code ?? null,
    name: branch.name,
    city: branch.city ?? '',
  };
}

export interface BranchTaggedItem {
  branchId?: string | null;
}

/**
 * Distinct branches actually referenced by the cart. Null and empty ids are ignored so a cart
 * of legacy pusat items does not count as a second branch.
 */
export function distinctBranchIds(items: BranchTaggedItem[]): string[] {
  const seen = new Set<string>();
  for (const item of items) {
    const id = typeof item.branchId === 'string' ? item.branchId.trim() : '';
    if (id.length > 0) seen.add(id);
  }
  return [...seen];
}

/**
 * `multi_branch` only when the cart genuinely spans two or more branches. One branch, or no
 * branch at all, stays `branch`.
 */
export function resolveFulfillmentSource(items: BranchTaggedItem[]): FulfillmentSource {
  return distinctBranchIds(items).length > 1 ? 'multi_branch' : 'branch';
}

export function assertFulfillmentMode(value: unknown): FulfillmentMode {
  if (value === undefined || value === null || value === '') return 'aggregator';
  const mode = String(value).trim().toLowerCase();
  if (mode !== 'ondemand' && mode !== 'aggregator') {
    throw new OrderSourceError(
      'INVALID_FULFILLMENT_MODE',
      `Mode pengiriman tidak dikenal: ${String(value)}`
    );
  }
  return mode;
}

export interface BranchShipmentItem {
  branchId?: string | null;
  productId: string;
  quantity: number;
  fulfillmentMode?: string | null;
}

export interface BranchShipmentPlan {
  branchId: string | null;
  itemCount: number;
  quantity: number;
  productIds: string[];
  mode: FulfillmentMode;
}

/**
 * One group per branch, in first-seen order. The group carries the mode of its first line; a
 * mixed cart inside a single branch is a contradiction the route rejects before it gets here,
 * so the plan does not try to invent a winner.
 */
export function planBranchShipments(items: BranchShipmentItem[]): BranchShipmentPlan[] {
  const groups = new Map<string, BranchShipmentPlan>();

  for (const item of items) {
    const branchId = typeof item.branchId === 'string' && item.branchId.trim().length > 0
      ? item.branchId.trim()
      : null;
    const key = branchId ?? '__pusat';
    const existing = groups.get(key);

    if (existing) {
      existing.itemCount += 1;
      existing.quantity += item.quantity;
      if (!existing.productIds.includes(item.productId)) existing.productIds.push(item.productId);
      continue;
    }

    groups.set(key, {
      branchId,
      itemCount: 1,
      quantity: item.quantity,
      productIds: [item.productId],
      mode: assertFulfillmentMode(item.fulfillmentMode),
    });
  }

  return [...groups.values()];
}

/**
 * Sellable stock for one product at one branch, summed across every variant of that product.
 * Reservations are already subtracted, so the number is what checkout may actually promise.
 */
export async function branchSellableStock(branchId: string, productId: string): Promise<number> {
  const [row] = await db
    .select({
      available: sql<number>`coalesce(sum(greatest(${branchInventory.stock} - ${branchInventory.reservedStock}, 0)), 0)`,
    })
    .from(branchInventory)
    .innerJoin(productVariants, eq(branchInventory.variantId, productVariants.id))
    .where(
      and(eq(branchInventory.branchId, branchId), eq(productVariants.productId, productId))
    );

  return Number(row?.available ?? 0);
}

/**
 * Checkout guard: the chosen branch must exist, be active, and have enough sellable stock.
 * A branch that cannot ship is a 400 for the customer, not a silent fallback to pusat.
 */
export async function assertBranchCanFulfill(input: {
  branchId: string;
  productId: string;
  quantity: number;
}): Promise<number> {
  const [branch] = await db
    .select({ id: storeLocations.id, isActive: storeLocations.isActive })
    .from(storeLocations)
    .where(eq(storeLocations.id, input.branchId))
    .limit(1);

  if (!branch) {
    throw new OrderSourceError('BRANCH_NOT_FOUND', `Cabang tidak ditemukan: ${input.branchId}`, 404);
  }
  if (!branch.isActive) {
    throw new OrderSourceError('BRANCH_INACTIVE', `Cabang tidak aktif: ${input.branchId}`, 409);
  }

  const available = await branchSellableStock(input.branchId, input.productId);
  if (available < input.quantity) {
    throw new OrderSourceError(
      'BRANCH_OUT_OF_STOCK',
      `Stok cabang tidak cukup: tersedia ${available}, diminta ${input.quantity}`
    );
  }

  return available;
}

/** Reads the branch row used for the order snapshot, or null when it no longer exists. */
export async function getBranchSnapshot(branchId: string): Promise<BranchSnapshot | null> {
  const [branch] = await db
    .select({
      id: storeLocations.id,
      code: storeLocations.code,
      name: storeLocations.name,
      city: storeLocations.city,
    })
    .from(storeLocations)
    .where(eq(storeLocations.id, branchId))
    .limit(1);

  return buildBranchSnapshot(branch);
}
