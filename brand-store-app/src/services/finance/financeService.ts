import { db } from '../../db/index.js';
import { orders, refunds } from '../../db/schema.js';
import { and, gte, lte } from 'drizzle-orm';

export class FinanceError extends Error {
  readonly status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = 'FinanceError';
    this.status = status;
  }
}

export const REVENUE_STATUSES = ['paid', 'processing', 'shipped', 'delivered'];
export const EXCLUDED_STATUSES = ['cancelled', 'expired', 'pending'];

export interface FinanceOrderRow {
  status: string;
  totalAmount: string | number;
  discountAmount?: string | number | null;
  shippingAmount?: string | number | null;
  createdAt: string | Date;
}

export interface FinanceRefundRow {
  amount: string | number;
  status: string;
  createdAt: string | Date;
}

export interface StatusBucket {
  status: string;
  orders: number;
  revenue: number;
}

export interface MonthlyBucket {
  month: string;
  orders: number;
  revenue: number;
  refunded: number;
  net: number;
}

export interface FinancialSummary {
  orderCount: number;
  paidOrderCount: number;
  grossRevenue: number;
  discountTotal: number;
  shippingTotal: number;
  refundedTotal: number;
  netRevenue: number;
  averageOrderValue: number;
  byStatus: StatusBucket[];
  byMonth: MonthlyBucket[];
}

function num(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function monthKey(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return 'unknown';
  return date.toISOString().slice(0, 7);
}

export function computeFinancialSummary(
  orderRows: FinanceOrderRow[],
  refundRows: FinanceRefundRow[] = []
): FinancialSummary {
  const byStatusMap = new Map<string, StatusBucket>();
  const byMonthMap = new Map<string, MonthlyBucket>();

  let grossRevenue = 0;
  let discountTotal = 0;
  let shippingTotal = 0;
  let paidOrderCount = 0;

  for (const row of orderRows) {
    const revenue = num(row.totalAmount);
    const bucket = byStatusMap.get(row.status) ?? { status: row.status, orders: 0, revenue: 0 };
    bucket.orders += 1;
    bucket.revenue = round2(bucket.revenue + revenue);
    byStatusMap.set(row.status, bucket);

    const month = monthKey(row.createdAt);
    const monthBucket = byMonthMap.get(month) ?? { month, orders: 0, revenue: 0, refunded: 0, net: 0 };
    monthBucket.orders += 1;

    if (REVENUE_STATUSES.includes(row.status)) {
      grossRevenue += revenue;
      discountTotal += num(row.discountAmount);
      shippingTotal += num(row.shippingAmount);
      paidOrderCount += 1;
      monthBucket.revenue = round2(monthBucket.revenue + revenue);
    }

    byMonthMap.set(month, monthBucket);
  }

  let refundedTotal = 0;
  for (const row of refundRows) {
    if (!['approved', 'processed', 'completed', 'succeeded'].includes(row.status)) continue;
    const amount = num(row.amount);
    refundedTotal += amount;

    const month = monthKey(row.createdAt);
    const monthBucket = byMonthMap.get(month) ?? { month, orders: 0, revenue: 0, refunded: 0, net: 0 };
    monthBucket.refunded = round2(monthBucket.refunded + amount);
    byMonthMap.set(month, monthBucket);
  }

  for (const bucket of byMonthMap.values()) {
    bucket.net = round2(bucket.revenue - bucket.refunded);
  }

  const netRevenue = round2(grossRevenue - refundedTotal);

  return {
    orderCount: orderRows.length,
    paidOrderCount,
    grossRevenue: round2(grossRevenue),
    discountTotal: round2(discountTotal),
    shippingTotal: round2(shippingTotal),
    refundedTotal: round2(refundedTotal),
    netRevenue,
    averageOrderValue: paidOrderCount === 0 ? 0 : round2(grossRevenue / paidOrderCount),
    byStatus: [...byStatusMap.values()].sort((a, b) => a.status.localeCompare(b.status)),
    byMonth: [...byMonthMap.values()].sort((a, b) => a.month.localeCompare(b.month)),
  };
}

export interface MarginResult {
  revenue: number;
  cost: number;
  grossProfit: number;
  marginPercent: number;
}

export function computeMargin(revenue: number, cost: number): MarginResult {
  const safeRevenue = num(revenue);
  const safeCost = num(cost);
  const grossProfit = round2(safeRevenue - safeCost);
  return {
    revenue: round2(safeRevenue),
    cost: round2(safeCost),
    grossProfit,
    marginPercent: safeRevenue === 0 ? 0 : round2((grossProfit / safeRevenue) * 100),
  };
}

export function resolveRange(from?: string | null, to?: string | null): { from: Date; to: Date } {
  const now = new Date();
  const defaultFrom = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const start = from ? new Date(from) : defaultFrom;
  const end = to ? new Date(to) : now;
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    throw new FinanceError('Format tanggal harus ISO 8601 (contoh 2026-11-01)', 400);
  }
  if (start > end) {
    throw new FinanceError('Tanggal awal tidak boleh lebih besar dari tanggal akhir', 400);
  }
  return { from: start, to: end };
}

export async function financialSummary(from?: string | null, to?: string | null) {
  const range = resolveRange(from, to);

  const orderRows = await db
    .select({
      status: orders.status,
      totalAmount: orders.totalAmount,
      discountAmount: orders.discountAmount,
      shippingAmount: orders.shippingAmount,
      createdAt: orders.createdAt,
    })
    .from(orders)
    .where(and(gte(orders.createdAt, range.from), lte(orders.createdAt, range.to)));

  const refundRows = await db
    .select({ amount: refunds.amount, status: refunds.status, createdAt: refunds.createdAt })
    .from(refunds)
    .where(and(gte(refunds.createdAt, range.from), lte(refunds.createdAt, range.to)));

  const summary = computeFinancialSummary(orderRows, refundRows);
  return { from: range.from.toISOString(), to: range.to.toISOString(), ...summary };
}

export function buildFinanceCsv(summary: ReturnType<typeof computeFinancialSummary>): string {
  const header = 'metric,value';
  const lines = [
    ['orderCount', summary.orderCount],
    ['paidOrderCount', summary.paidOrderCount],
    ['grossRevenue', summary.grossRevenue],
    ['discountTotal', summary.discountTotal],
    ['shippingTotal', summary.shippingTotal],
    ['refundedTotal', summary.refundedTotal],
    ['netRevenue', summary.netRevenue],
    ['averageOrderValue', summary.averageOrderValue],
  ];
  return [header, ...lines.map(([key, value]) => `${key},${value}`)].join('\r\n') + '\r\n';
}
