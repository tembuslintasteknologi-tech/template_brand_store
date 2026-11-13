/**
 * Pure stock helpers for per-branch inventory (BR-004).
 *
 * Everything here is synchronous and side effect free so the allocation rules can be
 * tested without a database. The DB layer (BR-003 / BR-011) only reads rows, calls one
 * of these functions, then writes the returned values back.
 */

export interface BranchStockRow {
  branchId: string;
  variantId: string;
  stock: number;
  reservedStock: number;
  lowStockThreshold?: number;
}

export interface CartItem {
  branchId: string;
  variantId: string;
  quantity: number;
}

export interface ReservationPlan {
  branchId: string;
  variantId: string;
  quantity: number;
}

export type StockStatus = 'in_stock' | 'low_stock' | 'out_of_stock';

export type BranchStockErrorCode =
  | 'INVALID_QUANTITY'
  | 'BRANCH_STOCK_NOT_FOUND'
  | 'INSUFFICIENT_STOCK';

export class BranchStockError extends Error {
  readonly code: BranchStockErrorCode;

  constructor(code: BranchStockErrorCode, message: string) {
    super(message);
    this.name = 'BranchStockError';
    this.code = code;
  }
}

function keyOf(branchId: string, variantId: string): string {
  return `${branchId}::${variantId}`;
}

function assertQuantity(quantity: number): void {
  if (!Number.isInteger(quantity) || quantity <= 0) {
    throw new BranchStockError(
      'INVALID_QUANTITY',
      `Quantity must be a positive integer, received ${quantity}`
    );
  }
}

function assertBranchStockRow(row: BranchStockRow): void {
  if (!row.branchId || !row.variantId) {
    throw new BranchStockError(
      'BRANCH_STOCK_NOT_FOUND',
      'Branch stock row must have both branchId and variantId'
    );
  }
  if (!Number.isInteger(row.stock) || row.stock < 0) {
    throw new BranchStockError('INVALID_QUANTITY', `Stock must be zero or a positive integer`);
  }
  if (!Number.isInteger(row.reservedStock) || row.reservedStock < 0) {
    throw new BranchStockError('INVALID_QUANTITY', `Reserved stock must be zero or a positive integer`);
  }
}

/** Stock that can still be sold: total minus what is already reserved, never negative. */
export function resolveAvailable(row: BranchStockRow): number {
  assertBranchStockRow(row);
  return Math.max(0, row.stock - row.reservedStock);
}

export function canFulfill(row: BranchStockRow, quantity: number): boolean {
  assertQuantity(quantity);
  return resolveAvailable(row) >= quantity;
}

/**
 * Mirrors the storefront badge rules. A row falls back to the default threshold of 5 when
 * the caller does not pass one, matching product_variants.low_stock_threshold.
 */
export function stockStatus(row: BranchStockRow): StockStatus {
  const available = resolveAvailable(row);
  if (available <= 0) return 'out_of_stock';
  const threshold = row.lowStockThreshold ?? 5;
  return available <= threshold ? 'low_stock' : 'in_stock';
}

/**
 * Groups cart items by the branch the customer picked. Insertion order is preserved so the
 * resulting shipment order is stable between requests, which matters for OD-A where one
 * branch becomes one shipment.
 */
export function groupItemsByBranch(items: CartItem[]): Array<{ branchId: string; items: CartItem[] }> {
  const groups = new Map<string, CartItem[]>();
  for (const item of items) {
    assertQuantity(item.quantity);
    if (!item.branchId) {
      throw new BranchStockError('BRANCH_STOCK_NOT_FOUND', 'Cart item is missing branchId');
    }
    const bucket = groups.get(item.branchId);
    if (bucket) {
      bucket.push(item);
    } else {
      groups.set(item.branchId, [item]);
    }
  }
  return Array.from(groups.entries()).map(([branchId, groupedItems]) => ({
    branchId,
    items: groupedItems,
  }));
}

/**
 * Builds the reservation list for a cart. Duplicate variant lines on the same branch are
 * summed first, so reserving line by line can never sneak past the available check.
 */
