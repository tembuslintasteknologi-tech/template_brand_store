/**
 * Stock transfer between branches (BR-014 / INV-008).
 *
 * The status machine is deliberately small and pure so every transition can be tested without a
 * database. Four statuses: draft, in_transit, received, cancelled. Approval is not a status: it
 * stamps `approved_by` and the row stays `draft`, because the checklist only allows four states and
 * `ship` is the moment stock really leaves the source branch.
 *
 * Stock rule: nothing moves while the transfer is draft. `ship` takes the quantity out of the
 * source branch once, `receive` puts the same quantity into the destination branch once, and both
 * writes resync the `product_variants.stock` aggregate, so no number is created or lost in between.
 * Reserved stock cannot be transferred; only available stock can leave a branch.
 */

import { db } from '../../db/index.js';
import {
  branchInventory,
  inventoryLogs,
  productVariants,
  stockTransfers,
  storeLocations,
} from '../../db/schema.js';
import { and, desc, eq, inArray, or, sql } from 'drizzle-orm';

export const STOCK_TRANSFER_STATUSES = ['draft', 'in_transit', 'received', 'cancelled'] as const;
export type StockTransferStatus = (typeof STOCK_TRANSFER_STATUSES)[number];

export const STOCK_TRANSFER_ACTIONS = ['approve', 'ship', 'receive', 'cancel'] as const;
export type StockTransferAction = (typeof STOCK_TRANSFER_ACTIONS)[number];

export type StockTransferErrorCode =
  | 'INVALID_QUANTITY'
  | 'BRANCH_REQUIRED'
  | 'SAME_BRANCH'
  | 'BRANCH_NOT_FOUND'
  | 'VARIANT_NOT_FOUND'
  | 'TRANSFER_NOT_FOUND'
  | 'INVALID_TRANSITION'
  | 'APPROVAL_REQUIRED'
  | 'ALREADY_APPROVED'
  | 'INSUFFICIENT_STOCK';

const STATUS_BY_CODE: Record<StockTransferErrorCode, number> = {
  INVALID_QUANTITY: 400,
  BRANCH_REQUIRED: 400,
  SAME_BRANCH: 409,
  BRANCH_NOT_FOUND: 404,
  VARIANT_NOT_FOUND: 404,
  TRANSFER_NOT_FOUND: 404,
  INVALID_TRANSITION: 409,
  APPROVAL_REQUIRED: 409,
  ALREADY_APPROVED: 409,
  INSUFFICIENT_STOCK: 409,
};

export class StockTransferError extends Error {
  readonly code: StockTransferErrorCode;
  readonly status: number;

  constructor(code: StockTransferErrorCode, message: string, status?: number) {
    super(message);
    this.name = 'StockTransferError';
    this.code = code;
    this.status = status ?? STATUS_BY_CODE[code];
  }
}

interface TransitionRule {
  from: StockTransferStatus;
  to: StockTransferStatus;
}

/** approve stays in draft on purpose: it only stamps approved_by. */
const TRANSITIONS: Record<StockTransferAction, TransitionRule> = {
  approve: { from: 'draft', to: 'draft' },
  ship: { from: 'draft', to: 'in_transit' },
  receive: { from: 'in_transit', to: 'received' },
  cancel: { from: 'draft', to: 'cancelled' },
};

/**
 * Pure state machine. Returns the status the row should have after the action, or throws
 * INVALID_TRANSITION when the action does not apply to the current status.
 */
export function nextStatus(
  status: StockTransferStatus,
  action: StockTransferAction
): StockTransferStatus {
  const rule = TRANSITIONS[action];
  if (!rule) {
    throw new StockTransferError(
      'INVALID_TRANSITION',
      `Aksi transfer tidak dikenal: ${action}`
    );
  }
  if (status !== rule.from) {
    throw new StockTransferError(
      'INVALID_TRANSITION',
      `Tidak bisa ${action} transfer berstatus ${status}, status yang dibutuhkan ${rule.from}`
    );
  }
  return rule.to;
}

