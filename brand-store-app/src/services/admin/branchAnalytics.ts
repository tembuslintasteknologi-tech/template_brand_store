/**
 * Cross-branch analytics for the pusat role (BR-012).
 *
 * The report answers one question per branch: how much did it sell, how many orders and items
 * moved, how much came back as a refund, and what is about to run out. The rollup repeats the
 * same numbers for the whole network so the pusat dashboard does not have to add rows up.
 *
 * Rules kept deliberately narrow:
 *   - Sales use the same revenue statuses as finance, so branch numbers match `financialSummary`.
 *   - Refunds come straight from the `refunds` table. No new refund formula is invented here.
 *   - A refund is attributed to a branch only when every line of that order came from the same
 *     branch. A multi-branch order drops into `unallocatedRefundTotal` instead of being split by
 *     guesswork, because the refund row itself does not carry a branch.
 */

import { db } from '../../db/index.js';
import {
  branchInventory,
  orderItems,
  orders,
  productVariants,
  refunds,
  storeLocations,
} from '../../db/schema.js';
import { and, asc, eq, gte, inArray, lte, sql } from 'drizzle-orm';
import { REVENUE_STATUSES, REFUND_SETTLED_STATUSES } from '../finance/financeService.js';
import { stockStatus } from '../branch/branchStockService.js';
import { getDefaultStoreLocation } from '../config/settings.js';

export const DEFAULT_ANALYTICS_DAYS = 30;

export type BranchAnalyticsErrorCode = 'INVALID_DATE' | 'INVALID_DATE_RANGE';

export class BranchAnalyticsError extends Error {
  readonly status: number;
  readonly code: BranchAnalyticsErrorCode;

  constructor(code: BranchAnalyticsErrorCode, message: string, status = 400) {
    super(message);
    this.name = 'BranchAnalyticsError';
    this.status = status;
    this.code = code;
  }
}

export interface BranchRef {
  id: string;
  code?: string | null;
  name: string;
  city?: string | null;
  type?: string | null;
}

export interface SaleLine {
  orderId: string;
  branchId?: string | null;
  quantity: number | string;
  totalPrice: number | string;
  orderStatus: string;
}

export interface RefundLine {
  orderId: string;
  amount: number | string;
  status: string;
}

export interface OrderBranchLine {
  orderId: string;
  branchId?: string | null;
}

export interface LowStockRow {
  branchId: string;
  variantId: string;
  variantName?: string | null;
  sku?: string | null;
  stock: number;
  reservedStock: number;
  lowStockThreshold?: number | null;
}

export interface LowStockItem {
  variantId: string;
  name: string;
  sku: string | null;
  available: number;
  threshold: number;
  status: 'low_stock' | 'out_of_stock';
}

export interface BranchAnalyticsEntry {
  branchId: string;
  code: string | null;
  name: string;
  city: string | null;
  type: string;
  orderCount: number;
  itemCount: number;
  grossSales: number;
  refundedTotal: number;
  netSales: number;
  averageOrderValue: number;
  lowStockCount: number;
  lowStockItems: LowStockItem[];
}

export interface BranchAnalyticsRollup {
  branchCount: number;
  orderCount: number;
  itemCount: number;
  grossSales: number;
  refundedTotal: number;
  netSales: number;
  averageOrderValue: number;
  unallocatedRefundTotal: number;
  unassignedSales: number;
  lowStockCount: number;
}

export interface BranchAnalyticsReport {
  from: string;
  to: string;
  branches: BranchAnalyticsEntry[];
  rollup: BranchAnalyticsRollup;
}

export interface BuildBranchAnalyticsInput {
  branches: BranchRef[];
  sales: SaleLine[];
  refunds?: RefundLine[];
  orderBranches?: OrderBranchLine[];
  lowStock?: LowStockRow[];
  /**
   * Branch used for legacy lines that never recorded `source_branch_id`. The pusat branch is the
   * right default because every pre-branch order came from that pool. When it is missing the
   * lines still reach the rollup but not any branch row.
   */
  fallbackBranchId?: string | null;
}

function num(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Resolves the report window. Missing bounds default to the last 30 days, matching the finance
 * report. Bad ISO input and an inverted range both fail with 400 instead of silently returning
 * an empty report.
 */
export function resolveAnalyticsWindow(
  from?: string | null,
  to?: string | null,
  now: Date = new Date()
): { from: Date; to: Date } {
  const start = from ? new Date(from) : new Date(now.getTime() - DEFAULT_ANALYTICS_DAYS * 24 * 60 * 60 * 1000);
  const end = to ? new Date(to) : now;

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    throw new BranchAnalyticsError(
      'INVALID_DATE',
      'Format tanggal harus ISO 8601 (contoh 2026-11-01)',
      400
    );
  }
  if (start > end) {
    throw new BranchAnalyticsError(
      'INVALID_DATE_RANGE',
      'Tanggal awal tidak boleh lebih besar dari tanggal akhir',
      400
    );
  }
  return { from: start, to: end };
}

