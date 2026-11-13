/**
 * Branch-scoped dashboard (BR-013).
 *
 * This is the view a `branch_admin` gets for its own branch: orders that came out of that branch,
 * item count, sales, refunds, stock about to run out, and reservations currently held. Every query
 * receives the branch id resolved from the session by `requireBranchScope`, never from the request
 * body, so one branch can never read another branch's numbers.
 *
 * Sales, refund and low-stock rules are not re-invented here. They come from `buildBranchAnalytics`
 * (BR-012), so the branch dashboard and the pusat cross-branch report always agree on what counts as
 * revenue, how a refund is allocated, and when stock is considered low.
 */

import { db } from '../../db/index.js';
import {
  branchInventory,
  orderItems,
  orders,
  productVariants,
  refunds,
} from '../../db/schema.js';
import { and, desc, eq, gte, inArray, lte, sql } from 'drizzle-orm';
import { getStoreLocation } from '../config/storeLocations.js';
import {
  buildBranchAnalytics,
  resolveAnalyticsWindow,
  type BranchRef,
  type LowStockItem,
  type LowStockRow,
  type OrderBranchLine,
  type RefundLine,
  type SaleLine,
} from '../admin/branchAnalytics.js';

/** Re-exported so tests and callers use one window rule for both reports. */
export const resolveDashboardWindow = resolveAnalyticsWindow;

export type BranchDashboardErrorCode = 'BRANCH_NOT_FOUND';

export class BranchDashboardError extends Error {
  readonly status: number;
  readonly code: BranchDashboardErrorCode;

  constructor(code: BranchDashboardErrorCode, message: string, status = 404) {
    super(message);
    this.name = 'BranchDashboardError';
    this.status = status;
    this.code = code;
  }
}

export interface ActiveReservationRow {
  variantId: string;
  variantName?: string | null;
  sku?: string | null;
  stock: number;
  reservedStock: number;
}

export interface BranchDashboardReservation {
  variantId: string;
  name: string;
  sku: string | null;
  stock: number;
  reservedStock: number;
  available: number;
}

export interface BranchDashboardBody {
  branch: {
    id: string;
    code: string | null;
    name: string;
    city: string | null;
    type: string;
  };
  orderCount: number;
  itemCount: number;
  grossSales: number;
  refundedTotal: number;
  unattributedRefundTotal: number;
  netSales: number;
  averageOrderValue: number;
  lowStockCount: number;
  lowStock: LowStockItem[];
  reservedQuantity: number;
  activeReservations: BranchDashboardReservation[];
}

export interface BranchDashboardReport extends BranchDashboardBody {
  from: string;
  to: string;
}

