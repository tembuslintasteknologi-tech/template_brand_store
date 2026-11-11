import { db } from '../db/index.js';
import { productVariants, inventoryLogs, products } from '../db/schema.js';
import { eq, sql } from 'drizzle-orm';

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

export async function reserveStock(variantId: string, quantity: number, referenceId: string) {
  const variant = await getVariantStock(variantId);
  if (!variant) {
    throw new Error('Product variant not found');
  }

  const available = variant.stock - variant.reservedStock;
  if (available < quantity) {
    throw new Error('Insufficient available stock for reservation');
  }

  const newReserved = variant.reservedStock + quantity;

  await db.update(productVariants)
    .set({ reservedStock: newReserved, updatedAt: new Date() })
    .where(eq(productVariants.id, variantId));

  await db.insert(inventoryLogs).values({
    variantId,
    productId: variant.productId,
    changeType: 'reservation',
    quantityChange: -quantity,
    previousStock: variant.stock,
    newStock: variant.stock,
    reason: `Reserved for order/checkout ${referenceId}`,
    referenceId,
  });

  return { success: true, reservedStock: newReserved };
}

export async function releaseReservedStock(variantId: string, quantity: number, referenceId: string) {
  const variant = await getVariantStock(variantId);
  if (!variant) {
    throw new Error('Product variant not found');
  }

  const newReserved = Math.max(0, variant.reservedStock - quantity);

  await db.update(productVariants)
    .set({ reservedStock: newReserved, updatedAt: new Date() })
    .where(eq(productVariants.id, variantId));

  await db.insert(inventoryLogs).values({
    variantId,
    productId: variant.productId,
    changeType: 'release',
    quantityChange: quantity,
    previousStock: variant.stock,
    newStock: variant.stock,
    reason: `Released reservation for ${referenceId}`,
    referenceId,
  });

  return { success: true, reservedStock: newReserved };
}
