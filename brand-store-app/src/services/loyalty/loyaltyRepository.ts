/**
 * Loyalty persistence (LTY-001, LTY-002, LTY-003, LTY-004).
 *
 * Rules live in loyaltyService.ts. This file only decides how they are stored: which row is
 * locked, how a duplicate earn is rejected, and how the cached tier column is refreshed.
 */

import { db } from '../../db/index.js';
import { loyaltyAccounts, loyaltyTransactions, users } from '../../db/schema.js';
import { and, desc, eq, sql } from 'drizzle-orm';
import { getSettingValue } from '../config/settings.js';
import {
  DEFAULT_LOYALTY_PROGRAM,
  LoyaltyError,
  applyPointDelta,
  assertEarnSource,
  assertLoyaltyProgramConfig,
  computeEarnedPoints,
  evaluateRedemption,
  nextTierProgress,
  resolveTier,
  tierBenefits,
  type LoyaltyEarnSource,
  type LoyaltyProgramConfig,
  type LoyaltyTier,
  type LoyaltyTransactionType,
} from './loyaltyService.js';

export interface LoyaltyAccountRecord {
  id: string;
  userId: string;
  balance: number;
  lifetimePoints: number;
  tier: string;
  tierUpdatedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface LoyaltyAccountView {
  userId: string;
  balance: number;
  lifetimePoints: number;
  tier: LoyaltyTier;
  benefits: {
    tier: LoyaltyTier;
    discountPercent: number;
    freeShippingMinAmount: number | null;
    freeShippingAlways: boolean;
  };
  progress: {
    currentTier: LoyaltyTier;
    nextTier: LoyaltyTier | null;
    pointsToNext: number | null;
    progressPercent: number;
  };
  updatedAt: string;
}

export interface LoyaltyTransactionView {
  id: string;
  type: LoyaltyTransactionType;
  source: string | null;
  points: number;
  balanceBefore: number;
  balanceAfter: number;
  referenceType: string | null;
  referenceId: string | null;
  note: string | null;
  createdAt: string;
}

/** Program config comes from settings, with the documented defaults as fallback. */
export async function getLoyaltyProgram(): Promise<LoyaltyProgramConfig> {
  const stored = await getSettingValue<unknown>('loyalty.program', DEFAULT_LOYALTY_PROGRAM);
  try {
    return assertLoyaltyProgramConfig(stored);
  } catch {
    return DEFAULT_LOYALTY_PROGRAM;
  }
}

function toAccountView(
  account: LoyaltyAccountRecord,
  config: LoyaltyProgramConfig
): LoyaltyAccountView {
  const tier = resolveTier(account.lifetimePoints, config);
  return {
    userId: account.userId,
    balance: account.balance,
    lifetimePoints: account.lifetimePoints,
    tier,
    benefits: tierBenefits(tier, config),
    progress: nextTierProgress(account.lifetimePoints, config),
    updatedAt: account.updatedAt.toISOString(),
  };
}

async function findAccount(userId: string): Promise<LoyaltyAccountRecord | null> {
  const [row] = await db
    .select()
    .from(loyaltyAccounts)
    .where(eq(loyaltyAccounts.userId, userId))
    .limit(1);
  return (row as LoyaltyAccountRecord | undefined) ?? null;
}

async function createAccount(executor: any, userId: string): Promise<LoyaltyAccountRecord> {
  const [created] = await executor
    .insert(loyaltyAccounts)
    .values({ userId, balance: 0, lifetimePoints: 0, tier: 'bronze' })
    .onConflictDoNothing({ target: loyaltyAccounts.userId })
    .returning();

  if (created) return created as LoyaltyAccountRecord;

  const [existing] = await executor
    .select()
    .from(loyaltyAccounts)
    .where(eq(loyaltyAccounts.userId, userId))
    .limit(1);

  if (!existing) {
    throw new LoyaltyError('ACCOUNT_NOT_FOUND', 'Akun loyalty gagal dibuat', 500);
  }
  return existing as LoyaltyAccountRecord;
}

/** Account summary for the signed-in customer. Creates an empty account on first read. */
export async function getLoyaltySummary(userId: string): Promise<LoyaltyAccountView> {
  const config = await getLoyaltyProgram();
  const existing = await findAccount(userId);
  const account = existing ?? (await createAccount(db, userId));
  return toAccountView(account, config);
}

export async function getLoyaltyTransactions(
  userId: string,
  limit = 50
): Promise<LoyaltyTransactionView[]> {
  const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 200);
  const rows = await db
    .select()
    .from(loyaltyTransactions)
    .where(eq(loyaltyTransactions.userId, userId))
    .orderBy(desc(loyaltyTransactions.createdAt))
    .limit(safeLimit);