export function assertTransferQuantity(quantity: number): void {
  if (!Number.isInteger(quantity) || quantity <= 0) {
    throw new StockTransferError(
      'INVALID_QUANTITY',
      `Jumlah transfer harus bilangan bulat positif, diterima ${quantity}`
    );
  }
}

/** A transfer to the same branch is always a data entry mistake, never a real movement. */
export function assertDistinctBranches(fromBranchId: unknown, toBranchId: unknown): void {
  const from = typeof fromBranchId === 'string' ? fromBranchId.trim() : '';
  const to = typeof toBranchId === 'string' ? toBranchId.trim() : '';
  if (!from || !to) {
    throw new StockTransferError(
      'BRANCH_REQUIRED',
      'fromBranchId dan toBranchId wajib diisi'
    );
  }
  if (from === to) {
    throw new StockTransferError(
      'SAME_BRANCH',
      'Cabang asal dan cabang tujuan tidak boleh sama'
    );
  }
}

export interface TransferStockRow {
  stock: number;
  reservedStock: number;
}

/** Ship removes from total stock, but never touches reserved stock. */
export function applyShipStock<T extends TransferStockRow>(
  row: T,
  quantity: number
): T {
  assertTransferQuantity(quantity);
  const available = Math.max(0, Number(row.stock) - Number(row.reservedStock));
  if (available < quantity) {
    throw new StockTransferError(
      'INSUFFICIENT_STOCK',
      `Stok tersedia cabang asal hanya ${available}, diminta ${quantity}`
    );
  }
  return { ...row, stock: Number(row.stock) - quantity };
}

export function applyReceiveStock<T extends TransferStockRow>(
  row: T,
  quantity: number
): T {
  assertTransferQuantity(quantity);
  return { ...row, stock: Number(row.stock) + quantity };
}

export interface CreateStockTransferInput {
  fromBranchId: string;
  toBranchId: string;
  variantId: string;
  quantity: number;
  note?: string;
  requestedBy?: string;
}

export interface ListStockTransfersFilter {
  status?: string;
  branchId?: string;
  limit?: number;
}

function safeLimit(limit?: number): number {
  return Number.isInteger(limit) ? Math.min(Math.max(limit as number, 1), 500) : 100;
}

export async function listStockTransfers(filter: ListStockTransfersFilter = {}) {
  const conditions = [] as unknown[];
  if (filter.status) conditions.push(eq(stockTransfers.status, filter.status));
  if (filter.branchId) {
    conditions.push(
      or(
        eq(stockTransfers.fromBranchId, filter.branchId as any),
        eq(stockTransfers.toBranchId, filter.branchId as any)
      )
    );
  }

  return db
    .select()
    .from(stockTransfers)
    .where(conditions.length ? and(...(conditions as any[])) : undefined)
    .orderBy(desc(stockTransfers.createdAt))
    .limit(safeLimit(filter.limit));
}

async function assertBranchesExist(fromBranchId: string, toBranchId: string): Promise<void> {
  const rows = await db
    .select({ id: storeLocations.id })
    .from(storeLocations)
    .where(inArray(storeLocations.id, [fromBranchId as any, toBranchId as any]));
  const found = new Set(rows.map((row) => row.id));

  if (!found.has(fromBranchId)) {
    throw new StockTransferError(
      'BRANCH_NOT_FOUND',
      `Cabang asal tidak ditemukan: ${fromBranchId}`
    );
  }
  if (!found.has(toBranchId)) {
    throw new StockTransferError(
      'BRANCH_NOT_FOUND',
      `Cabang tujuan tidak ditemukan: ${toBranchId}`
    );
  }
}

async function assertVariantExists(variantId: string): Promise<void> {
  const [variant] = await db
    .select({ id: productVariants.id })
    .from(productVariants)
    .where(eq(productVariants.id, variantId as any))
    .limit(1);
  if (!variant) {
    throw new StockTransferError('VARIANT_NOT_FOUND', `Variant tidak ditemukan: ${variantId}`);
  }
}