export function planReservation(rows: BranchStockRow[], items: CartItem[]): ReservationPlan[] {
  if (items.length === 0) return [];

  const index = new Map<string, BranchStockRow>();
  for (const row of rows) {
    assertBranchStockRow(row);
    index.set(keyOf(row.branchId, row.variantId), row);
  }

  const totals = new Map<string, ReservationPlan>();
  for (const item of items) {
    assertQuantity(item.quantity);
    if (!item.branchId) {
      throw new BranchStockError('BRANCH_STOCK_NOT_FOUND', 'Cart item is missing branchId');
    }
    const key = keyOf(item.branchId, item.variantId);
    const existing = totals.get(key);
    if (existing) {
      existing.quantity += item.quantity;
    } else {
      totals.set(key, {
        branchId: item.branchId,
        variantId: item.variantId,
        quantity: item.quantity,
      });
    }
  }

  const plan = Array.from(totals.values());
  for (const entry of plan) {
    const row = index.get(keyOf(entry.branchId, entry.variantId));
    if (!row) {
      throw new BranchStockError(
        'BRANCH_STOCK_NOT_FOUND',
        `Branch ${entry.branchId} does not carry variant ${entry.variantId}`
      );
    }
    if (!canFulfill(row, entry.quantity)) {
      throw new BranchStockError(
        'INSUFFICIENT_STOCK',
        `Branch ${entry.branchId} only has ${resolveAvailable(row)} available for variant ${entry.variantId}, requested ${entry.quantity}`
      );
    }
  }
  return plan;
}

/** Returns a new row list with reserved stock increased. Input rows are not mutated. */
export function applyReserve(rows: BranchStockRow[], plan: ReservationPlan[]): BranchStockRow[] {
  const wanted = new Map<string, number>();
  for (const entry of plan) {
    assertQuantity(entry.quantity);
    const key = keyOf(entry.branchId, entry.variantId);
    wanted.set(key, (wanted.get(key) ?? 0) + entry.quantity);
  }

  const next = rows.map((row) => {
    const increment = wanted.get(keyOf(row.branchId, row.variantId));
    if (!increment) return { ...row };
    return { ...row, reservedStock: row.reservedStock + increment };
  });

  for (const key of wanted.keys()) {
    const found = next.some((row) => keyOf(row.branchId, row.variantId) === key);
    if (!found) {
      throw new BranchStockError('BRANCH_STOCK_NOT_FOUND', `Cannot reserve a branch row that does not exist: ${key}`);
    }
  }
  return next;
}

/**
 * Minimal shape of an inventory_logs row, so the reservation replay rules can be tested
 * without a database. Only the columns the rules actually look at are declared.
 */
export interface ReservationLogLike {
  referenceId?: string | null;
  changeType?: string | null;
  branchId?: string | null;
  variantId?: string | null;
  quantityChange?: number | null;
}

/**
 * Finds the branch a reference was reserved from (BR-011).
 *
 * A release must go back to the branch that took the reservation, never to the pusat or the
 * branch the admin happens to look at. Logs are scanned newest first inside the caller, so this
 * returns the first matching reservation. A log without a branch id is a legacy pusat
 * reservation from before branch_inventory existed and is ignored here; the caller falls back.
 */
export function findReservedBranch(
  logs: ReservationLogLike[],
  referenceId: string
): string | null {
  const reference = typeof referenceId === 'string' ? referenceId.trim() : '';
  if (!reference) return null;

  for (const log of logs) {
    if (log.referenceId !== reference) continue;
    if (log.changeType !== 'reservation') continue;
    if (typeof log.branchId === 'string' && log.branchId.length > 0) {
      return log.branchId;
    }
  }
  return null;
}

/**
 * True when the reference was already released. This is what makes a second release call safe:
 * the caller reports the current number instead of subtracting the quantity twice.
 */
export function hasReleasedReference(
  logs: ReservationLogLike[],
  referenceId: string
): boolean {
  const reference = typeof referenceId === 'string' ? referenceId.trim() : '';
  if (!reference) return false;
  return logs.some((log) => log.referenceId === reference && log.changeType === 'release');
}

/**
 * Returns a new row list with reserved stock released. Releases are clamped at zero, which
 * keeps a duplicate release call from pushing the number negative.
 */
export function applyRelease(rows: BranchStockRow[], plan: ReservationPlan[]): BranchStockRow[] {
  const wanted = new Map<string, number>();
  for (const entry of plan) {
    assertQuantity(entry.quantity);
    const key = keyOf(entry.branchId, entry.variantId);
    wanted.set(key, (wanted.get(key) ?? 0) + entry.quantity);
  }

  const next = rows.map((row) => {
    const decrement = wanted.get(keyOf(row.branchId, row.variantId));
    if (!decrement) return { ...row };
    return { ...row, reservedStock: Math.max(0, row.reservedStock - decrement) };
  });

  for (const key of wanted.keys()) {
    const found = next.some((row) => keyOf(row.branchId, row.variantId) === key);
    if (!found) {
      throw new BranchStockError('BRANCH_STOCK_NOT_FOUND', `Cannot release a branch row that does not exist: ${key}`);
    }
  }
  return next;
}
