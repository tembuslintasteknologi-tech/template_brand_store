/**
 * Referral persistence (RFR-001..RFR-005).
 *
 * Rules live in referralService.ts. This file decides how they are stored: which code belongs
 * to whom, how a claim is rejected, and how the loyalty ledger gets the reward rows.
 *
 * Reward flow on purpose:
 *
 * 1. A claim writes a pending referral with a snapshot of the reward amounts.
 * 2. Qualification moves it to qualified. That step needs a real paid order.
 * 3. Rewarding credits both sides through earnPoints, then marks the referral rewarded.
 *
 * The loyalty unique index on (user_id, source, reference_id) makes the reward step
 * idempotent, so a retried admin call cannot pay twice.
 */

import { db } from '../../db/index.js';
import { orders, referralCodes, referrals, users } from '../../db/schema.js';
import { alias } from 'drizzle-orm/pg-core';
import { and, desc, eq, inArray, ne, sql } from 'drizzle-orm';
import { getSettingValue } from '../config/settings.js';
import { REVENUE_STATUSES } from '../finance/financeService.js';
import { LoyaltyError } from '../loyalty/loyaltyService.js';
import { earnPoints } from '../loyalty/loyaltyRepository.js';
import {
  DEFAULT_REFERRAL_PROGRAM,
  ReferralError,
  assertCanQualify,
  assertReferralProgramConfig,
  assertReferralTransition,
  assertRefereeEligible,
  assertWithinReferralLimit,
  buildReferralLink,
  generateReferralCode,
  parseReferralCodeFromInput,
  type ReferralProgramConfig,
  type ReferralStatus,
} from './referralService.js';

/** Used only when settings are unreadable. Production should set referral.baseUrl. */
export const DEFAULT_REFERRAL_BASE_URL = process.env.STOREFRONT_BASE_URL || 'https://tembus.test';

