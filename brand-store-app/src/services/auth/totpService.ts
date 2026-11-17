/**
 * Alur 2FA TOTP untuk admin (AUT-012).
 *
 * Tiga fase yang dipisah tegas:
 * 1. `startEnrollment` membuat secret baru, menyimpannya terenkripsi dengan `enabled: false`,
 *    dan mengembalikan otpauth URI plus recovery codes sekali lihat.
 * 2. `confirmEnrollment` memverifikasi kode pertama. Hanya setelah ini `enabled` menjadi true,
 *    sehingga admin yang gagal scan QR tidak terkunci dari akunnya sendiri.
 * 3. `verifyLogin` dipakai login dua langkah: password benar menghasilkan challenge token
 *    berumur pendek, lalu kode TOTP menukarnya menjadi sesi penuh.
 */

import { createHash } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { adminTotp, users } from '../../db/schema.js';
import { signJwt, verifyJwt } from '../../middleware/auth.js';
import { recordAdminAction } from '../admin/auditLog.js';
import {
  buildOtpauthUri,
  generateRecoveryCodes,
  generateTotpSecret,
  normalizeRecoveryCode,
  TotpError,
  verifyTotp,
} from './totp.js';
import { isSecretBoxConfigured, openSecret, safeEqualText, sealSecret, TOTP_KEY_ENV } from './secretBox.js';

export const TOTP_CHALLENGE_TYP = 'totp_challenge';
export const TOTP_CHALLENGE_TTL_SECONDS = 300;
export const RECOVERY_CODE_COUNT = 10;

export class TotpServiceError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(message: string, status = 400, code = 'TOTP_ERROR') {
    super(message);
    this.name = 'TotpServiceError';
    this.status = status;
    this.code = code;
  }
}

/**
 * Recovery code memakai 10 karakter dari alfabet 32 simbol (~2^50 kemungkinan), jadi hash
 * SHA-256 tanpa salt sudah cukup untuk mencegah pemulihan dari tabel yang bocor, sementara
 * tetap cepat karena tidak ada password manusia yang perlu diperlambat.
 */
export function hashRecoveryCode(code: string): string {
  return createHash('sha256').update(normalizeRecoveryCode(code), 'utf8').digest('hex');
}

export interface TotpStatus {
  enabled: boolean;
  configured: boolean;
  confirmedAt: Date | null;
  lastUsedAt: Date | null;
  recoveryCodesRemaining: number;
}

export async function getTotpStatus(userId: string): Promise<TotpStatus> {
  const [row] = await db.select().from(adminTotp).where(eq(adminTotp.userId, userId as any)).limit(1);
  return {
    enabled: row?.enabled === true,
    configured: isSecretBoxConfigured(),
    confirmedAt: row?.confirmedAt ?? null,
    lastUsedAt: row?.lastUsedAt ?? null,
    recoveryCodesRemaining: Array.isArray(row?.recoveryCodes) ? (row!.recoveryCodes as string[]).length : 0,
  };
}

export async function isTotpEnabled(userId: string): Promise<boolean> {
  try {
    const [row] = await db
      .select({ enabled: adminTotp.enabled })
      .from(adminTotp)
      .where(eq(adminTotp.userId, userId as any))
      .limit(1);
    return row?.enabled === true;
  } catch {
    // Tabel belum ada atau database sedang down: jangan pernah memaksa 2FA yang tidak bisa
    // diverifikasi, karena itu akan mengunci semua admin di luar sistem.
    return false;
  }
}

export interface EnrollmentResult {
  secret: string;
  otpauthUri: string;
  recoveryCodes: string[];
  issuer: string;
  account: string;
  digits: number;
  period: number;
}

