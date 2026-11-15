/**
 * Store credit wallet rules (WLT-001, WLT-002, WLT-003).
 *
 * Pure functions only: no database, no clock, no environment. The repository composes them
 * with Postgres writes, and the tests exercise them directly.
 *
 * Money is handled in integer cents everywhere in this file. The database stores
 * decimal(12,2), but arithmetic on decimal strings invites rounding drift, so the rules
 * convert to cents, decide, then convert back. `formatMoney` is the only place that produces
 * the string shape the columns expect.
 *
 * Cashback percent defaults to zero on purpose. The rate is a business decision, not
 * something this module should invent. An admin sets it through the `wallet.program` setting.
 */

export type WalletTransactionType =
  | 'topup'
  | 'payment'
  | 'refund'
  | 'cashback'
  | 'adjustment'
  | 'expiry';

export type WalletDirection = 'credit' | 'debit';

export type WalletErrorCode =
  | 'INVALID_AMOUNT'
  | 'INVALID_TYPE'
  | 'INVALID_DIRECTION'
  | 'INVALID_PROGRAM'
  | 'INVALID_CASHBACK_PERCENT'
  | 'INVALID_CASHBACK_CAP'
  | 'INVALID_MINIMUM'
  | 'INSUFFICIENT_BALANCE'
  | 'MINIMUM_NOT_MET'
  | 'WALLET_NOT_FOUND'
  | 'ORDER_NOT_PAYABLE'
  | 'ORDER_NOT_FOUND'
  | 'DUPLICATE_TRANSACTION';

export class WalletError extends Error {
  readonly code: WalletErrorCode;
  readonly status: number;

  constructor(code: WalletErrorCode, message: string, status = 400) {
    super(message);
    this.name = 'WalletError';
    this.code = code;
    this.status = status;
  }
}

export interface WalletProgramConfig {
  /** Percent of the paid order total credited back to the wallet. 0 disables cashback. */
  cashbackPercent: number;
  /** Hard cap per cashback event, in rupiah. null means no cap. */
  cashbackMaxAmount: number | null;
  /** Smallest wallet payment allowed, in rupiah. 0 means no minimum. */
  minimumPayment: number;
  currency: string;
}

export const DEFAULT_WALLET_PROGRAM: WalletProgramConfig = {
  cashbackPercent: 0,
  cashbackMaxAmount: null,
  minimumPayment: 0,
  currency: 'IDR',
};

/** Types that cannot be chosen by hand. `adjustment` needs an explicit direction instead. */
const DIRECTION_BY_TYPE: Record<WalletTransactionType, WalletDirection> = {
  topup: 'credit',
  refund: 'credit',
  cashback: 'credit',
  payment: 'debit',
  expiry: 'debit',
  adjustment: 'credit',
};

const WALLET_TYPES: WalletTransactionType[] = [
  'topup',
  'payment',
  'refund',
  'cashback',
  'adjustment',
  'expiry',
];

/** Order statuses that may still be settled from the wallet. */
export const WALLET_PAYABLE_ORDER_STATUSES = ['pending', 'waiting_payment', 'unpaid'] as const;

export function assertWalletType(value: unknown): WalletTransactionType {
  if (typeof value !== 'string' || !WALLET_TYPES.includes(value as WalletTransactionType)) {
    throw new WalletError('INVALID_TYPE', 'Jenis transaksi wallet tidak dikenal');
  }
  return value as WalletTransactionType;
}

export function assertWalletDirection(value: unknown): WalletDirection {
  if (value !== 'credit' && value !== 'debit') {
    throw new WalletError('INVALID_DIRECTION', 'Arah transaksi wallet harus credit atau debit');
  }
  return value;
}

/**
 * Converts a rupiah value to integer cents.
 *
 * Accepts a number or a decimal string such as the values Drizzle returns for decimal
 * columns. Rejects more than two decimals instead of silently rounding, because a wallet
 * balance that quietly loses a fraction of a rupiah is worse than a hard error.
 */