function isRevenue(orderStatus: string): boolean {
  return REVENUE_STATUSES.includes(orderStatus);
}

/**
 * Pure assembly. Everything the report needs is passed in, so the allocation rules can be tested
 * without a database and without mocking Drizzle.
 */
export function buildBranchAnalytics(input: BuildBranchAnalyticsInput): {
  branches: BranchAnalyticsEntry[];
  rollup: BranchAnalyticsRollup;
} {
  const fallbackBranchId = input.fallbackBranchId?.trim() ? input.fallbackBranchId : null;
  const branchIds = new Set(input.branches.map((branch) => branch.id));

  const emptyEntries = new Map<string, BranchAnalyticsEntry>();
  for (const branch of input.branches) {
    emptyEntries.set(branch.id, {
      branchId: branch.id,
      code: branch.code ?? null,
      name: branch.name,
      city: branch.city ?? null,
      type: branch.type ?? 'cabang',
      orderCount: 0,
      itemCount: 0,
      grossSales: 0,
      refundedTotal: 0,
      netSales: 0,
      averageOrderValue: 0,
      lowStockCount: 0,
      lowStockItems: [],
    });
  }

  const orderIdsByBranch = new Map<string, Set<string>>();
  const allOrderIds = new Set<string>();
  let itemCount = 0;
  let grossSales = 0;
  let unassignedSales = 0;

  const resolveBranchId = (raw?: string | null): string | null => {
    const value = typeof raw === 'string' && raw.length > 0 ? raw : fallbackBranchId;
    if (!value || !branchIds.has(value)) return null;
    return value;
  };

  for (const line of input.sales) {
    if (!isRevenue(line.orderStatus)) continue;

    const quantity = num(line.quantity);
    const amount = num(line.totalPrice);

    // Rollup always counts every recognised sale, even when no branch owns the line.
    allOrderIds.add(line.orderId);
    itemCount += quantity;
    grossSales += amount;

    const branchId = resolveBranchId(line.branchId);
    if (!branchId) {
      unassignedSales += amount;
      continue;
    }

    const entry = emptyEntries.get(branchId);
    if (!entry) {
      unassignedSales += amount;
      continue;
    }

    entry.itemCount += quantity;
    entry.grossSales += amount;

    const bucket = orderIdsByBranch.get(branchId) ?? new Set<string>();
    bucket.add(line.orderId);
    orderIdsByBranch.set(branchId, bucket);
  }

  const orderBranches = new Map<string, Set<string>>();
  const unresolvedOrders = new Set<string>();
  const otherBranchOrders = new Set<string>();
  for (const line of input.orderBranches ?? []) {
    const branchId = resolveBranchId(line.branchId);
    if (!branchId) {
      // A missing branch id or a branch outside the supplied list makes the whole order ambiguous
      // for refund allocation. Guessing would put another branch's money on this one.
      if (line.branchId) otherBranchOrders.add(line.orderId);
      else unresolvedOrders.add(line.orderId);
      continue;
    }
    const bucket = orderBranches.get(line.orderId) ?? new Set<string>();
    bucket.add(branchId);
    orderBranches.set(line.orderId, bucket);
  }

  let unallocatedRefundTotal = 0;
  let refundedTotal = 0;
  for (const refund of input.refunds ?? []) {
    if (!REFUND_SETTLED_STATUSES.includes(refund.status)) continue;

    const amount = num(refund.amount);
    refundedTotal += amount;

    if (unresolvedOrders.has(refund.orderId) || otherBranchOrders.has(refund.orderId)) {
      unallocatedRefundTotal += amount;
      continue;
    }

    const branches = orderBranches.get(refund.orderId);
    if (!branches || branches.size !== 1) {
      unallocatedRefundTotal += amount;
      continue;
    }

    const [branchId] = branches;
    const entry = emptyEntries.get(branchId);
    if (!entry) {
      unallocatedRefundTotal += amount;
      continue;
    }
    entry.refundedTotal += amount;
  }

  const lowStockByBranch = new Map<string, LowStockItem[]>();
  for (const row of input.lowStock ?? []) {
    const entry = emptyEntries.get(row.branchId);
    if (!entry) continue;

    const threshold = row.lowStockThreshold ?? 5;
    const status = stockStatus({
      branchId: row.branchId,
      variantId: row.variantId,
      stock: row.stock,
      reservedStock: row.reservedStock,
      lowStockThreshold: threshold,
    });
    if (status === 'in_stock') continue;

    const item: LowStockItem = {
      variantId: row.variantId,
      name: row.variantName ?? row.sku ?? row.variantId,
      sku: row.sku ?? null,
      available: Math.max(0, row.stock - row.reservedStock),
      threshold,
      status,
    };
    const bucket = lowStockByBranch.get(row.branchId) ?? [];
    bucket.push(item);
    lowStockByBranch.set(row.branchId, bucket);
  }

  const entries = input.branches.map((branch) => {
    const base = emptyEntries.get(branch.id)!;
    const orderIds = orderIdsByBranch.get(branch.id);
    const lowStockItems = (lowStockByBranch.get(branch.id) ?? []).sort(
      (a, b) => a.available - b.available || a.name.localeCompare(b.name)
    );

    const orderCount = orderIds ? orderIds.size : 0;
    const entry: BranchAnalyticsEntry = {
      ...base,
      orderCount,
      itemCount: base.itemCount,
      grossSales: round2(base.grossSales),
      refundedTotal: round2(base.refundedTotal),
      averageOrderValue: orderCount === 0 ? 0 : round2(base.grossSales / orderCount),
      lowStockCount: lowStockItems.length,
      lowStockItems,
    };
    entry.netSales = round2(entry.grossSales - entry.refundedTotal);
    return entry;
  });

  entries.sort((a, b) => {
    const aRank = a.type === 'pusat' ? 0 : 1;
    const bRank = b.type === 'pusat' ? 0 : 1;
    return aRank - bRank || a.name.localeCompare(b.name);
  });

  const orderCount = allOrderIds.size;
  const rollup: BranchAnalyticsRollup = {
    branchCount: entries.length,
    orderCount,
    itemCount,
    grossSales: round2(grossSales),
    refundedTotal: round2(refundedTotal),
    netSales: round2(grossSales - refundedTotal),
    averageOrderValue: orderCount === 0 ? 0 : round2(grossSales / orderCount),
    unallocatedRefundTotal: round2(unallocatedRefundTotal),
    unassignedSales: round2(unassignedSales),
    lowStockCount: entries.reduce((total, entry) => total + entry.lowStockCount, 0),
  };

  return { branches: entries, rollup };
}