export async function createStockTransfer(input: CreateStockTransferInput) {
  assertTransferQuantity(Number(input.quantity));
  assertDistinctBranches(input.fromBranchId, input.toBranchId);

  await assertBranchesExist(input.fromBranchId, input.toBranchId);
  await assertVariantExists(input.variantId);

  const [created] = await db
    .insert(stockTransfers)
    .values({
      fromBranchId: input.fromBranchId as any,
      toBranchId: input.toBranchId as any,
      variantId: input.variantId as any,
      quantity: Number(input.quantity),
      status: 'draft',
      note: input.note,
      requestedBy: input.requestedBy as any,
    })
    .returning();

  return created;
}

/** Locks the transfer row so two admins cannot ship or receive the same row twice. */
async function loadTransferForUpdate(tx: any, id: string) {
  const [row] = await tx
    .select()
    .from(stockTransfers)
    .where(eq(stockTransfers.id, id as any))
    .for('update');
  if (!row) {
    throw new StockTransferError('TRANSFER_NOT_FOUND', `Transfer tidak ditemukan: ${id}`);
  }
  return row;
}

async function loadBranchRowWith(tx: any, branchId: string, variantId: string) {
  const [row] = await tx
    .select()
    .from(branchInventory)
    .where(
      and(
        eq(branchInventory.branchId, branchId as any),
        eq(branchInventory.variantId, variantId as any)
      )
    )
    .limit(1);
  return row ?? null;
}

/** Creates the destination row when the branch has never carried that variant. */
async function ensureBranchRowWith(tx: any, branchId: string, variantId: string) {
  const existing = await loadBranchRowWith(tx, branchId, variantId);
  if (existing) return existing;

  const [variant] = await tx
    .select({
      id: productVariants.id,
      lowStockThreshold: productVariants.lowStockThreshold,
    })
    .from(productVariants)
    .where(eq(productVariants.id, variantId as any))
    .limit(1);
  if (!variant) {
    throw new StockTransferError('VARIANT_NOT_FOUND', `Variant tidak ditemukan: ${variantId}`);
  }

  const [created] = await tx
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

  const raced = await loadBranchRowWith(tx, branchId, variantId);
  if (!raced) {
    throw new StockTransferError(
      'BRANCH_NOT_FOUND',
      `Baris stok cabang tidak bisa dibuat: ${branchId}/${variantId}`
    );
  }
  return raced;
}

async function syncVariantAggregateWith(tx: any, variantId: string): Promise<number> {
  const [totals] = await tx
    .select({ total: sql<number>`coalesce(sum(${branchInventory.stock}), 0)` })
    .from(branchInventory)
    .where(eq(branchInventory.variantId, variantId as any));

  const total = Number(totals?.total ?? 0);
  await tx
    .update(productVariants)
    .set({ stock: total, updatedAt: new Date() })
    .where(eq(productVariants.id, variantId as any));
  return total;
}

async function productIdOfWith(tx: any, variantId: string): Promise<string> {
  const [variant] = await tx
    .select({ productId: productVariants.productId })
    .from(productVariants)
    .where(eq(productVariants.id, variantId as any))
    .limit(1);
  if (!variant) {
    throw new StockTransferError('VARIANT_NOT_FOUND', `Variant tidak ditemukan: ${variantId}`);
  }
  return variant.productId;
}

export async function approveStockTransfer(id: string, actorId?: string) {
  return db.transaction(async (tx) => {
    const row = await loadTransferForUpdate(tx, id);
    nextStatus(row.status as StockTransferStatus, 'approve');
    if (row.approvedBy) {
      throw new StockTransferError('ALREADY_APPROVED', `Transfer ${id} sudah disetujui`);
    }

    const [updated] = await tx
      .update(stockTransfers)
      .set({ approvedBy: (actorId ?? null) as any, updatedAt: new Date() })
      .where(eq(stockTransfers.id, id as any))
      .returning();
    return updated;
  });
}