export function toCents(value: number | string): number {
  let raw: string;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new WalletError('INVALID_AMOUNT', 'Nominal wallet tidak valid');
    }
    raw = value.toString();
  } else if (typeof value === 'string') {
    raw = value.trim();
  } else {
    throw new WalletError('INVALID_AMOUNT', 'Nominal wallet tidak valid');
  }

  if (raw === '') {
    throw new WalletError('INVALID_AMOUNT', 'Nominal wallet tidak boleh kosong');
  }

  const match = /^(-)?(\d+)(?:\.(\d{1,2}))?$/.exec(raw);
  if (!match) {
    throw new WalletError('INVALID_AMOUNT', 'Nominal wallet harus angka dengan maksimal dua desimal');
  }

  const negative = match[1] === '-';
  const whole = Number(match[2]);
  const fraction = match[3] ?? '';
  const cents = whole * 100 + Number(fraction.padEnd(2, '0'));

  if (!Number.isSafeInteger(cents)) {
    throw new WalletError('INVALID_AMOUNT', 'Nominal wallet terlalu besar');
  }
  return negative ? -cents : cents;
}

/** Renders integer cents back into the decimal string the columns store. */
export function formatMoney(cents: number): string {
  if (!Number.isInteger(cents)) {
    throw new WalletError('INVALID_AMOUNT', 'Nominal wallet harus bilangan bulat dalam sen');
  }
  const sign = cents < 0 ? '-' : '';
  const absolute = Math.abs(cents);
  const whole = Math.floor(absolute / 100);
  const fraction = absolute % 100;
  return `${sign}${whole}.${fraction.toString().padStart(2, '0')}`;
}

/** Positive amount guard. A zero-sized wallet transaction carries no information. */
export function assertWalletAmount(value: number | string): number {
  const cents = toCents(value);
  if (cents <= 0) {
    throw new WalletError('INVALID_AMOUNT', 'Nominal wallet harus lebih besar dari nol');
  }
  return cents;
}

/** Balance guard used before a debit. Returns cents, so callers never re-parse. */
export function assertWalletBalance(balance: number | string): number {
  const cents = toCents(balance);
  if (cents < 0) {
    throw new WalletError('INVALID_AMOUNT', 'Saldo wallet tidak boleh negatif');
  }
  return cents;
}

/**
 * Applies one transaction to a balance and returns the before and after values.
 *
 * The only rule that can fail here is the debit guard: a wallet never goes negative. Callers
 * that read a stale balance still get a correct answer because the repository also puts the
 * same condition in the SQL WHERE clause.
 */
export function applyWalletDelta(input: {
  balance: number | string;
  type: WalletTransactionType;
  amount: number | string;
  direction?: WalletDirection;
}): { before: number; after: number; direction: WalletDirection; amountCents: number } {
  const type = assertWalletType(input.type);
  const direction =
    input.direction === undefined ? DIRECTION_BY_TYPE[type] : assertWalletDirection(input.direction);
  const amountCents = assertWalletAmount(input.amount);
  const before = assertWalletBalance(input.balance);

  if (direction === 'debit' && before < amountCents) {
    throw new WalletError('INSUFFICIENT_BALANCE', 'Saldo wallet tidak cukup untuk transaksi ini', 409);
  }

  const after = direction === 'credit' ? before + amountCents : before - amountCents;
  return { before, after, direction, amountCents };
}

/**
 * Only `adjustment` accepts a hand-picked direction. Every other type carries its own
 * direction, so the route uses this to reject a caller trying to flip a cashback into a debit.
 */
export function isAdjustableType(type: WalletTransactionType): boolean {
  return assertWalletType(type) === 'adjustment';
}