/**
 * DB-backed report. All rules live in `buildBranchAnalytics`; this function only fetches rows.
 */
export async function branchAnalyticsReport(
  from?: string | null,
  to?: string | null,
  now: Date = new Date()
): Promise<BranchAnalyticsReport> {
  const range = resolveAnalyticsWindow(from, to, now);

  const branchRows = await db
    .select({
      id: storeLocations.id,
      code: storeLocations.code,
      name: storeLocations.name,
      city: storeLocations.city,
      type: storeLocations.type,
    })
    .from(storeLocations)
    .where(eq(storeLocations.isActive, true))
    .orderBy(asc(storeLocations.name));

  const saleRows = await db
    .select({
      orderId: orders.id,
      branchId: orderItems.sourceBranchId,
      quantity: orderItems.quantity,
      totalPrice: orderItems.totalPrice,
      orderStatus: orders.status,
    })
    .from(orderItems)
    .innerJoin(orders, eq(orderItems.orderId, orders.id))
    .where(and(gte(orders.createdAt, range.from), lte(orders.createdAt, range.to)));

  const refundRows = await db
    .select({
      orderId: refunds.orderId,
      amount: refunds.amount,
      status: refunds.status,
    })
    .from(refunds)
    .where(and(gte(refunds.createdAt, range.from), lte(refunds.createdAt, range.to)));

  let orderBranchRows: Array<{ orderId: string; branchId: string | null }> = [];
  const refundedOrderIds = Array.from(new Set(refundRows.map((row) => row.orderId)));
  if (refundedOrderIds.length > 0) {
    orderBranchRows = await db
      .select({
        orderId: orderItems.orderId,
        branchId: orderItems.sourceBranchId,
      })
      .from(orderItems)
      .where(inArray(orderItems.orderId, refundedOrderIds));
  }

  const lowStockRows = await db
    .select({
      branchId: branchInventory.branchId,
      variantId: branchInventory.variantId,
      variantName: productVariants.name,
      sku: productVariants.sku,
      stock: branchInventory.stock,
      reservedStock: branchInventory.reservedStock,
      lowStockThreshold: branchInventory.lowStockThreshold,
    })
    .from(branchInventory)
    .innerJoin(productVariants, eq(branchInventory.variantId, productVariants.id))
    .innerJoin(storeLocations, eq(branchInventory.branchId, storeLocations.id))
    .where(
      and(
        eq(storeLocations.isActive, true),
        sql`${branchInventory.stock} - ${branchInventory.reservedStock} <= ${branchInventory.lowStockThreshold}`
      )
    );

  const pusat = await getDefaultStoreLocation();

  const built = buildBranchAnalytics({
    branches: branchRows,
    sales: saleRows,
    refunds: refundRows,
    orderBranches: orderBranchRows,
    lowStock: lowStockRows,
    fallbackBranchId: pusat?.id ?? null,
  });

  return {
    from: range.from.toISOString(),
    to: range.to.toISOString(),
    ...built,
  };
}
