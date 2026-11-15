/**
 * Flash sale domain logic (FLS-001, FLS-002, FLS-004, FLS-005, FLS-006).
 *
 * Everything here is pure: no database, no clock side effect. The route layer reads rows,
 * calls these helpers, and writes the result back. That keeps the rules testable without a
 * running Postgres, which is how the rest of the branch module is structured too.
 *
 * Time window is inclusive on both ends: a sale is `active` when
 * `startAt <= now <= endAt`. A sale that ends exactly at `endAt` is still buyable at that
 * millisecond, and becomes `ended` one millisecond later.
 */

import { roundCurrency } from '../promoEngine.js';

export type FlashSaleStatus = 'inactive' | 'upcoming' | 'active' | 'ended';

export type FlashSaleDiscountType = 'percentage' | 'fixed';

export const FLASH_SALE_DISCOUNT_TYPES: FlashSaleDiscountType[] = ['percentage', 'fixed'];

export type FlashSaleErrorCode =
  | 'INVALID_WINDOW'
  | 'INVALID_TITLE'
  | 'INVALID_DISCOUNT'
  | 'INVALID_STOCK'
  | 'INVALID_QUANTITY'
  | 'INVALID_LIMIT'
  | 'SALE_NOT_FOUND'
  | 'ITEM_NOT_FOUND'
  | 'ITEM_ALREADY_EXISTS'
  | 'SALE_INACTIVE'
  | 'SALE_NOT_STARTED'
  | 'SALE_ENDED'
  | 'OUT_OF_STOCK'
  | 'PER_USER_LIMIT_REACHED';

export class FlashSaleError extends Error {
  readonly code: FlashSaleErrorCode;
  readonly status: number;

  constructor(code: FlashSaleErrorCode, message: string, status = 400) {
    super(message);
    this.name = 'FlashSaleError';
    this.code = code;
    this.status = status;
  }
}

export const FLASH_SALE_TITLE_MIN = 3;
export const FLASH_SALE_TITLE_MAX = 150;

export interface FlashSaleWindow {
  startAt: Date | string | number;
  endAt: Date | string | number;
  isActive?: boolean | null;
}

export function parseFlashSaleDate(value: Date | string | number, field: string): Date {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new FlashSaleError('INVALID_WINDOW', `${field} bukan tanggal yang valid`);
  }
  return date;
}

/** Validates a window and returns normalised Dates. End must be strictly after start. */
export function assertFlashSaleWindow(window: FlashSaleWindow): { startAt: Date; endAt: Date } {
  const startAt = parseFlashSaleDate(window.startAt, 'startAt');
  const endAt = parseFlashSaleDate(window.endAt, 'endAt');
  if (endAt.getTime() <= startAt.getTime()) {
    throw new FlashSaleError('INVALID_WINDOW', 'endAt harus setelah startAt');
  }
  return { startAt, endAt };
}

export function assertFlashSaleTitle(title: string): string {
  const clean = typeof title === 'string' ? title.trim() : '';
  if (clean.length < FLASH_SALE_TITLE_MIN || clean.length > FLASH_SALE_TITLE_MAX) {
    throw new FlashSaleError(
      'INVALID_TITLE',
      `judul flash sale harus ${FLASH_SALE_TITLE_MIN}-${FLASH_SALE_TITLE_MAX} karakter`
    );
  }
  return clean;
}

/**
 * Derives the lifecycle status. `isActive: false` wins over the clock: a manually disabled
 * sale reports `inactive` even while its window is open, so an admin can pull a sale early.
 */
export function flashSaleStatus(window: FlashSaleWindow, now: Date = new Date()): FlashSaleStatus {
  const { startAt, endAt } = assertFlashSaleWindow(window);
  if (window.isActive === false) return 'inactive';
  const current = now.getTime();
  if (current < startAt.getTime()) return 'upcoming';
  if (current > endAt.getTime()) return 'ended';
  return 'active';
}

export interface FlashSaleCountdown {
  status: FlashSaleStatus;
  serverTime: string;
  startsInMs: number | null;
  endsInMs: number | null;
  remainingMs: number;
}

/**
 * Countdown payload for the storefront timer (FLS-005). `serverTime` is returned so the
 * client can correct for clock drift instead of trusting the device clock.
 */