export async function startEnrollment(input: {
  userId: string;
  email: string;
  issuer: string;
  digits?: number;
  period?: number;
}): Promise<EnrollmentResult> {
  if (!isSecretBoxConfigured()) {
    throw new TotpServiceError(
      `2FA belum aktif karena ${TOTP_KEY_ENV} belum diset. Isi kunci 32 byte dulu di environment.`,
      503,
      'TOTP_NOT_CONFIGURED'
    );
  }

  const [existing] = await db
    .select()
    .from(adminTotp)
    .where(eq(adminTotp.userId, input.userId as any))
    .limit(1);

  if (existing?.enabled === true) {
    throw new TotpServiceError(
      '2FA sudah aktif untuk akun ini. Nonaktifkan dulu sebelum mendaftar ulang.',
      409,
      'TOTP_ALREADY_ENABLED'
    );
  }

  const digits = input.digits ?? 6;
  const period = input.period ?? 30;
  const secret = generateTotpSecret();
  const recoveryCodes = generateRecoveryCodes(RECOVERY_CODE_COUNT);
  const sealed = sealSecret(secret);
  const now = new Date();

  const values = {
    userId: input.userId as any,
    secretEncrypted: sealed,
    enabled: false,
    confirmedAt: null,
    recoveryCodes: recoveryCodes.map(hashRecoveryCode) as any,
    updatedAt: now,
  };

  if (existing) {
    await db.update(adminTotp).set(values).where(eq(adminTotp.userId, input.userId as any));
  } else {
    await db.insert(adminTotp).values(values);
  }

  return {
    secret,
    otpauthUri: buildOtpauthUri({
      issuer: input.issuer,
      account: input.email,
      secret,
      digits,
      period,
    }),
    recoveryCodes,
    issuer: input.issuer,
    account: input.email,
    digits,
    period,
  };
}

async function loadRow(userId: string) {
  const [row] = await db.select().from(adminTotp).where(eq(adminTotp.userId, userId as any)).limit(1);
  return row ?? null;
}

export async function confirmEnrollment(userId: string, code: unknown): Promise<TotpStatus> {
  const row = await loadRow(userId);
  if (!row) {
    throw new TotpServiceError('Belum ada proses enrollment 2FA untuk akun ini', 404, 'TOTP_NOT_ENROLLED');
  }
  if (row.enabled === true) {
    throw new TotpServiceError('2FA sudah aktif', 409, 'TOTP_ALREADY_ENABLED');
  }

  const secret = openSecret(row.secretEncrypted);
  if (!verifyTotp(secret, code)) {
    throw new TotpServiceError('Kode authenticator tidak cocok. Coba kode terbaru.', 400, 'TOTP_INVALID_CODE');
  }

  const now = new Date();
  await db
    .update(adminTotp)
    .set({ enabled: true, confirmedAt: now, lastUsedAt: now, updatedAt: now })
    .where(eq(adminTotp.userId, userId as any));

  await recordAdminAction({
    actorId: userId,
    action: 'auth.2fa.enabled',
    targetType: 'user',
    targetId: userId,
  });

  return getTotpStatus(userId);
}

export interface TotpVerification {
  ok: boolean;
  usedRecoveryCode: boolean;
  recoveryCodesRemaining: number;
}

/**
 * Memverifikasi kode TOTP atau recovery code. Recovery code yang terpakai langsung dihapus,
 * jadi satu kertas tidak bisa dipakai dua kali.
 */
export async function verifyUserCode(userId: string, code: unknown): Promise<TotpVerification> {
  const row = await loadRow(userId);
  if (!row || row.enabled !== true) {
    throw new TotpServiceError('2FA tidak aktif untuk akun ini', 409, 'TOTP_NOT_ENABLED');
  }

  const secret = openSecret(row.secretEncrypted);
  if (verifyTotp(secret, code)) {
    await db
      .update(adminTotp)
      .set({ lastUsedAt: new Date(), updatedAt: new Date() })
      .where(eq(adminTotp.userId, userId as any));
    return {
      ok: true,
      usedRecoveryCode: false,
      recoveryCodesRemaining: Array.isArray(row.recoveryCodes) ? (row.recoveryCodes as string[]).length : 0,
    };
  }

  const hashes = Array.isArray(row.recoveryCodes) ? (row.recoveryCodes as string[]) : [];
  const inputHash = hashRecoveryCode(String(code ?? ''));
  const matched = hashes.find((hash) => safeEqualText(hash, inputHash));

  if (!matched) {
    throw new TotpServiceError('Kode 2FA salah atau sudah kedaluwarsa', 401, 'TOTP_INVALID_CODE');
  }

  const remaining = hashes.filter((hash) => hash !== matched);
  await db
    .update(adminTotp)
    .set({ recoveryCodes: remaining as any, lastUsedAt: new Date(), updatedAt: new Date() })
    .where(eq(adminTotp.userId, userId as any));

  await recordAdminAction({
    actorId: userId,
    action: 'auth.2fa.recovery_code_used',
    targetType: 'user',
    targetId: userId,
    metadata: { remaining: remaining.length },
  });

  return { ok: true, usedRecoveryCode: true, recoveryCodesRemaining: remaining.length };
}