  return rows.map((row) => ({
    id: row.id,
    type: row.type as LoyaltyTransactionType,
    source: row.source ?? null,
    points: row.points,
    balanceBefore: row.balanceBefore,
    balanceAfter: row.balanceAfter,
    referenceType: row.referenceType ?? null,
    referenceId: row.referenceId ?? null,
    note: row.note ?? null,
    createdAt: row.createdAt.toISOString(),
  }));
}

export interface EarnPointsInput {
  userId: string;
  source: LoyaltyEarnSource;
  /** Order id, review id, or referral id. Required so a retry cannot double-credit. */
  referenceId?: string | null;
  orderTotal?: number | string | null;
  note?: string | null;
}

export interface EarnPointsResult {
  account: LoyaltyAccountView;
  transaction: LoyaltyTransactionView;
  earnedPoints: number;
}

/**
 * Credits points for one earning event (LTY-001).
 *
 * A purchase is deduplicated by `referenceId`, so replaying the same order webhook credits
 * once and then returns DUPLICATE_EARN. The unique index is the real guard; the read below
 * exists so the caller gets a clean 409 instead of a driver error.
 */
export async function earnPoints(input: EarnPointsInput): Promise<EarnPointsResult> {
  const source = assertEarnSource(input.source);
  const config = await getLoyaltyProgram();
  const points = computeEarnedPoints({ source, orderTotal: input.orderTotal }, config);

  if (points <= 0) {
    throw new LoyaltyError('INVALID_POINTS', 'Tidak ada poin yang bisa diperoleh dari transaksi ini');
  }

  return db.transaction(async (tx) => {
    const account = await createAccount(tx, input.userId);

    if (input.referenceId) {
      const [duplicate] = await tx
        .select({ id: loyaltyTransactions.id })
        .from(loyaltyTransactions)
        .where(
          and(
            eq(loyaltyTransactions.userId, input.userId),
            eq(loyaltyTransactions.source, source),
            eq(loyaltyTransactions.referenceId, input.referenceId)
          )
        )
        .limit(1);

      if (duplicate) {
        throw new LoyaltyError('DUPLICATE_EARN', 'Poin untuk referensi ini sudah pernah dicatat', 409);
      }
    }

    const balanceBefore = account.balance;
    const balanceAfter = balanceBefore + points;
    const lifetimePoints = account.lifetimePoints + points;
    const tier = resolveTier(lifetimePoints, config);

    const [updated] = await tx
      .update(loyaltyAccounts)
      .set({
        balance: balanceAfter,
        lifetimePoints,
        tier,
        tierUpdatedAt: tier === account.tier ? account.tierUpdatedAt : new Date(),
        updatedAt: new Date(),
      })
      .where(eq(loyaltyAccounts.id, account.id))
      .returning();

    const [transaction] = await tx
      .insert(loyaltyTransactions)
      .values({
        accountId: account.id,
        userId: input.userId,
        type: 'earn',
        source,
        points,
        balanceBefore,
        balanceAfter,
        referenceType: source === 'purchase' ? 'order' : source,
        referenceId: input.referenceId ?? null,
        note: input.note ?? null,
      })
      .returning();

    return {
      account: toAccountView(updated as LoyaltyAccountRecord, config),
      transaction: {
        id: transaction.id,
        type: 'earn',
        source,
        points,
        balanceBefore,
        balanceAfter,
        referenceType: transaction.referenceType ?? null,
        referenceId: transaction.referenceId ?? null,
        note: transaction.note ?? null,
        createdAt: transaction.createdAt.toISOString(),
      },
      earnedPoints: points,
    };
  });
}

export interface RedeemPointsInput {
  userId: string;
  points: number | string;
  orderId?: string | null;
  note?: string | null;
}

export interface RedeemPointsResult {
  points: number;
  discountAmount: number;
  balanceAfter: number;
  account: LoyaltyAccountView;
}

/**
 * Burns points and returns the rupiah discount the caller should apply (LTY-002).
 *
 * Redemption is immediate and irreversible from the customer side. If the order later fails,
 * an admin adjustment is the documented restore path, because there is no order-cancel hook
 * inside this module yet.
 */
export async function redeemPoints(input: RedeemPointsInput): Promise<RedeemPointsResult> {
  const config = await getLoyaltyProgram();

  return db.transaction(async (tx) => {
    const account = await createAccount(tx, input.userId);
    const decision = evaluateRedemption(
      { points: input.points, balance: account.balance },
      config
    );

    const [updated] = await tx
      .update(loyaltyAccounts)
      .set({ balance: decision.balanceAfter, updatedAt: new Date() })
      .where(
        and(
          eq(loyaltyAccounts.id, account.id),
          sql`${loyaltyAccounts.balance} >= ${decision.points}`
        )
      )
      .returning();

    if (!updated) {
      throw new LoyaltyError('INSUFFICIENT_POINTS', 'Saldo poin tidak cukup', 409);
    }

    await tx.insert(loyaltyTransactions).values({
      accountId: account.id,
      userId: input.userId,
      type: 'redeem',
      source: null,
      points: -decision.points,
      balanceBefore: account.balance,
      balanceAfter: decision.balanceAfter,
      referenceType: input.orderId ? 'order' : null,
      referenceId: input.orderId ?? null,
      note: input.note ?? null,
    });

    return {
      points: decision.points,
      discountAmount: decision.discountAmount,
      balanceAfter: decision.balanceAfter,
      account: toAccountView(updated as LoyaltyAccountRecord, config),
    };
  });
}