/** Validates and normalises the stored program config. Missing fields fall back to defaults. */
export function resolveWalletProgram(input: unknown): WalletProgramConfig {
  if (input === undefined || input === null) return { ...DEFAULT_WALLET_PROGRAM };
  if (typeof input !== 'object') {
    throw new WalletError('INVALID_PROGRAM', 'Konfigurasi wallet harus berupa objek');
  }

  const raw = input as Record<string, unknown>;
  const percent = raw.cashbackPercent ?? DEFAULT_WALLET_PROGRAM.cashbackPercent;
  if (typeof percent !== 'number' || !Number.isFinite(percent) || percent < 0 || percent > 100) {
    throw new WalletError(
      'INVALID_CASHBACK_PERCENT',
      'Persentase cashback harus angka antara 0 dan 100'
    );
  }

  const cap = raw.cashbackMaxAmount ?? DEFAULT_WALLET_PROGRAM.cashbackMaxAmount;
  if (cap !== null && cap !== undefined) {
    if (typeof cap !== 'number' || !Number.isFinite(cap) || cap < 0) {
      throw new WalletError('INVALID_CASHBACK_CAP', 'Batas cashback harus angka nol atau lebih');
    }
  }

  const minimum = raw.minimumPayment ?? DEFAULT_WALLET_PROGRAM.minimumPayment;
  if (typeof minimum !== 'number' || !Number.isFinite(minimum) || minimum < 0) {
    throw new WalletError('INVALID_MINIMUM', 'Minimum pembayaran wallet harus angka nol atau lebih');
  }

  const currency = raw.currency ?? DEFAULT_WALLET_PROGRAM.currency;
  if (typeof currency !== 'string' || currency.trim() === '') {
    throw new WalletError('INVALID_PROGRAM', 'Mata uang wallet tidak boleh kosong');
  }

  return {
    cashbackPercent: percent,
    cashbackMaxAmount: cap === null || cap === undefined ? null : Number(cap),
    minimumPayment: Number(minimum),
    currency: currency.trim().toUpperCase(),
  };
}

/**
 * Cashback for one paid order (WLT-003).
 *
 * Rounds down to whole rupiah so the brand never credits a fraction it did not collect, then
 * applies the cap after rounding. A zero percent program returns 0, which callers treat as
 * "nothing to credit" rather than an error.
 */
export function computeCashback(input: {
  orderTotal: number | string;
  program?: Partial<WalletProgramConfig> | null;
}): number {
  const program = resolveWalletProgram(input.program ?? null);
  const orderCents = toCents(input.orderTotal);
  if (orderCents <= 0) {
    throw new WalletError('INVALID_AMOUNT', 'Total order harus lebih besar dari nol');
  }
  if (program.cashbackPercent <= 0) return 0;

  const rawCents = Math.floor((orderCents * program.cashbackPercent) / 100);
  const cappedCents =
    program.cashbackMaxAmount === null
      ? rawCents
      : Math.min(rawCents, toCents(program.cashbackMaxAmount));

  // Whole rupiah units, expressed back in cents.
  return Math.floor(cappedCents / 100) * 100;
}

/**
 * Previews a wallet payment against an order total.
 *
 * `shortfall` is reported instead of throwing so the storefront can show "kurang Rp X" next to
 * a disabled button. Only a negative total or a broken balance is an error here.
 */
export function evaluateWalletPayment(input: {
  orderTotal: number | string;
  balance: number | string;
  program?: Partial<WalletProgramConfig> | null;
}): { amountCents: number; balanceCents: number; payable: boolean; shortfallCents: number } {
  const program = resolveWalletProgram(input.program ?? null);
  const orderCents = toCents(input.orderTotal);
  if (orderCents <= 0) {
    throw new WalletError('INVALID_AMOUNT', 'Total order harus lebih besar dari nol');
  }
  const balanceCents = assertWalletBalance(input.balance);

  if (orderCents < toCents(program.minimumPayment)) {
    return { amountCents: orderCents, balanceCents, payable: false, shortfallCents: 0 };
  }

  const shortfallCents = Math.max(orderCents - balanceCents, 0);
  return {
    amountCents: orderCents,
    balanceCents,
    payable: shortfallCents === 0,
    shortfallCents,
  };
}

/** Throws the 409 every caller wants when a payment is short. */
export function assertWalletPaymentPossible(input: {
  orderTotal: number | string;
  balance: number | string;
  program?: Partial<WalletProgramConfig> | null;
}): number {
  const preview = evaluateWalletPayment(input);
  if (preview.amountCents < toCents(resolveWalletProgram(input.program ?? null).minimumPayment)) {
    throw new WalletError('MINIMUM_NOT_MET', 'Total order di bawah minimum pembayaran wallet');
  }
  if (!preview.payable) {
    throw new WalletError('INSUFFICIENT_BALANCE', 'Saldo wallet tidak cukup untuk melunasi order ini', 409);
  }
  return preview.amountCents;
}