export async function disableTotp(userId: string, code: unknown): Promise<TotpStatus> {
  const row = await loadRow(userId);
  if (!row || row.enabled !== true) {
    throw new TotpServiceError('2FA belum aktif untuk akun ini', 409, 'TOTP_NOT_ENABLED');
  }

  // Nonaktif 2FA adalah penurunan keamanan, jadi tetap butuh kode yang valid.
  await verifyUserCode(userId, code);

  await db
    .update(adminTotp)
    .set({
      enabled: false,
      confirmedAt: null,
      recoveryCodes: [] as any,
      secretEncrypted: sealSecret(generateTotpSecret()),
      updatedAt: new Date(),
    })
    .where(eq(adminTotp.userId, userId as any));

  await recordAdminAction({
    actorId: userId,
    action: 'auth.2fa.disabled',
    targetType: 'user',
    targetId: userId,
  });

  return getTotpStatus(userId);
}

export function signTotpChallenge(user: { id: string; email?: string; role?: string }): string {
  return signJwt(
    { sub: user.id, id: user.id, email: user.email ?? null, role: user.role ?? null, typ: TOTP_CHALLENGE_TYP },
    TOTP_CHALLENGE_TTL_SECONDS
  );
}

export function verifyTotpChallenge(token: string): { userId: string; role: string | null } {
  let payload: any;
  try {
    payload = verifyJwt(token);
  } catch {
    throw new TotpServiceError('Challenge 2FA tidak valid atau kedaluwarsa', 401, 'TOTP_CHALLENGE_INVALID');
  }
  if (payload?.typ !== TOTP_CHALLENGE_TYP) {
    throw new TotpServiceError('Token yang dikirim bukan challenge 2FA', 401, 'TOTP_CHALLENGE_INVALID');
  }
  const userId = String(payload.sub ?? payload.id ?? '');
  if (!userId) {
    throw new TotpServiceError('Challenge 2FA tidak memuat identitas user', 401, 'TOTP_CHALLENGE_INVALID');
  }
  return { userId, role: payload.role ?? null };
}

/** Dipakai route login untuk memutuskan apakah langkah kedua diperlukan. */
export async function requiresSecondFactor(user: { id: string; role: string }): Promise<boolean> {
  if (user.role !== 'admin' && user.role !== 'branch_admin') return false;
  return isTotpEnabled(user.id);
}

export async function findUserForChallenge(userId: string) {
  const [row] = await db
    .select({
      id: users.id,
      email: users.email,
      fullName: users.fullName,
      role: users.role,
      branchId: users.branchId,
      status: users.status,
    })
    .from(users)
    .where(eq(users.id, userId as any))
    .limit(1);
  if (!row) {
    throw new TotpServiceError('User untuk challenge ini sudah tidak ada', 404, 'TOTP_USER_NOT_FOUND');
  }
  return row;
}

/** Helper untuk test dan route: cek kode tanpa melempar, dengan alasan yang bisa dibaca. */
export function checkTotpCode(secret: string, code: unknown, now?: number) {
  return {
    valid: verifyTotp(secret, code, now === undefined ? {} : { now }),
    code: normalizeRecoveryCode(code),
  };
}
