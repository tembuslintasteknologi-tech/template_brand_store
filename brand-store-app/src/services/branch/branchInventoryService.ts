/**
 * Per-branch stock reads and adjustments (BR-006).
 *
 * Every function takes the branch id from the caller, and the route layer fills that id from
 * the authenticated session, never from the request body. branch_inventory is the source of
 * truth; product_variants.stock is recalculated as the aggregate after every write so the old
 * catalog queries keep returning a sensible number.
 */

import { db } from '../../db/index.js';
import {
  branchInventory,
  inventoryLogs,
  productVariants,
  products,
} from '../../db/schema.js';
import { and, desc, eq, sql } from 'drizzle-orm';
import { BranchStockError, resolveAvailable, stockStatus } from './branchStockService.js';

export interface BranchInventoryItem {
  branchId: string;
  variantId: string;
  productId: string;
  productName: string;
  productSlug: string;
  sku: string;
  stock: number;
  reservedStock: number;
  available: number;
  lowStockThreshold: number;
  stockStatus: 'in_stock' | 'low_stock' | 'out_of_stock';
  updatedAt: Date;
}

export interface AdjustBranchStockInput {
  branchId: string;
  variantId: string;
  quantityChange: number;
  reason: string;
  performedBy?: string;
  referenceId?: string;
}

export async function listBranchInventory(branchId: string): Promise<BranchInventoryItem[]> {
  const rows = await db
    .select({
      branchId: branchInventory.branchId,
      variantId: branchInventory.variantId,
      productId: products.id,
      productName: products.title,
      productSlug: products.slug,
      sku: productVariants.sku,
      stock: branchInventory.stock,
      reservedStock: branchInventory.reservedStock,
      lowStockThreshold: branchInventory.lowStockThreshold,
      updatedAt: branchInventory.updatedAt,
    })
    .from(branchInventory)
    .innerJoin(productVariants, eq(branchInventory.variantId, productVariants.id))
    .innerJoin(products, eq(productVariants.productId, products.id))
    .where(eq(branchInventory.branchId, branchId as any))
    .orderBy(desc(branchInventory.updatedAt));

  return rows.map((row) => ({
    ...row,
    available: resolveAvailable(row),
    stockStatus: stockStatus(row),
  }));
}

async function ensureBranchRow(branchId: string, variantId: string) {
  const [existing] = await db
    .select()
    .from(branchInventory)
    .where(and(eq(branchInventory.branchId, branchId as any), eq(branchInventory.variantId, variantId as any)))
    .limit(1);
  if (existing) return existing;

  const [variant] = await db
    .select({ id: productVariants.id, lowStockThreshold: productVariants.lowStockThreshold })
    .from(productVariants)
    .where(eq(productVariants.id, variantId as any))
    .limit(1);
  if (!variant) {
    throw new BranchStockError('BRANCH_STOCK_NOT_FOUND', `Variant tidak ditemukan: ${variantId}`);
  }

  const [created] = await db
    .insert(branchInventory)
    .values({
      branchId: branchId as any,
      variantId: variantId as any,
      stock: 0,
      reservedStock: 0,
      lowStockThreshold: variant.lowStockThreshold,
    })
    .onConflictDoNothing()
    .returning();

  if (created) return created;

  const [raced] = await db
    .select()
    .from(branchInventory)
    .where(and(eq(branchInventory.branchId, branchId as any), eq(branchInventory.variantId, variantId as any)))
    .limit(1);
  return raced;
}

async function syncVariantAggregate(variantId: string) {
  const [totals] = await db
    .select({ total: sql<number>`coalesce(sum(${branchInventory.stock}), 0)` })
    .from(branchInventory)
    .where(eq(branchInventory.variantId, variantId as any));

  await db
    .update(productVariants)
    .set({ stock: Number(totals?.total ?? 0), updatedAt: new Date() })
    .where(eq(productVariants.id, variantId as any));

  return Number(totals?.total ?? 0);
}

export async function adjustBranchStock(input: AdjustBranchStockInput) {
  const quantityChange = Number(input.quantityChange);
  if (!Number.isInteger(quantityChange) || quantityChange === 0) {
    throw new BranchStockError(
      'INVALID_QUANTITY',
      'Perubahan stok harus bilangan bulat dan tidak nol'
    );
  }
  const reason = typeof input.reason === 'string' ? input.reason.trim() : '';
  if (!reason) {
    throw new BranchStockError('INVALID_QUANTITY', 'Alasan penyesuaian stok wajib diisi');
  }

  const row = await ensureBranchRow(input.branchId, input.variantId);
  if (!row) {
    throw new BranchStockError('BRANCH_STOCK_NOT_FOUND', 'Baris stok cabang tidak bisa dibuat');
  }

  const previousStock = row.stock;
  const newStock = previousStock + quantityChange;
  if (newStock < 0) {
    throw new BranchStockError(
      'INSUFFICIENT_STOCK',
      `Stok cabang tidak cukup, stok saat ini ${previousStock}, perubahan ${quantityChange}`
    );
  }

  const [updated] = await db
    .update(branchInventory)
    .set({ stock: newStock, updatedAt: new Date() })
    .where(eq(branchInventory.id, row.id))
    .returning();

  const [variant] = await db
    .select({ productId: productVariants.productId })
    .from(productVariants)
    .where(eq(productVariants.id, input.variantId as any))
    .limit(1);

  await db.insert(inventoryLogs).values({
    branchId: input.branchId as any,
    variantId: input.variantId as any,
    productId: variant!.productId,
    changeType: quantityChange > 0 ? 'adjustment_increase' : 'adjustment_decrease',
    quantityChange,
    previousStock,
    newStock,
    reason,
    referenceId: input.referenceId,
    performedBy: input.performedBy as any,
  });

  const aggregateStock = await syncVariantAggregate(input.variantId);

  return {
    branchId: input.branchId,
    variantId: input.variantId,
    previousStock,
    newStock,
    quantityChange,
    available: resolveAvailable(updated),
    stockStatus: stockStatus(updated),
    aggregateStock,
  };
}

export async function listBranchInventoryLogs(branchId: string, limit = 100) {
  const safeLimit = Number.isInteger(limit) ? Math.min(Math.max(limit, 1), 500) : 100;
  return db
    .select()
    .from(inventoryLogs)
    .where(eq(inventoryLogs.branchId, branchId as any))
    .orderBy(desc(inventoryLogs.createdAt))
    .limit(safeLimit);
}
