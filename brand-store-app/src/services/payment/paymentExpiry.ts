import { db } from '../../db/index.js';
import { orders } from '../../db/schema.js';
import { and, isNotNull, lt, eq } from 'drizzle-orm';
import { unifiedConfig } from '../../config/unifiedConfig.js';

export function resolvePaymentExpiry(now: Date, expiryMinutes: number): Date {
  const minutes = Number.isFinite(expiryMinutes) && expiryMinutes > 0 ? expiryMinutes : 0;
  return new Date(now.getTime() + minutes * 60 * 1000);
}

export function isPaymentExpired(expiresAt: Date | string | null | undefined, now: Date): boolean {
  if (!expiresAt) return false;
  const value = expiresAt instanceof Date ? expiresAt : new Date(expiresAt);
  if (Number.isNaN(value.getTime())) return false;
  return value.getTime() <= now.getTime();
}

export function buildExpiredPaymentDetails(
  current: unknown,
  now: Date
): Record<string, unknown> {
  const base = current && typeof current === 'object' ? (current as Record<string, unknown>) : {};
  return {
    ...base,
    status: 'expired',
    expiredAt: now.toISOString(),
  };
}

export interface ExpiredOrder {
  id: string;
  orderNumber: string;
}

export async function expirePendingOrders(now: Date = new Date()): Promise<ExpiredOrder[]> {
  const candidates = await db
    .select({
      id: orders.id,
      orderNumber: orders.orderNumber,
      paymentDetails: orders.paymentDetails,
    })
    .from(orders)
    .where(and(eq(orders.status, 'pending'), isNotNull(orders.expiresAt), lt(orders.expiresAt, now)));

  const expired: ExpiredOrder[] = [];

  for (const candidate of candidates) {
    await db
      .update(orders)
      .set({
        status: 'cancelled',
        paymentDetails: buildExpiredPaymentDetails(candidate.paymentDetails, now),
        updatedAt: now,
      })
      .where(eq(orders.id, candidate.id));
    expired.push({ id: candidate.id, orderNumber: candidate.orderNumber });
  }

  return expired;
}

export function defaultPaymentExpiryMinutes(): number {
  return unifiedConfig.brand.paymentExpiryMinutes;
}