export async function shipStockTransfer(id: string, actorId?: string) {
  return db.transaction(async (tx) => {
    const row = await loadTransferForUpdate(tx, id);
    nextStatus(row.status as StockTransferStatus, 'ship');
    if (!row.approvedBy) {
      throw new StockTransferError(
        'APPROVAL_REQUIRED',
        `Transfer ${id} harus disetujui dulu sebelum dikirim`
      );
    }

    const source = await loadBranchRowWith(tx, row.fromBranchId, row.variantId);
    const previousStock = source ? Number(source.stock) : 0;
    if (!source) {
      throw new StockTransferError(
        'INSUFFICIENT_STOCK',
        `Cabang asal belum punya baris stok untuk variant ${row.variantId}`
      );
    }

    const next = applyShipStock(
      { stock: previousStock, reservedStock: Number(source.reservedStock) },
      Number(row.quantity)
    );

    await tx
      .update(branchInventory)
      .set({ stock: next.stock, updatedAt: new Date() })
      .where(eq(branchInventory.id, source.id));

    const productId = await productIdOfWith(tx, row.variantId);
    await tx.insert(inventoryLogs).values({
      branchId: row.fromBranchId as any,
      variantId: row.variantId as any,
      productId: productId as any,
      changeType: 'transfer_out',
      quantityChange: -Number(row.quantity),
      previousStock,
      newStock: next.stock,
      reason: `Transfer keluar ke cabang ${row.toBranchId}`,
      referenceId: row.id,
      performedBy: (actorId ?? null) as any,
    });

    await syncVariantAggregateWith(tx, row.variantId);

    const [updated] = await tx
      .update(stockTransfers)
      .set({ status: 'in_transit', shippedAt: new Date(), updatedAt: new Date() })
      .where(eq(stockTransfers.id, id as any))
      .returning();
    return updated;
  });
}

export async function receiveStockTransfer(id: string, actorId?: string) {
  return db.transaction(async (tx) => {
    const row = await loadTransferForUpdate(tx, id);
    nextStatus(row.status as StockTransferStatus, 'receive');

    const destination = await ensureBranchRowWith(tx, row.toBranchId, row.variantId);
    const previousStock = Number(destination.stock);
    const next = applyReceiveStock(
      { stock: previousStock, reservedStock: Number(destination.reservedStock) },
      Number(row.quantity)
    );

    await tx
      .update(branchInventory)
      .set({ stock: next.stock, updatedAt: new Date() })
      .where(eq(branchInventory.id, destination.id));

    const productId = await productIdOfWith(tx, row.variantId);
    await tx.insert(inventoryLogs).values({
      branchId: row.toBranchId as any,
      variantId: row.variantId as any,
      productId: productId as any,
      changeType: 'transfer_in',
      quantityChange: Number(row.quantity),
      previousStock,
      newStock: next.stock,
      reason: `Transfer masuk dari cabang ${row.fromBranchId}`,
      referenceId: row.id,
      performedBy: (actorId ?? null) as any,
    });

    await syncVariantAggregateWith(tx, row.variantId);

    const [updated] = await tx
      .update(stockTransfers)
      .set({ status: 'received', receivedAt: new Date(), updatedAt: new Date() })
      .where(eq(stockTransfers.id, id as any))
      .returning();
    return updated;
  });
}

export async function cancelStockTransfer(id: string, _actorId?: string) {
  return db.transaction(async (tx) => {
    const row = await loadTransferForUpdate(tx, id);
    nextStatus(row.status as StockTransferStatus, 'cancel');

    const [updated] = await tx
      .update(stockTransfers)
      .set({ status: 'cancelled', updatedAt: new Date() })
      .where(eq(stockTransfers.id, id as any))
      .returning();
    return updated;
  });
}
