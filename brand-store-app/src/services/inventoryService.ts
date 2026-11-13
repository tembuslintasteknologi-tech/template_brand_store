import { db } from '../db/index.js';
import { productVariants, inventoryLogs, products } from '../db/schema.js';
import { eq, sql } from 'drizzle-orm';
import { getDefaultStoreLocation } from './config/settings.js';
import { findReservedBranch } from './branch/branchStockService.js';
import { releaseStockAtBranch, reserveStockAtBranch } from './branch/branchReservationService.js';

export interface StockAdjustment {
  variantId: string;
  quantityChange: number;
  reason?: string;
  performedBy?: string;
  referenceId?: string;
}

export async function getVariantStock(variantId: string) {
  const [variant] = await db.select().from(productVariants).where(eq(productVariants.id, variantId));
  return variant;
}

export async function adjustStock(input: StockAdjustment) {
  const variant = await getVariantStock(input.variantId);
  if (!variant) {
    throw new Error('Product variant not found');
  }

  const prevStock = variant.stock;
  const newStock = prevStock + input.quantityChange;

  if (newStock < 0) {
    throw new Error('Insufficient stock for adjustment');
  }

  // Update variant stock
  await db.update(productVariants)
    .set({ stock: newStock, updatedAt: new Date() })
    .where(eq(productVariants.id, input.variantId));

  // Log inventory movement
  await db.insert(inventoryLogs).values({
    variantId: input.variantId,
    productId: variant.productId,
    changeType: input.quantityChange >= 0 ? 'adjustment_increase' : 'adjustment_decrease',
    quantityChange: input.quantityChange,
    previousStock: prevStock,
    newStock: newStock,
    reason: input.reason || 'Manual adjustment',
    referenceId: input.referenceId,
    performedBy: input.performedBy,
  });

  // Check low stock alert
  const isLowStock = newStock <= variant.lowStockThreshold;

  return {
    variantId: input.variantId,
    previousStock: prevStock,
    newStock,
    isLowStock,
  };
}

/**
 * Legacy wrapper (BR-011). Reservation now lives in `branch_inventory`, so this keeps the old
 * signature by resolving the pusat branch and delegating. New code should call
 * `reserveStockAtBranch` with the branch that actually sells the item.
 */
export async function reserveStock(variantId: string, quantity: number, referenceId: string) {
  const variant = await getVariantStock(variantId);
  if (!variant) {
    throw new Error('Product variant not found');
  }

  const pusat = await getDefaultStoreLocation();
  if (!pusat) {
    throw new Error('Cabang pusat tidak ditemukan, reservasi tidak bisa dilanjutkan');
  }

  const result = await reserveStockAtBranch(pusat.id, variantId, quantity, referenceId);
  return { success: true as const, reservedStock: result.reservedStock, branchId: result.branchId };
}

/**
 * Legacy wrapper (BR-011). The release goes back to the branch named in the reservation log, not
 * to the pusat, and the branch helper makes a repeated release a no-op.
 */
export async function releaseReservedStock(variantId: string, quantity: number, referenceId: string) {
  const variant = await getVariantStock(variantId);
  if (!variant) {
    throw new Error('Product variant not found');
  }

  const logs = await db
    .select()
    .from(inventoryLogs)
    .where(eq(inventoryLogs.referenceId, referenceId));

  const reservedBranch = findReservedBranch(logs as any, referenceId);
  const branchId = reservedBranch ?? (await getDefaultStoreLocation())?.id;
  if (!branchId) {
    throw new Error('Cabang reservasi tidak ditemukan, pelepasan tidak bisa dilanjutkan');
  }

  const result = await releaseStockAtBranch(branchId, variantId, quantity, referenceId);
  return {
    success: true as const,
    reservedStock: result.reservedStock,
    branchId: result.branchId,
    alreadyReleased: result.alreadyReleased,
  };
}