export interface ReferralCodeRecord {
  id: string;
  userId: string;
  code: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ReferralRecord {
  id: string;
  referrerId: string;
  refereeId: string;
  code: string;
  status: ReferralStatus;
  referrerPoints: number;
  refereePoints: number;
  qualifyingOrderId: string | null;
  note: string | null;
  qualifiedAt: Date | null;
  rewardedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ReferralView {
  id: string;
  status: ReferralStatus;
  code: string;
  referrerPoints: number;
  refereePoints: number;
  qualifyingOrderId: string | null;
  note: string | null;
  qualifiedAt: string | null;
  rewardedAt: string | null;
  createdAt: string;
}

export interface ReferralDashboard {
  code: string;
  link: string;
  program: ReferralProgramConfig;
  stats: {
    total: number;
    pending: number;
    qualified: number;
    rewarded: number;
    cancelled: number;
    pointsEarned: number;
  };
  referrals: ReferralView[];
}

export interface AdminReferralView extends ReferralView {
  referrerId: string;
  refereeId: string;
  referrerEmail: string | null;
  refereeEmail: string | null;
}

function toView(row: ReferralRecord): ReferralView {
  return {
    id: row.id,
    status: row.status,
    code: row.code,
    referrerPoints: row.referrerPoints,
    refereePoints: row.refereePoints,
    qualifyingOrderId: row.qualifyingOrderId ?? null,
    note: row.note ?? null,
    qualifiedAt: row.qualifiedAt ? row.qualifiedAt.toISOString() : null,
    rewardedAt: row.rewardedAt ? row.rewardedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Program config comes from settings, with the documented defaults as fallback. */
export async function getReferralProgram(): Promise<ReferralProgramConfig> {
  const stored = await getSettingValue<unknown>('referral.program', DEFAULT_REFERRAL_PROGRAM);
  try {
    return assertReferralProgramConfig(stored);
  } catch {
    return DEFAULT_REFERRAL_PROGRAM;
  }
}

/** Base URL for the share link. Invalid stored values fall back instead of breaking the page. */
export async function getReferralBaseUrl(): Promise<string> {
  const stored = await getSettingValue<{ url?: string }>('referral.baseUrl', {
    url: DEFAULT_REFERRAL_BASE_URL,
  });
  const candidate = typeof stored?.url === 'string' && stored.url.trim() !== ''
    ? stored.url.trim()
    : DEFAULT_REFERRAL_BASE_URL;
  try {
    buildReferralLink(candidate, 'AAAA2222');
    return candidate;
  } catch {
    return DEFAULT_REFERRAL_BASE_URL;
  }
}

async function findCodeByUserId(userId: string): Promise<ReferralCodeRecord | null> {
  const [row] = await db
    .select()
    .from(referralCodes)
    .where(eq(referralCodes.userId, userId))
    .limit(1);
  return (row as ReferralCodeRecord | undefined) ?? null;
}

/**
 * Returns the caller's code, creating one on first use (RFR-001).
 *
 * Codes are derived from the user id plus an attempt counter, so a collision is resolved by
 * retrying with the next attempt rather than looping on randomness. The unique index on
 * `code` is the real guard: onConflictDoNothing lets a concurrent create lose quietly, and
 * the read afterwards returns whichever row won.
 */
export async function getOrCreateReferralCode(userId: string): Promise<ReferralCodeRecord> {
  const existing = await findCodeByUserId(userId);
  if (existing) return existing;

  const maxAttempts = 8;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const code = generateReferralCode(userId, attempt);
    const [created] = await db
      .insert(referralCodes)
      .values({ userId, code })
      .onConflictDoNothing()
      .returning();

    if (created) return created as ReferralCodeRecord;

    // Either this user already has a code (lost the race) or the code belongs to someone
    // else (collision). Re-read by user id to tell the two apart.
    const afterInsert = await findCodeByUserId(userId);
    if (afterInsert) return afterInsert;
  }

  throw new ReferralError(
    'CODE_TAKEN',
    `Gagal membuat kode referral unik setelah ${maxAttempts} percobaan`,
    500
  );
}

/** Customer dashboard: own code, share link, program, counters, and referral list. */
export async function getReferralDashboard(userId: string): Promise<ReferralDashboard> {
  const [codeRow, program, baseUrl] = await Promise.all([
    getOrCreateReferralCode(userId),
    getReferralProgram(),
    getReferralBaseUrl(),
  ]);

  const rows = await db
    .select()
    .from(referrals)
    .where(eq(referrals.referrerId, userId))
    .orderBy(desc(referrals.createdAt))
    .limit(200);

  const list = rows as ReferralRecord[];
  const stats = {
    total: list.length,
    pending: list.filter((row) => row.status === 'pending').length,
    qualified: list.filter((row) => row.status === 'qualified').length,
    rewarded: list.filter((row) => row.status === 'rewarded').length,
    cancelled: list.filter((row) => row.status === 'cancelled').length,
    pointsEarned: list
      .filter((row) => row.status === 'rewarded')
      .reduce((sum, row) => sum + row.referrerPoints, 0),
  };

  return {
    code: codeRow.code,
    link: buildReferralLink(baseUrl, codeRow.code),
    program,
    stats,
    referrals: list.map(toView),
  };
}

async function findReferralForReferee(refereeId: string): Promise<ReferralRecord | null> {
  const [row] = await db
    .select()
    .from(referrals)
    .where(eq(referrals.refereeId, refereeId))
    .limit(1);
  return (row as ReferralRecord | undefined) ?? null;
}

async function hasPaidOrder(userId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: orders.id })
    .from(orders)
    .where(and(eq(orders.customerId, userId), inArray(orders.status, [...REVENUE_STATUSES])))
    .limit(1);
  return Boolean(row);
}

async function countActiveReferrals(referrerId: string): Promise<number> {
  const [row] = await db
    .select({ value: sql<number>`count(*)::int` })
    .from(referrals)
    .where(and(eq(referrals.referrerId, referrerId), ne(referrals.status, 'cancelled')));
  return Number(row?.value ?? 0);
}

export interface ClaimReferralInput {
  refereeId: string;
  /** Raw code or a pasted share link. Both are accepted. */
  codeOrLink: string;
}

/**
 * Claims a referral (RFR-002, RFR-005).
 *
 * The reward amounts are copied onto the row now. Changing the program later must not change
 * what an existing referral promised, otherwise an admin could raise the reward and pay it out
 * twice for the same invite.
 */
export async function claimReferral(input: ClaimReferralInput): Promise<ReferralView> {
  const code = parseReferralCodeFromInput(input.codeOrLink);

  const [codeRow] = await db
    .select()
    .from(referralCodes)
    .where(eq(referralCodes.code, code))
    .limit(1);

  if (!codeRow) {
    throw new ReferralError('CODE_NOT_FOUND', 'Kode referral tidak ditemukan', 404);
  }

  const referrerId = (codeRow as ReferralCodeRecord).userId;
  const program = await getReferralProgram();
  const alreadyReferred = (await findReferralForReferee(input.refereeId)) !== null;

  assertRefereeEligible({
    referrerId,
    refereeId: input.refereeId,
    alreadyReferred,
    hasPaidOrder: alreadyReferred ? false : await hasPaidOrder(input.refereeId),
  });
  assertWithinReferralLimit(await countActiveReferrals(referrerId), program.maxReferralsPerUser);

  try {
    const [created] = await db
      .insert(referrals)
      .values({
        referrerId,
        refereeId: input.refereeId,
        code,
        status: 'pending',
        referrerPoints: program.referrerPoints,
        refereePoints: program.refereePoints,
      })
      .returning();

    return toView(created as ReferralRecord);
  } catch (err: any) {
    // The unique index on referee_id is the real guard. Losing the race arrives here as a
    // driver error, so translate it into the same 409 the pre-check would have produced.
    if (err?.code === '23505') {
      throw new ReferralError('ALREADY_REFERRED', 'Akun ini sudah pernah memakai kode referral', 409);
    }
    throw err;
  }
}

async function findReferralById(referralId: string): Promise<ReferralRecord | null> {
  const [row] = await db
    .select()
    .from(referrals)
    .where(eq(referrals.id, referralId))
    .limit(1);
  return (row as ReferralRecord | undefined) ?? null;
}

/**
 * Checks that the order used to qualify belongs to the referee and is actually paid.
 * Without this, an admin could reward a referral with an unrelated order id.
 */
async function assertQualifyingOrder(orderId: string, refereeId: string): Promise<void> {
  const [row] = await db
    .select({ id: orders.id, status: orders.status, customerId: orders.customerId })
    .from(orders)
    .where(eq(orders.id, orderId))
    .limit(1);

  if (!row) {
    throw new ReferralError('REFERRAL_NOT_FOUND', 'Order verifikasi tidak ditemukan', 404);
  }
  if (row.customerId !== refereeId) {
    throw new ReferralError('REFEREE_NOT_NEW', 'Order verifikasi bukan milik akun referee', 409);
  }
  if (!REVENUE_STATUSES.includes(row.status)) {
    throw new ReferralError(
      'REFEREE_NOT_NEW',
      'Order verifikasi belum lunas, referral belum bisa diverifikasi',
      409
    );
  }
}

/** Credits one side through the loyalty ledger. Zero means that side gets nothing. */
async function awardSide(input: {
  userId: string;
  points: number;
  referralId: string;
  side: 'referrer' | 'referee';
  note: string;
}): Promise<number> {
  if (input.points <= 0) return 0;

  try {
    const result = await earnPoints({
      userId: input.userId,
      source: 'referral',
      referenceId: `${input.referralId}:${input.side}`,
      points: input.points,
      note: input.note,
    });
    return result.earnedPoints;
  } catch (err) {
    // Already credited on a previous attempt. The ledger is the source of truth, so this is
    // success from the caller's point of view.
    if (err instanceof LoyaltyError && err.code === 'DUPLICATE_EARN') return input.points;
    throw err;
  }
}

/**
 * Qualifies and rewards a referral in one admin action (RFR-003, RFR-004).
 *
 * The status moves to qualified first, then rewards are credited, then the row is marked
 * rewarded. If the ledger write fails halfway, the row stays qualified and the next call
 * retries from there instead of starting over.
 */
export async function qualifyReferral(input: {
  referralId: string;
  qualifyingOrderId: string;
  note?: string | null;
}): Promise<ReferralView> {
  const referral = await findReferralById(input.referralId);
  if (!referral) {
    throw new ReferralError('REFERRAL_NOT_FOUND', 'Referral tidak ditemukan', 404);
  }

  let current = referral;

  if (current.status === 'pending') {
    assertCanQualify(current.status);
    await assertQualifyingOrder(input.qualifyingOrderId, current.refereeId);

    const [updated] = await db
      .update(referrals)
      .set({
        status: 'qualified',
        qualifyingOrderId: input.qualifyingOrderId,
        qualifiedAt: new Date(),
        note: input.note ?? current.note ?? null,
        updatedAt: new Date(),
      })
      .where(and(eq(referrals.id, current.id), eq(referrals.status, 'pending')))
      .returning();

    if (!updated) {
      throw new ReferralError('INVALID_TRANSITION', 'Referral berubah status, coba lagi', 409);
    }
    current = updated as ReferralRecord;
  }

  if (current.status === 'rewarded') {
    throw new ReferralError('INVALID_TRANSITION', 'Referral ini sudah diberi hadiah', 409);
  }
  if (current.status === 'cancelled') {
    throw new ReferralError('INVALID_TRANSITION', 'Referral yang dibatalkan tidak bisa diberi hadiah', 409);
  }

  await awardSide({
    userId: current.referrerId,
    points: current.referrerPoints,
    referralId: current.id,
    side: 'referrer',
    note: `Hadiah referral ${current.code}`,
  });
  await awardSide({
    userId: current.refereeId,
    points: current.refereePoints,
    referralId: current.id,
    side: 'referee',
    note: `Bonus referral ${current.code}`,
  });

  const [rewarded] = await db
    .update(referrals)
    .set({ status: 'rewarded', rewardedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(referrals.id, current.id), eq(referrals.status, 'qualified')))
    .returning();

  if (!rewarded) {
    throw new ReferralError('INVALID_TRANSITION', 'Referral berubah status saat proses hadiah', 409);
  }

  return toView(rewarded as ReferralRecord);
}

/** Admin cancellation. Rewarded rows are terminal, so a paid reward is never clawed back here. */
export async function cancelReferral(input: {
  referralId: string;
  note?: string | null;
}): Promise<ReferralView> {
  const referral = await findReferralById(input.referralId);
  if (!referral) {
    throw new ReferralError('REFERRAL_NOT_FOUND', 'Referral tidak ditemukan', 404);
  }
  assertReferralTransition(referral.status, 'cancelled');

  const [updated] = await db
    .update(referrals)
    .set({
      status: 'cancelled',
      note: input.note ?? referral.note ?? null,
      updatedAt: new Date(),
    })
    .where(and(eq(referrals.id, referral.id), eq(referrals.status, referral.status)))
    .returning();

  if (!updated) {
    throw new ReferralError('INVALID_TRANSITION', 'Referral berubah status, coba lagi', 409);
  }
  return toView(updated as ReferralRecord);
}

/** Customer history where the caller was the invited side, not the inviter. */
export async function getReferralForReferee(refereeId: string): Promise<ReferralView | null> {
  const row = await findReferralForReferee(refereeId);
  return row ? toView(row) : null;
}

/** Admin listing, newest first, optionally filtered by status. */
export async function listReferralsForAdmin(options: {
  status?: string | null;
  limit?: number;
} = {}): Promise<AdminReferralView[]> {
  const safeLimit = Math.min(Math.max(Number(options.limit) || 50, 1), 200);
  const referrerUser = alias(users, 'referrer_user');
  const refereeUser = alias(users, 'referee_user');

  const base = db
    .select({
      referral: referrals,
      referrerEmail: referrerUser.email,
      refereeEmail: refereeUser.email,
    })
    .from(referrals)
    .leftJoin(referrerUser, eq(referrerUser.id, referrals.referrerId))
    .leftJoin(refereeUser, eq(refereeUser.id, referrals.refereeId));

  const rows = options.status
    ? await base
        .where(eq(referrals.status, options.status))
        .orderBy(desc(referrals.createdAt))
        .limit(safeLimit)
    : await base.orderBy(desc(referrals.createdAt)).limit(safeLimit);

  return rows.map((row) => ({
    ...toView(row.referral as ReferralRecord),
    referrerId: (row.referral as ReferralRecord).referrerId,
    refereeId: (row.referral as ReferralRecord).refereeId,
    referrerEmail: row.referrerEmail ?? null,
    refereeEmail: row.refereeEmail ?? null,
  }));
}

/** Admin lookup. Returns 404 instead of auto-creating anything. */
export async function getReferralForAdmin(referralId: string): Promise<AdminReferralView> {
  const referrerUser = alias(users, 'referrer_user');
  const refereeUser = alias(users, 'referee_user');

  const [row] = await db
    .select({
      referral: referrals,
      referrerEmail: referrerUser.email,
      refereeEmail: refereeUser.email,
    })
    .from(referrals)
    .leftJoin(referrerUser, eq(referrerUser.id, referrals.referrerId))
    .leftJoin(refereeUser, eq(refereeUser.id, referrals.refereeId))
    .where(eq(referrals.id, referralId))
    .limit(1);

  if (!row) {
    throw new ReferralError('REFERRAL_NOT_FOUND', 'Referral tidak ditemukan', 404);
  }
  const referral = row.referral as ReferralRecord;
  return {
    ...toView(referral),
    referrerId: referral.referrerId,
    refereeId: referral.refereeId,
    referrerEmail: row.referrerEmail ?? null,
    refereeEmail: row.refereeEmail ?? null,
  };
}