export function flashSaleCountdown(window: FlashSaleWindow, now: Date = new Date()): FlashSaleCountdown {
  const status = flashSaleStatus(window, now);
  const { startAt, endAt } = assertFlashSaleWindow(window);
  const current = now.getTime();

  const startsInMs = status === 'upcoming' ? Math.max(0, startAt.getTime() - current) : null;
  const endsInMs = status === 'upcoming' || status === 'active'
    ? Math.max(0, endAt.getTime() - current)
    : null;
  const remainingMs =
    status === 'upcoming'
      ? (startsInMs as number)
      : status === 'active'
        ? (endsInMs as number)
        : 0;

  return {
    status,
    serverTime: now.toISOString(),
    startsInMs,
    endsInMs,
    remainingMs,
  };
}

export interface FlashSaleDiscountRule {
  discountType: FlashSaleDiscountType | string;
  discountValue: number | string;
}

export function assertFlashSaleDiscount(rule: FlashSaleDiscountRule): {
  discountType: FlashSaleDiscountType;
  discountValue: number;
} {
  const type = rule.discountType;
  if (!FLASH_SALE_DISCOUNT_TYPES.includes(type as FlashSaleDiscountType)) {
    throw new FlashSaleError('INVALID_DISCOUNT', 'discountType harus percentage atau fixed');
  }
  const value = Number(rule.discountValue);
  if (!Number.isFinite(value) || value <= 0) {
    throw new FlashSaleError('INVALID_DISCOUNT', 'discountValue harus lebih besar dari 0');
  }
  if (type === 'percentage' && value > 100) {
    throw new FlashSaleError('INVALID_DISCOUNT', 'diskon persentase tidak boleh melebihi 100');
  }
  return { discountType: type as FlashSaleDiscountType, discountValue: value };
}

export interface FlashSalePrice {
  basePrice: number;
  finalPrice: number;
  discountAmount: number;
  discountPercent: number;
}

/** Applies the item discount to a base price and clamps it so the price never goes below zero. */
export function resolveFlashSalePrice(
  basePrice: number | string,
  rule: FlashSaleDiscountRule
): FlashSalePrice {
  const base = Math.max(0, roundCurrency(Number(basePrice)));
  if (!Number.isFinite(base)) {
    throw new FlashSaleError('INVALID_DISCOUNT', 'harga dasar tidak valid');
  }
  const { discountType, discountValue } = assertFlashSaleDiscount(rule);

  const raw = discountType === 'percentage' ? (base * discountValue) / 100 : discountValue;
  const discountAmount = Math.min(roundCurrency(raw), base);
  const finalPrice = roundCurrency(base - discountAmount);
  const discountPercent = base > 0 ? roundCurrency((discountAmount / base) * 100) : 0;

  return { basePrice: base, finalPrice, discountAmount, discountPercent };
}

export interface FlashSaleStockRule {
  stock: number | string;
  sold?: number | string | null;
}

export function assertFlashSaleStock(stock: number | string): number {
  const value = Number(stock);
  if (!Number.isInteger(value) || value < 0) {
    throw new FlashSaleError('INVALID_STOCK', 'stock harus bilangan bulat 0 atau lebih');
  }
  return value;
}

export function assertFlashSalePerUserLimit(limit: number | string | null | undefined): number | null {
  if (limit === null || limit === undefined || limit === '') return null;
  const value = Number(limit);
  if (!Number.isInteger(value) || value <= 0) {
    throw new FlashSaleError('INVALID_LIMIT', 'perUserLimit harus bilangan bulat positif atau null');
  }
  return value;
}

/** Remaining allocatable stock. Never negative even if `sold` overshoots `stock`. */
export function remainingFlashStock(item: FlashSaleStockRule): number {
  const stock = Math.trunc(Number(item.stock));
  if (!Number.isFinite(stock)) {
    throw new FlashSaleError('INVALID_STOCK', 'stock tidak valid');
  }
  const sold = Math.max(0, Math.trunc(Number(item.sold ?? 0)) || 0);
  return Math.max(0, stock - sold);
}

export interface FlashSaleItemInput {
  discountType: FlashSaleDiscountType | string;
  discountValue: number | string;
  stock: number | string;
  perUserLimit?: number | string | null;
}

export interface FlashSaleItemRule extends FlashSaleItemInput {
  sold?: number | string | null;
}

