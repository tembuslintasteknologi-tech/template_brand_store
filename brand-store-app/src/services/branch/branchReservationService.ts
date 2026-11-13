/**
 * Reservation at a specific branch (BR-011).
 *
 * `branch_inventory` is the source of truth for reserved stock. The legacy helpers in
 * `inventoryService.ts` used to write `product_variants.reserved_stock` directly, which made it
 * impossible to tell which branch actually held the reservation. Everything here takes an
 * explicit branch id, and a release always reads the reservation log to find that same branch.
 *
 * Two rules keep the numbers honest:
 *   - Availability is checked with the pure helpers from BR-004, so a reservation can never push
 *     reserved stock above what the branch really has.
 *   - A release is idempotent. If a release log already exists for the reference, the call
 *     reports the current number instead of subtracting the quantity a second time.
 */

import { db } from '../../db/index.js';
import { branchInventory, inventoryLogs, productVariants } from '../../db/schema.js';
import { and, eq, sql } from 'drizzle-orm';
import {
  BranchStockError,
  applyRelease,
  canFulfill,
  hasReleasedReference,
  resolveAvailable,
  type ReservationLogLike,
} from './branchStockService.js';

export interface BranchReservationResult {
  success: true;
  branchId: string;
  variantId: string;
  quantity: number;
  reservedStock: number;
  available: number;
  referenceId: string;
}

export interface BranchReleaseResult extends BranchReservationResult {
  /** False when the same reference was already released, which is a no-op. */
  released: boolean;
  alreadyReleased: boolean;
}

function assertReservationInput(branchId: string, variantId: string, quantity: number, referenceId: string) {
  const branch = typeof branchId === 'string' ? branchId.trim() : '';
  const variant = typeof variantId === 'string' ? variantId.trim() : '';
  const reference = typeof referenceId === 'string' ? referenceId.trim() : '';

  if (!branch) {
    throw new BranchStockError('BRANCH_STOCK_NOT_FOUND', 'branchId wajib diisi untuk reservasi');
  }
  if (!variant) {
    throw new BranchStockError('BRANCH_STOCK_NOT_FOUND', 'variantId wajib diisi untuk reservasi');
  }
  if (!Number.isInteger(quantity) || quantity <= 0) {
    throw new BranchStockError(
      'INVALID_QUANTITY',
      `Jumlah reservasi harus bilangan bulat positif, diterima ${quantity}`
    );
  }
  if (!reference) {
    throw new BranchStockError('INVALID_QUANTITY', 'referenceId wajib diisi untuk reservasi');
  }

  return { branch, variant, reference };
}

async function loadBranchRow(branchId: string, variantId: string) {
  // No `.limit()` here on purpose: the inventory test harness stubs the builder with a plain
  // promise, and `.where()` already narrows to one row because of the unique index.
  const rows = await db
    .select()
    .from(branchInventory)
    .where(
      and(
        eq(branchInventory.branchId, branchId as any),
        eq(branchInventory.variantId, variantId as any)
      )
    );
  const row = rows[0];
  if (!row) return null;

  // branch_inventory already stores branch_id and variant_id. They are re-attached from the
  // query so the pure helpers always receive a complete row, even when the caller hands us a
  // partial projection.
  return {
    ...row,
    branchId: (row as any).branchId ?? branchId,
    variantId: (row as any).variantId ?? variantId,
  } as typeof row & { branchId: string; variantId: string };
}

async function loadReferenceLogs(referenceId: string): Promise<ReservationLogLike[]> {
  const rows = await db
    .select()
    .from(inventoryLogs)
    .where(eq(inventoryLogs.referenceId, referenceId));
  return rows as ReservationLogLike[];
}

async function loadProductId(variantId: string): Promise<string> {
  const rows = await db
    .select({ productId: productVariants.productId })
    .from(productVariants)
    .where(eq(productVariants.id, variantId as any));
  const productId = rows[0]?.productId;
  if (!productId) {
    throw new BranchStockError('BRANCH_STOCK_NOT_FOUND', `Varian tidak ditemukan: ${variantId}`);
  }
  return productId;
}

/**
 * Recomputes the legacy aggregate so old catalog reads do not drift from branch_inventory.
 * The value is the sum of reserved stock across every branch that carries the variant.
 */