export interface AdjustPointsInput {
  userId: string;
  points: number;
  note: string;
  actorId: string;
}

/** Admin correction. Positive restores a failed redemption, negative claws back a mistake. */
export async function adjustPoints(input: AdjustPointsInput): Promise<EarnPointsResult> {
  if (typeof input.points !== 'number' || !Number.isInteger(input.points) || input.points === 0) {
    throw new LoyaltyError('INVALID_POINTS', 'Delta poin harus bilangan bulat dan tidak nol');
  }
  if (!input.note || input.note.trim().length < 3) {
    throw new LoyaltyError('INVALID_POINTS', 'Catatan penyesuaian wajib diisi minimal 3 karakter');
  }

  const config = await getLoyaltyProgram();

  return db.transaction(async (tx) => {
    const account = await createAccount(tx, input.userId);
    const balanceAfter = applyPointDelta(account.balance, input.points);
    // Lifetime points only grow. A negative adjustment is a correction of spendable balance,
    // not a demotion, because tier is earned and never taken back in this implementation.
    const lifetimePoints = Math.max(
      account.lifetimePoints,
      account.lifetimePoints + Math.max(0, input.points)
    );
    const tier = resolveTier(lifetimePoints, config);

    const [updated] = await tx
      .update(loyaltyAccounts)
      .set({ balance: balanceAfter, lifetimePoints, tier, updatedAt: new Date() })
      .where(eq(loyaltyAccounts.id, account.id))
      .returning();

    const [transaction] = await tx
      .insert(loyaltyTransactions)
      .values({
        accountId: account.id,
        userId: input.userId,
        type: 'adjust',
        source: null,
        points: input.points,
        balanceBefore: account.balance,
        balanceAfter,
        note: input.note.trim(),
        actorId: input.actorId,
      })
      .returning();

    return {
      account: toAccountView(updated as LoyaltyAccountRecord, config),
      transaction: {
        id: transaction.id,
        type: 'adjust',
        source: null,
        points: input.points,
        balanceBefore: account.balance,
        balanceAfter,
        referenceType: null,
        referenceId: null,
        note: transaction.note ?? null,
        createdAt: transaction.createdAt.toISOString(),
      },
      earnedPoints: input.points,
    };
  });
}

export interface LoyaltyAccountListItem extends LoyaltyAccountView {
  email: string | null;
  fullName: string | null;
}

/** Admin listing, optionally filtered by tier. Ordered by lifetime points descending. */
export async function listLoyaltyAccounts(options: {
  tier?: string | null;
  limit?: number;
} = {}): Promise<LoyaltyAccountListItem[]> {
  const config = await getLoyaltyProgram();
  const safeLimit = Math.min(Math.max(Number(options.limit) || 50, 1), 200);

  const base = db
    .select({
      account: loyaltyAccounts,
      email: users.email,
      fullName: users.fullName,
    })
    .from(loyaltyAccounts)
    .leftJoin(users, eq(loyaltyAccounts.userId, users.id));

  const rows = options.tier
    ? await base
        .where(eq(loyaltyAccounts.tier, options.tier))
        .orderBy(desc(loyaltyAccounts.lifetimePoints))
        .limit(safeLimit)
    : await base.orderBy(desc(loyaltyAccounts.lifetimePoints)).limit(safeLimit);

  return rows.map((row) => ({
    ...toAccountView(row.account as LoyaltyAccountRecord, config),
    email: row.email ?? null,
    fullName: row.fullName ?? null,
  }));
}

/** Admin lookup by user id. Returns 404 instead of auto-creating, unlike the customer read. */
export async function getLoyaltyAccountForAdmin(
  userId: string
): Promise<LoyaltyAccountView & { transactions: LoyaltyTransactionView[] }> {
  const config = await getLoyaltyProgram();
  const account = await findAccount(userId);
  if (!account) {
    throw new LoyaltyError('ACCOUNT_NOT_FOUND', 'Akun loyalty tidak ditemukan', 404);
  }
  return {
    ...toAccountView(account, config),
    transactions: await getLoyaltyTransactions(userId, 20),
  };
}