export function assertFlashSaleItemInput(input: FlashSaleItemInput): {
  discountType: FlashSaleDiscountType;
  discountValue: number;
  stock: number;
  perUserLimit: number | null;
} {
  const discount = assertFlashSaleDiscount(input);
  const stock = assertFlashSaleStock(input.stock);
  const perUserLimit = assertFlashSalePerUserLimit(input.perUserLimit);
  return { ...discount, stock, perUserLimit };
}

export function normalizeFlashSaleQuantity(quantity: number | string): number {
  const value = Number(quantity);
  if (!Number.isInteger(value) || value <= 0) {
    throw new FlashSaleError('INVALID_QUANTITY', 'quantity harus bilangan bulat positif');
  }
  return value;
}

export type FlashSaleRejection =
  | 'SALE_INACTIVE'
  | 'SALE_NOT_STARTED'
  | 'SALE_ENDED'
  | 'OUT_OF_STOCK'
  | 'PER_USER_LIMIT_REACHED';

export interface FlashSalePurchaseInput {
  sale: FlashSaleWindow;
  item: FlashSaleItemRule;
  quantity: number | string;
  /** Total quantity this user already bought from this item, including pending orders. */
  purchasedByUser?: number | string | null;
  now?: Date;
}

export interface FlashSalePurchaseDecision {
  allowed: boolean;
  reason?: FlashSaleRejection;
  quantity: number;
  remainingStock: number;
  purchasedByUser: number;
  userLimit: number | null;
  userRemaining: number | null;
}

/**
 * The single gate before a flash sale line is accepted (FLS-002 stock, FLS-006 per user).
 * Order of checks is deliberate: a malformed quantity is a bad request, while a closed sale
 * is a conflict. The route maps `reason` to an HTTP status.
 */
export function evaluateFlashSalePurchase(input: FlashSalePurchaseInput): FlashSalePurchaseDecision {
  const quantity = normalizeFlashSaleQuantity(input.quantity);
  const status = flashSaleStatus(input.sale, input.now ?? new Date());
  const remainingStock = remainingFlashStock(input.item);
  const userLimit = assertFlashSalePerUserLimit(input.item.perUserLimit);
  const purchasedByUser = Math.max(0, Math.trunc(Number(input.purchasedByUser ?? 0)) || 0);

  const base = {
    quantity,
    remainingStock,
    purchasedByUser,
    userLimit,
    userRemaining: userLimit === null ? null : Math.max(0, userLimit - purchasedByUser),
  };

  const reject = (reason: FlashSaleRejection): FlashSalePurchaseDecision => ({
    ...base,
    allowed: false,
    reason,
  });

  if (status === 'inactive') return reject('SALE_INACTIVE');
  if (status === 'upcoming') return reject('SALE_NOT_STARTED');
  if (status === 'ended') return reject('SALE_ENDED');
  if (quantity > remainingStock) return reject('OUT_OF_STOCK');
  if (userLimit !== null && purchasedByUser + quantity > userLimit) {
    return reject('PER_USER_LIMIT_REACHED');
  }

  return { ...base, allowed: true };
}

/** Placement rank for the landing page: running sales first, then upcoming, then the rest. */
const FLASH_SALE_STATUS_RANK: Record<FlashSaleStatus, number> = {
  active: 0,
  upcoming: 1,
  ended: 2,
  inactive: 3,
};

/**
 * Sort helper for the landing list (FLS-004). Rows with an invalid window are pushed to the
 * end instead of throwing, because one bad admin row must not blank the storefront page.
 */
export function sortFlashSalesForLanding<T extends FlashSaleWindow>(
  sales: T[],
  now: Date = new Date()
): T[] {
  const rank = (sale: T): number => {
    try {
      return FLASH_SALE_STATUS_RANK[flashSaleStatus(sale, now)];
    } catch {
      return 99;
    }
  };

  return [...sales].sort((left, right) => {
    const rankDiff = rank(left) - rank(right);
    if (rankDiff !== 0) return rankDiff;

    try {
      return (
        parseFlashSaleDate(left.startAt, 'startAt').getTime() -
        parseFlashSaleDate(right.startAt, 'startAt').getTime()
      );
    } catch {
      return 0;
    }
  });
}

/** Public storefront only shows running and upcoming sales, never disabled or finished ones. */
export function isPubliclyVisibleFlashSale(window: FlashSaleWindow, now: Date = new Date()): boolean {
  try {
    const status = flashSaleStatus(window, now);
    return status === 'active' || status === 'upcoming';
  } catch {
    return false;
  }
}
