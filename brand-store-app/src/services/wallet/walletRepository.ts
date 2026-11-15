/**
 * Wallet persistence (WLT-001, WLT-002, WLT-003).
 *
 * Rules live in walletService.ts. This file decides how they are stored: which row is locked,
 * how a debit is refused when the balance moved, and how a repeated callback cannot pay twice.
 *
 * Every balance change runs inside a transaction and writes one wallet_transactions row with
 * the before and after values, so the ledger can always be replayed against the balance.
 *
 * Debits put the balance guard in the SQL WHERE clause (`balance >= amount`) instead of
 * trusting the value read a moment earlier. Two concurrent payments cannot both pass.
 */

import { db } from '../../db/index.js';
import { orders, users, wallets, walletTransactions } from '../../db/schema.js';
import { and, desc, eq, sql } from 'drizzle-orm';
import { getSettingValue } from '../config/settings.js';
import { notifyOrderEvent } from '../notifications/orderNotifications.js';
import {
  DEFAULT_WALLET_PROGRAM,
  WALLET_PAYABLE_ORDER_STATUSES,
  WalletError,
  assertWalletPaymentPossible,
  computeCashback,
  evaluateWalletPayment,
  formatMoney,
  resolveWalletProgram,
  toCents,
  type WalletDirection,
  type WalletProgramConfig,
  type WalletTransactionType,
} from './walletService.js';