export interface BuildBranchDashboardInput {
  branch: BranchRef;
  sales: SaleLine[];
  refunds?: RefundLine[];
  orderBranches?: OrderBranchLine[];
  lowStock?: LowStockRow[];
  reservations?: ActiveReservationRow[];
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Pure assembly. The branch row is passed through untouched, and the metrics come from the BR-012
 * builder with a single branch in the list. Reservations are a dashboard-only concern: they are the
 * live `reserved_stock` a branch currently holds, not a historical log.
 */
export function buildBranchDashboard(input: BuildBranchDashboardInput): BranchDashboardBody {
  const analytics = buildBranchAnalytics({
    branches: [input.branch],
    sales: input.sales,
    refunds: input.refunds,
    orderBranches: input.orderBranches,
    lowStock: input.lowStock,
  });

  const entry = analytics.branches[0];

  const activeReservations = (input.reservations ?? [])
    .filter((row) => Number(row.reservedStock) > 0)
    .map<BranchDashboardReservation>((row) => ({
      variantId: row.variantId,
      name: row.variantName ?? row.sku ?? row.variantId,
      sku: row.sku ?? null,
      stock: Number(row.stock),
      reservedStock: Number(row.reservedStock),
      available: Math.max(0, Number(row.stock) - Number(row.reservedStock)),
    }))
    .sort(
      (a, b) =>
        b.reservedStock - a.reservedStock ||
        a.name.localeCompare(b.name) ||
        a.variantId.localeCompare(b.variantId)
    );

  return {
    branch: {
      id: input.branch.id,
      code: input.branch.code ?? null,
      name: input.branch.name,
      city: input.branch.city ?? null,
      type: input.branch.type ?? 'cabang',
    },
    orderCount: entry?.orderCount ?? 0,
    itemCount: entry?.itemCount ?? 0,
    grossSales: entry?.grossSales ?? 0,
    refundedTotal: entry?.refundedTotal ?? 0,
    unattributedRefundTotal: analytics.rollup.unallocatedRefundTotal,
    netSales: entry?.netSales ?? 0,
    averageOrderValue: entry?.averageOrderValue ?? 0,
    lowStockCount: entry?.lowStockCount ?? 0,
    lowStock: entry?.lowStockItems ?? [],
    reservedQuantity: round2(
      activeReservations.reduce((total, row) => total + row.reservedStock, 0)
    ),
    activeReservations,
  };
}

/**
 * DB-backed dashboard for one branch. The caller is responsible for resolving `branchId` from the
 * session; this function never accepts a branch id from the body.
 */
export async function branchDashboardReport(
  branchId: string,
  from?: string | null,
  to?: string | null,
  now: Date = new Date()
): Promise<BranchDashboardReport> {
  const range = resolveAnalyticsWindow(from, to, now);

  const branch = await getStoreLocation(branchId);
  if (!branch) {
    throw new BranchDashboardError(
      'BRANCH_NOT_FOUND',
      `Cabang tidak ditemukan: ${branchId}`,
      404
    );
  }

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
    .where(
      and(
        eq(orderItems.sourceBranchId, branchId),
        gte(orders.createdAt, range.from),
        lte(orders.createdAt, range.to)
      )
    );

  // Refunds only make sense for orders that actually touched this branch, so the order list is
  // built first and used to scope the refund query.
  const branchOrderRows = await db
    .select({ orderId: orderItems.orderId })
    .from(orderItems)
    .where(eq(orderItems.sourceBranchId, branchId))
    .groupBy(orderItems.orderId);
  const branchOrderIds = branchOrderRows.map((row) => row.orderId);

  const refundRows =
    branchOrderIds.length === 0
      ? []
      : await db
          .select({
            orderId: refunds.orderId,
            amount: refunds.amount,
            status: refunds.status,
          })
          .from(refunds)
          .where(
            and(
              inArray(refunds.orderId, branchOrderIds),
              gte(refunds.createdAt, range.from),
              lte(refunds.createdAt, range.to)
            )
          );

  const refundedOrderIds = Array.from(new Set(refundRows.map((row) => row.orderId)));
  const orderBranchRows =
    refundedOrderIds.length === 0
      ? []
      : await db
          .select({
            orderId: orderItems.orderId,
            branchId: orderItems.sourceBranchId,
          })
          .from(orderItems)
          .where(inArray(orderItems.orderId, refundedOrderIds));

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
    .where(
      and(
        eq(branchInventory.branchId, branchId),
        sql`${branchInventory.stock} - ${branchInventory.reservedStock} <= ${branchInventory.lowStockThreshold}`
      )
    );

  const reservationRows = await db
    .select({
      variantId: branchInventory.variantId,
      variantName: productVariants.name,
      sku: productVariants.sku,
      stock: branchInventory.stock,
      reservedStock: branchInventory.reservedStock,
    })
    .from(branchInventory)
    .innerJoin(productVariants, eq(branchInventory.variantId, productVariants.id))
    .where(and(eq(branchInventory.branchId, branchId), sql`${branchInventory.reservedStock} > 0`))
    .orderBy(desc(branchInventory.reservedStock));

  const built = buildBranchDashboard({
    branch: {
      id: branch.id,
      code: branch.code,
      name: branch.name,
      city: branch.city,
      type: branch.type,
    },
    sales: saleRows,
    refunds: refundRows,
    orderBranches: orderBranchRows,
    lowStock: lowStockRows,
    reservations: reservationRows,
  });

  return {
    from: range.from.toISOString(),
    to: range.to.toISOString(),
    ...built,
  };
}