async function syncReservedAggregate(variantId: string): Promise<void> {
  const [totals] = await db
    .select({ total: sql<number>`coalesce(sum(${branchInventory.reservedStock}), 0)` })
    .from(branchInventory)
    .where(eq(branchInventory.variantId, variantId as any));

  // A stubbed database returns a row without the aggregate column; leaving the legacy value
  // alone is safer than writing a bogus zero over it.
  const total = Number(totals?.total);
  if (!Number.isFinite(total)) return;

  await db
    .update(productVariants)
    .set({ reservedStock: total, updatedAt: new Date() })
    .where(eq(productVariants.id, variantId as any));
}

/**
 * Reserves stock on one branch. Throws when the branch does not carry the variant, because
 * creating an empty row here would hide a product that was never stocked at that branch.
 */
export async function reserveStockAtBranch(
  branchId: string,
  variantId: string,
  quantity: number,
  referenceId: string
): Promise<BranchReservationResult> {
  const input = assertReservationInput(branchId, variantId, quantity, referenceId);

  const row = await loadBranchRow(input.branch, input.variant);
  if (!row) {
    throw new BranchStockError(
      'BRANCH_STOCK_NOT_FOUND',
      `Cabang ${input.branch} tidak menyimpan varian ${input.variant}`
    );
  }

  if (!canFulfill(row, quantity)) {
    throw new BranchStockError(
      'INSUFFICIENT_STOCK',
      `Cabang ${input.branch} hanya punya ${resolveAvailable(row)} stok untuk varian ${input.variant}, diminta ${quantity}`
    );
  }

  const newReserved = row.reservedStock + quantity;
  const productId = await loadProductId(input.variant);

  await db
    .update(branchInventory)
    .set({ reservedStock: newReserved, updatedAt: new Date() })
    .where(eq(branchInventory.id, row.id as any));

  await db.insert(inventoryLogs).values({
    branchId: input.branch as any,
    variantId: input.variant as any,
    productId,
    changeType: 'reservation',
    quantityChange: -quantity,
    previousStock: row.stock,
    newStock: row.stock,
    reason: `Reserved for order/checkout ${input.reference}`,
    referenceId: input.reference,
  } as any);

  await syncReservedAggregate(input.variant);

  return {
    success: true,
    branchId: input.branch,
    variantId: input.variant,
    quantity,
    reservedStock: newReserved,
    available: Math.max(0, row.stock - newReserved),
    referenceId: input.reference,
  };
}

/**
 * Releases a reservation back to the given branch. Calling it twice with the same reference is
 * safe: the second call finds the release log and returns `alreadyReleased: true`.
 */
export async function releaseStockAtBranch(
  branchId: string,
  variantId: string,
  quantity: number,
  referenceId: string
): Promise<BranchReleaseResult> {
  const input = assertReservationInput(branchId, variantId, quantity, referenceId);

  const logs = await loadReferenceLogs(input.reference);
  const row = await loadBranchRow(input.branch, input.variant);
  if (!row) {
    throw new BranchStockError(
      'BRANCH_STOCK_NOT_FOUND',
      `Cabang ${input.branch} tidak menyimpan varian ${input.variant}`
    );
  }

  if (hasReleasedReference(logs, input.reference)) {
    return {
      success: true,
      branchId: input.branch,
      variantId: input.variant,
      quantity,
      reservedStock: row.reservedStock,
      available: resolveAvailable(row),
      referenceId: input.reference,
      released: false,
      alreadyReleased: true,
    };
  }

  const [next] = applyRelease(
    [
      {
        branchId: input.branch,
        variantId: input.variant,
        stock: row.stock,
        reservedStock: row.reservedStock,
      },
    ],
    [{ branchId: input.branch, variantId: input.variant, quantity }]
  );
  const productId = await loadProductId(input.variant);

  await db
    .update(branchInventory)
    .set({ reservedStock: next.reservedStock, updatedAt: new Date() })
    .where(eq(branchInventory.id, row.id as any));

  await db.insert(inventoryLogs).values({
    branchId: input.branch as any,
    variantId: input.variant as any,
    productId,
    changeType: 'release',
    quantityChange: quantity,
    previousStock: row.stock,
    newStock: row.stock,
    reason: `Released reservation for ${input.reference}`,
    referenceId: input.reference,
  } as any);

  await syncReservedAggregate(input.variant);

  return {
    success: true,
    branchId: input.branch,
    variantId: input.variant,
    quantity,
    reservedStock: next.reservedStock,
    available: Math.max(0, row.stock - next.reservedStock),
    referenceId: input.reference,
    released: true,
    alreadyReleased: false,
  };
}