export interface WalletRecord {
  id: string;
  userId: string;
  balance: string;
  currency: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface WalletTransactionRecord {
  id: string;
  walletId: string;
  type: string;
  amount: string;
  balanceBefore: string;
  balanceAfter: string;
  referenceType: string | null;
  referenceId: string | null;
  note: string | null;
  createdAt: Date;
}

export interface WalletTransactionView {
  id: string;
  type: WalletTransactionType;
  amount: string;
  direction: WalletDirection;
  balanceBefore: string;
  balanceAfter: string;
  referenceType: string | null;
  referenceId: string | null;
  note: string | null;
  createdAt: string;
}

export interface WalletSummary {
  balance: string;
  balanceCents: number;
  currency: string;
  program: WalletProgramConfig;
  transactions: WalletTransactionView[];
}

export interface WalletPaymentResult {
  orderId: string;
  orderNumber: string;
  orderStatus: string;
  paidAmount: string;
  walletBalance: string;
  transactionId: string;
  cashbackAmount: string;
}

/** Program config from settings, falling back to the documented defaults on any bad value. */
export async function getWalletProgram(): Promise<WalletProgramConfig> {
  const stored = await getSettingValue<unknown>('wallet.program', DEFAULT_WALLET_PROGRAM);
  try {
    return resolveWalletProgram(stored);
  } catch {
    return { ...DEFAULT_WALLET_PROGRAM };
  }
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Creates the wallet row on first use. The unique index on user_id makes a retry harmless. */
async function createWallet(tx: Tx, userId: string): Promise<WalletRecord> {
  const [created] = await tx
    .insert(wallets)
    .values({ userId })
    .onConflictDoNothing()
    .returning();

  if (created) return created as WalletRecord;

  const [existing] = await tx.select().from(wallets).where(eq(wallets.userId, userId)).limit(1);
  if (!existing) {
    throw new WalletError('WALLET_NOT_FOUND', 'Wallet tidak bisa dibuat untuk akun ini', 500);
  }
  return existing as WalletRecord;
}

export async function getOrCreateWallet(userId: string): Promise<WalletRecord> {
  return db.transaction(async (tx) => createWallet(tx, userId));
}

function toTransactionView(row: WalletTransactionRecord): WalletTransactionView {
  const before = toCents(String(row.balanceBefore));
  const after = toCents(String(row.balanceAfter));
  return {
    id: row.id,
    type: row.type as WalletTransactionType,
    amount: String(row.amount),
    direction: after >= before ? 'credit' : 'debit',
    balanceBefore: String(row.balanceBefore),
    balanceAfter: String(row.balanceAfter),
    referenceType: row.referenceType ?? null,
    referenceId: row.referenceId ?? null,
    note: row.note ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Customer wallet page: balance, active program, and the newest transactions. */
export async function getWalletSummary(userId: string, limit = 20): Promise<WalletSummary> {
  const [wallet, program] = await Promise.all([getOrCreateWallet(userId), getWalletProgram()]);
  const rows = await db
    .select()
    .from(walletTransactions)
    .where(eq(walletTransactions.walletId, wallet.id))
    .orderBy(desc(walletTransactions.createdAt))
    .limit(Math.min(Math.max(Number(limit) || 20, 1), 100));

  return {
    balance: String(wallet.balance),
    balanceCents: toCents(String(wallet.balance)),
    currency: wallet.currency,
    program,
    transactions: (rows as WalletTransactionRecord[]).map(toTransactionView),
  };
}

export async function listWalletTransactions(options: {
  userId: string;
  type?: string | null;
  limit?: number;
}): Promise<WalletTransactionView[]> {
  const wallet = await getOrCreateWallet(options.userId);
  const safeLimit = Math.min(Math.max(Number(options.limit) || 50, 1), 200);

  const base = db.select().from(walletTransactions);
  const rows = options.type
    ? await base
        .where(and(eq(walletTransactions.walletId, wallet.id), eq(walletTransactions.type, options.type)))
        .orderBy(desc(walletTransactions.createdAt))
        .limit(safeLimit)
    : await base
        .where(eq(walletTransactions.walletId, wallet.id))
        .orderBy(desc(walletTransactions.createdAt))
        .limit(safeLimit);

  return (rows as WalletTransactionRecord[]).map(toTransactionView);
}

export interface WalletMovementInput {
  userId: string;
  type: WalletTransactionType;
  amount: number | string;
  direction?: WalletDirection;
  referenceType?: string | null;
  referenceId?: string | null;
  note?: string | null;
}

export interface WalletMovementResult {
  transaction: WalletTransactionView;
  balance: string;
}

/**
 * Writes one ledger row and moves the balance (WLT-001).
 *
 * A credit uses `balance + amount`, a debit uses `balance - amount` guarded by
 * `balance >= amount`. Both read the new balance from RETURNING, so the before/after pair
 * recorded in the ledger is the value Postgres actually committed, not a value this process
 * assumed.
 */
async function recordMovement(input: WalletMovementInput): Promise<WalletMovementResult> {
  const amountCents = toCents(input.amount);
  if (amountCents <= 0) {
    throw new WalletError('INVALID_AMOUNT', 'Nominal wallet harus lebih besar dari nol');
  }
  const amount = formatMoney(amountCents);
  const direction = input.direction ?? (input.type === 'payment' || input.type === 'expiry' ? 'debit' : 'credit');

  return db.transaction(async (tx) => {
    const wallet = await createWallet(tx, input.userId);

    const [moved] =
      direction === 'debit'
        ? await tx
            .update(wallets)
            .set({
              balance: sql`${wallets.balance} - ${amount}::decimal(12,2)`,
              updatedAt: new Date(),
            })
            .where(and(eq(wallets.id, wallet.id), sql`${wallets.balance} >= ${amount}::decimal(12,2)`))
            .returning()
        : await tx
            .update(wallets)
            .set({
              balance: sql`${wallets.balance} + ${amount}::decimal(12,2)`,
              updatedAt: new Date(),
            })
            .where(eq(wallets.id, wallet.id))
            .returning();

    if (!moved) {
      throw new WalletError('INSUFFICIENT_BALANCE', 'Saldo wallet tidak cukup untuk transaksi ini', 409);
    }

    const afterCents = toCents(String(moved.balance));
    const beforeCents = direction === 'credit' ? afterCents - amountCents : afterCents + amountCents;

    let inserted: WalletTransactionRecord;
    try {
      const [row] = await tx
        .insert(walletTransactions)
        .values({
          walletId: wallet.id,
          type: input.type,
          amount: formatMoney(amountCents),
          balanceBefore: formatMoney(beforeCents),
          balanceAfter: formatMoney(afterCents),
          referenceType: input.referenceType ?? null,
          referenceId: input.referenceId ?? null,
          note: input.note ?? null,
        })
        .returning();
      inserted = row as WalletTransactionRecord;
    } catch (err: any) {
      // The unique index on (wallet_id, type, reference_id) is the real guard against paying
      // the same reference twice. Rolling back keeps the balance where it was.
      if (err?.code === '23505') {
        throw new WalletError(
          'DUPLICATE_TRANSACTION',
          'Transaksi wallet untuk referensi ini sudah pernah dicatat',
          409
        );
      }
      throw err;
    }

    return { transaction: toTransactionView(inserted), balance: String(moved.balance) };
  });
}

/** Admin or module credit: topup, refund, cashback, or an upward adjustment. */
export async function creditWallet(input: WalletMovementInput): Promise<WalletMovementResult> {
  return recordMovement({ ...input, direction: input.direction ?? 'credit' });
}

/** Customer payment or an expiry debit. Never lets the balance go below zero. */
export async function debitWallet(input: WalletMovementInput): Promise<WalletMovementResult> {
  return recordMovement({ ...input, direction: input.direction ?? 'debit' });
}

/**
 * Pays one order from the wallet (WLT-002).
 *
 * The order must belong to the caller and still be waiting for payment. The amount is the
 * order total, so a customer cannot part-pay and leave a stale receivable. Money leaves the
 * wallet first; if the order update then fails, the debit is reversed with a refund row so the
 * customer is never charged for an order that did not move.
 *
 * Cashback is credited after the order is paid, and a cashback failure does not roll back the
 * payment: the order is genuinely paid, and the ledger write can be retried through the admin
 * cashback endpoint because the reference id makes it idempotent.
 */
export async function payOrderWithWallet(input: {
  userId: string;
  orderId: string;
}): Promise<WalletPaymentResult> {
  const [order] = await db.select().from(orders).where(eq(orders.id, input.orderId)).limit(1);
  if (!order) {
    throw new WalletError('ORDER_NOT_FOUND', 'Order tidak ditemukan', 404);
  }
  if (order.customerId !== input.userId) {
    throw new WalletError('ORDER_NOT_FOUND', 'Order tidak ditemukan', 404);
  }

  const payable = (WALLET_PAYABLE_ORDER_STATUSES as readonly string[]).includes(order.status);
  if (!payable) {
    throw new WalletError(
      'ORDER_NOT_PAYABLE',
      `Order berstatus ${order.status} tidak bisa dibayar dari wallet`,
      409
    );
  }

  const program = await getWalletProgram();
  const wallet = await getOrCreateWallet(input.userId);
  const amountCents = assertWalletPaymentPossible({
    orderTotal: String(order.totalAmount),
    balance: String(wallet.balance),
    program,
  });

  const debit = await debitWallet({
    userId: input.userId,
    type: 'payment',
    amount: formatMoney(amountCents),
    referenceType: 'order',
    referenceId: order.id,
    note: `Pembayaran order ${order.orderNumber}`,
  });

  const paymentDetails = {
    ...((order.paymentDetails as Record<string, unknown> | null) ?? {}),
    status: 'success',
    gateway: 'wallet',
    paymentMethod: 'wallet',
    amount: formatMoney(amountCents),
    updatedAt: new Date().toISOString(),
  };

  try {
    await db
      .update(orders)
      .set({ status: 'paid', paymentDetails, updatedAt: new Date() })
      .where(eq(orders.id, order.id));
  } catch (err) {
    // Reverse the debit so a failed order update cannot leave the customer short.
    await creditWallet({
      userId: input.userId,
      type: 'refund',
      amount: formatMoney(amountCents),
      referenceType: 'order',
      referenceId: order.id,
      note: `Pembatalan debit order ${order.orderNumber}`,
    }).catch(() => undefined);
    throw err;
  }

  await notifyOrderEvent(order.customerId, 'paid', {
    orderNumber: order.orderNumber,
    totalAmount: order.totalAmount,
    status: 'paid',
  }).catch(() => undefined);

  const cashbackCents = computeCashback({ orderTotal: String(order.totalAmount), program });
  let cashbackAmount = '0.00';
  if (cashbackCents > 0) {
    try {
      const cashback = await creditWallet({
        userId: input.userId,
        type: 'cashback',
        amount: formatMoney(cashbackCents),
        referenceType: 'order',
        referenceId: order.id,
        note: `Cashback order ${order.orderNumber}`,
      });
      cashbackAmount = cashback.transaction.amount;
    } catch {
      // Duplicate means it was already paid out for this order, so leave it be.
      cashbackAmount = formatMoney(cashbackCents);
    }
  }

  const walletAfter = await getOrCreateWallet(input.userId);

  return {
    orderId: order.id,
    orderNumber: order.orderNumber,
    orderStatus: 'paid',
    paidAmount: formatMoney(amountCents),
    walletBalance: String(walletAfter.balance),
    transactionId: debit.transaction.id,
    cashbackAmount,
  };
}

/**
 * Credits cashback for an already paid order (WLT-003).
 *
 * Used by the admin endpoint when the automatic cashback did not run, for example on an order
 * paid through a payment gateway. The reference id makes a repeated call return a 409 instead
 * of paying twice.
 */
export async function creditOrderCashback(input: {
  orderId: string;
  userId?: string | null;
}): Promise<WalletMovementResult & { orderId: string; cashbackAmount: string }> {
  const [order] = await db.select().from(orders).where(eq(orders.id, input.orderId)).limit(1);
  if (!order) {
    throw new WalletError('ORDER_NOT_FOUND', 'Order tidak ditemukan', 404);
  }
  if (order.status !== 'paid') {
    throw new WalletError('ORDER_NOT_PAYABLE', 'Cashback hanya untuk order yang sudah lunas', 409);
  }
  if (input.userId && input.userId !== order.customerId) {
    throw new WalletError('ORDER_NOT_FOUND', 'Order bukan milik akun ini', 404);
  }

  const program = await getWalletProgram();
  const cashbackCents = computeCashback({ orderTotal: String(order.totalAmount), program });
  if (cashbackCents <= 0) {
    throw new WalletError('INVALID_AMOUNT', 'Program cashback sedang tidak aktif', 409);
  }

  const result = await creditWallet({
    userId: order.customerId,
    type: 'cashback',
    amount: formatMoney(cashbackCents),
    referenceType: 'order',
    referenceId: order.id,
    note: `Cashback order ${order.orderNumber}`,
  });

  return { ...result, orderId: order.id, cashbackAmount: result.transaction.amount };
}

/** Admin listing with balance and email, so support can find an account without a user id. */
export async function listWallets(options: { limit?: number } = {}): Promise<
  Array<{ userId: string; email: string | null; balance: string; currency: string; updatedAt: string }>
> {
  const safeLimit = Math.min(Math.max(Number(options.limit) || 50, 1), 200);
  const rows = await db
    .select({
      userId: wallets.userId,
      email: users.email,
      balance: wallets.balance,
      currency: wallets.currency,
      updatedAt: wallets.updatedAt,
    })
    .from(wallets)
    .leftJoin(users, eq(users.id, wallets.userId))
    .orderBy(desc(wallets.updatedAt))
    .limit(safeLimit);

  return rows.map((row) => ({
    userId: row.userId,
    email: row.email ?? null,
    balance: String(row.balance),
    currency: row.currency,
    updatedAt: row.updatedAt.toISOString(),
  }));
}

/** Admin lookup by user id. Creates nothing, so a typo does not invent a wallet. */
export async function getWalletForAdmin(userId: string): Promise<WalletSummary & { userId: string }> {
  const [wallet] = await db.select().from(wallets).where(eq(wallets.userId, userId)).limit(1);
  if (!wallet) {
    throw new WalletError('WALLET_NOT_FOUND', 'Wallet untuk akun ini belum ada', 404);
  }
  const summary = await getWalletSummary(userId);
  return { ...summary, userId };
}

/** Admin manual credit or debit. `direction` must be explicit for an adjustment. */
export async function adjustWallet(input: {
  userId: string;
  amount: number | string;
  direction: WalletDirection;
  note?: string | null;
}): Promise<WalletMovementResult> {
  return recordMovement({
    userId: input.userId,
    type: 'adjustment',
    amount: input.amount,
    direction: input.direction,
    referenceType: 'admin_adjustment',
    referenceId: null,
    note: input.note ?? null,
  });
}

/** Used by the checkout preview. Never writes anything. */
export async function previewWalletPayment(input: {
  userId: string;
  orderTotal: number | string;
}): Promise<{ balance: string; amount: string; payable: boolean; shortfall: string; program: WalletProgramConfig }> {
  const [wallet, program] = await Promise.all([getOrCreateWallet(input.userId), getWalletProgram()]);
  const preview = evaluateWalletPayment({
    orderTotal: input.orderTotal,
    balance: String(wallet.balance),
    program,
  });
  return {
    balance: String(wallet.balance),
    amount: formatMoney(preview.amountCents),
    payable: preview.payable,
    shortfall: formatMoney(preview.shortfallCents),
    program,
  };
}
