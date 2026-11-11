import { db } from '../../db/index.js';
import { orders, products } from '../../db/schema.js';
import { and, desc, eq, lt, sql } from 'drizzle-orm';

export interface AdminAlert {
  type: 'new_order' | 'payment_failed' | 'low_stock';
  severity: 'info' | 'warning' | 'critical';
  message: string;
  referenceId: string;
  createdAt: string;
  metadata?: Record<string, unknown>;
}

export interface AlertOptions {
  lowStockThreshold?: number;
  newOrderWindowHours?: number;
  limit?: number;
}

export function classifyStock(stock: number, threshold: number): 'critical' | 'warning' | 'ok' {
  if (stock <= 0) return 'critical';
  if (stock <= threshold) return 'warning';
  return 'ok';
}

export async function buildAdminAlerts(options: AlertOptions = {}): Promise<AdminAlert[]> {
  const threshold = Math.max(options.lowStockThreshold ?? 5, 0);
  const windowHours = Math.max(options.newOrderWindowHours ?? 24, 1);
  const limit = Math.min(Math.max(options.limit ?? 20, 1), 100);

  const alerts: AdminAlert[] = [];

  const newOrders = await db
    .select({
      id: orders.id,
      orderNumber: orders.orderNumber,
      totalAmount: orders.totalAmount,
      createdAt: orders.createdAt,
    })
    .from(orders)
    .where(sql`${orders.createdAt} >= now() - (${windowHours} || ' hours')::interval`)
    .orderBy(desc(orders.createdAt))
    .limit(limit);

  for (const order of newOrders) {
    alerts.push({
      type: 'new_order',
      severity: 'info',
      message: `Order baru ${order.orderNumber} senilai ${order.totalAmount}`,
      referenceId: order.id,
      createdAt: order.createdAt.toISOString(),
      metadata: { orderNumber: order.orderNumber, totalAmount: order.totalAmount },
    });
  }

  const failedPayments = await db
    .select({
      id: orders.id,
      orderNumber: orders.orderNumber,
      status: orders.status,
      paymentDetails: orders.paymentDetails,
      updatedAt: orders.updatedAt,
    })
    .from(orders)
    .where(
      and(
        eq(orders.status, 'cancelled'),
        sql`coalesce(${orders.paymentDetails}->>'status', '') in ('failed', 'expired')`
      )
    )
    .orderBy(desc(orders.updatedAt))
    .limit(limit);

  for (const order of failedPayments) {
    const details = (order.paymentDetails ?? {}) as Record<string, unknown>;
    alerts.push({
      type: 'payment_failed',
      severity: 'warning',
      message: `Pembayaran ${String(details.status)} untuk ${order.orderNumber}`,
      referenceId: order.id,
      createdAt: order.updatedAt.toISOString(),
      metadata: { orderNumber: order.orderNumber, gateway: details.gateway ?? null },
    });
  }

  const lowStock = await db
    .select({
      id: products.id,
      title: products.title,
      sku: products.sku,
      stock: products.stock,
    })
    .from(products)
    .where(lt(products.stock, threshold + 1))
    .orderBy(products.stock)
    .limit(limit);

  for (const product of lowStock) {
    alerts.push({
      type: 'low_stock',
      severity: classifyStock(product.stock, threshold) === 'critical' ? 'critical' : 'warning',
      message: `Stok ${product.title} tinggal ${product.stock}`,
      referenceId: product.id,
      createdAt: new Date().toISOString(),
      metadata: { sku: product.sku, stock: product.stock, threshold },
    });
  }

  return alerts.sort((a, b) => (a.severity === b.severity ? b.createdAt.localeCompare(a.createdAt) : severityRank(b.severity) - severityRank(a.severity)));
}

function severityRank(severity: AdminAlert['severity']): number {
  if (severity === 'critical') return 3;
  if (severity === 'warning') return 2;
  return 1;
}
