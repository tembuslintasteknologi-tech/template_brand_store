import { db } from '../../db/index.js';
import { orders } from '../../db/schema.js';
import { eq } from 'drizzle-orm';
import { DEFAULT_TEMPLATES, ensureDefaultTemplates, notify } from './notificationService.js';

export interface OrderNotificationContext {
  orderNumber: string;
  totalAmount?: string | number | null;
  awb?: string | null;
  status?: string | null;
}

const ORDER_EVENT_TEMPLATES: Record<string, string> = {
  created: 'order.created',
  paid: 'order.paid',
  shipped: 'order.shipped',
  delivered: 'order.delivered',
  payment_failed: 'payment.failed',
};

export function templateForOrderEvent(event: string): string | null {
  return ORDER_EVENT_TEMPLATES[event] ?? null;
}

async function ensureTemplate(code: string): Promise<void> {
  const known = DEFAULT_TEMPLATES.some((template) => template.code === code);
  if (!known) return;
  await ensureDefaultTemplates();
}

/**
 * Sends an in-app and (when allowed) email notification for an order event.
 * Never throws: a notification failure must not break checkout, payment, or
 * logistics flows.
 */
export async function notifyOrderEvent(
  customerId: string | null | undefined,
  event: string,
  context: OrderNotificationContext
): Promise<{ sent: boolean; reason?: string }> {
  const templateCode = templateForOrderEvent(event);
  if (!templateCode) return { sent: false, reason: `event tidak dikenal: ${event}` };
  if (!customerId) return { sent: false, reason: 'order tidak punya customerId' };

  try {
    await ensureTemplate(templateCode);
    const result = await notify({
      userId: customerId,
      templateCode,
      vars: {
        orderNumber: context.orderNumber,
        totalAmount: context.totalAmount ?? '',
        awb: context.awb ?? '',
        status: context.status ?? '',
      },
      data: {
        event,
        orderNumber: context.orderNumber,
        awb: context.awb ?? null,
        status: context.status ?? null,
      },
    });
    return { sent: !result.skipped, reason: result.reason ?? undefined };
  } catch (err: any) {
    console.warn('[notification] gagal mengirim notifikasi:', err?.message ?? err);
    return { sent: false, reason: err?.message ?? 'notification failed' };
  }
}

export async function notifyOrderByNumber(orderNumber: string, event: string, extra: Partial<OrderNotificationContext> = {}) {
  const [order] = await db.select().from(orders).where(eq(orders.orderNumber, orderNumber)).limit(1);
  if (!order) return { sent: false, reason: 'order tidak ditemukan' };
  return notifyOrderEvent(order.customerId, event, {
    orderNumber: order.orderNumber,
    totalAmount: order.totalAmount,
    ...extra,
  });
}
