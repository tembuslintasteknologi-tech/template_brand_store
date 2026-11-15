/**
 * Referral rules (RFR-001..RFR-005).
 *
 * Pure functions only: no database, no clock, no environment. The repository composes them
 * with Postgres, and the tests exercise them directly.
 *
 * Two decisions worth stating up front:
 *
 * 1. A code is generated deterministically from a seed plus an attempt counter, so the same
 *    input always produces the same code. That makes collisions testable and lets the
 *    repository retry with attempt + 1 instead of guessing random strings.
 * 2. Rewards are credited through the loyalty ledger, not a second points store. The referral
 *    row stays the source of truth for "who invited whom", and the loyalty transaction is the
 *    source of truth for "who got paid".
 */

export type ReferralStatus = 'pending' | 'qualified' | 'rewarded' | 'cancelled';

export type ReferralErrorCode =
  | 'INVALID_CODE'
  | 'INVALID_CODE_LENGTH'
  | 'INVALID_BASE_URL'
  | 'INVALID_REWARD'
  | 'INVALID_LIMIT'
  | 'CODE_TAKEN'
  | 'CODE_NOT_FOUND'
  | 'SELF_REFERRAL'
  | 'ALREADY_REFERRED'
  | 'REFEREE_NOT_NEW'
  | 'REFERRAL_NOT_FOUND'
  | 'INVALID_TRANSITION'
  | 'REFERRAL_LIMIT_REACHED';

export class ReferralError extends Error {
  readonly code: ReferralErrorCode;
  readonly status: number;

  constructor(code: ReferralErrorCode, message: string, status = 400) {
    super(message);
    this.name = 'ReferralError';
    this.code = code;
    this.status = status;
  }
}

export interface ReferralProgramConfig {
  /** Points credited to the person who shared the code. */
  referrerPoints: number;
  /** Points credited to the person who signed up with the code. */
  refereePoints: number;
  /** null means no cap. Counted across pending, qualified, and rewarded referrals. */
  maxReferralsPerUser: number | null;
}

export const DEFAULT_REFERRAL_PROGRAM: ReferralProgramConfig = {
  referrerPoints: 50,
  refereePoints: 25,
  maxReferralsPerUser: null,
};

/** No I, L, O, 0, or 1, so a code read aloud or retyped cannot be confused. */
export const REFERRAL_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export const REFERRAL_CODE_LENGTH = 8;

const REFERRAL_TRANSITIONS: Record<ReferralStatus, ReferralStatus[]> = {
  pending: ['qualified', 'cancelled'],
  qualified: ['rewarded', 'cancelled'],
  rewarded: [],
  cancelled: [],
};

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

/** Validates the referral program config. Throws instead of returning null. */
export function assertReferralProgramConfig(input: unknown): ReferralProgramConfig {
  if (input === null || typeof input !== 'object') {
    throw new ReferralError('INVALID_REWARD', 'Konfigurasi referral harus berupa objek');
  }

  const raw = input as Partial<ReferralProgramConfig>;

  if (!isNonNegativeInteger(raw.referrerPoints)) {
    throw new ReferralError('INVALID_REWARD', 'referrerPoints harus bilangan bulat >= 0');
  }
  if (!isNonNegativeInteger(raw.refereePoints)) {
    throw new ReferralError('INVALID_REWARD', 'refereePoints harus bilangan bulat >= 0');
  }
  if (
    raw.maxReferralsPerUser !== null &&
    raw.maxReferralsPerUser !== undefined &&
    !isNonNegativeInteger(raw.maxReferralsPerUser)
  ) {
    throw new ReferralError('INVALID_LIMIT', 'maxReferralsPerUser harus null atau bilangan bulat >= 0');
  }

  return {
    referrerPoints: raw.referrerPoints,
    refereePoints: raw.refereePoints,
    maxReferralsPerUser: raw.maxReferralsPerUser ?? null,
  };
}

/** 32-bit FNV-1a. Small, dependency free, and stable across runs. */
function fnv1a(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/**
 * Deterministic code for a seed and attempt. Same seed plus same attempt always yields the same
 * code, which is what the repository retry loop relies on.
 */
export function generateReferralCode(seed: string, attempt = 0): string {
  if (!seed || typeof seed !== 'string') {
    throw new ReferralError('INVALID_CODE', 'Seed kode referral wajib berupa string');
  }
  if (!Number.isInteger(attempt) || attempt < 0) {
    throw new ReferralError('INVALID_CODE', 'Attempt kode referral harus bilangan bulat >= 0');
  }

  let state = fnv1a(`${seed}#${attempt}`) || 0x9e3779b9;
  let code = '';
  for (let i = 0; i < REFERRAL_CODE_LENGTH; i += 1) {
    // xorshift32 keeps successive characters from marching in a predictable pattern.
    state ^= state << 13;
    state >>>= 0;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    code += REFERRAL_ALPHABET[state % REFERRAL_ALPHABET.length];
  }
  return code;
}

/** Users type codes by hand, so accept lower case, spaces, and dashes. */
export function normalizeReferralCode(input: unknown): string {
  if (typeof input !== 'string') {
    throw new ReferralError('INVALID_CODE', 'Kode referral wajib berupa string');
  }
  const cleaned = input.toUpperCase().replace(/[\s-]/g, '');
  if (cleaned.length < 4 || cleaned.length > 16) {
    throw new ReferralError('INVALID_CODE_LENGTH', 'Panjang kode referral harus 4 sampai 16 karakter');
  }
  for (const char of cleaned) {
    if (!REFERRAL_ALPHABET.includes(char)) {
      throw new ReferralError(
        'INVALID_CODE',
        'Kode referral hanya boleh berisi huruf dan angka tanpa karakter ambigu'
      );
    }
  }
  return cleaned;
}

/** Joins the configured base URL with the code path. Trailing slashes are normalised. */
export function buildReferralLink(baseUrl: string, code: string): string {
  if (typeof baseUrl !== 'string' || baseUrl.trim() === '') {
    throw new ReferralError('INVALID_BASE_URL', 'Base URL referral wajib diisi');
  }

  let url: URL;
  try {
    url = new URL(baseUrl.trim());
  } catch {
    throw new ReferralError('INVALID_BASE_URL', 'Base URL referral tidak valid');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new ReferralError('INVALID_BASE_URL', 'Base URL referral harus http atau https');
  }

  const normalizedCode = normalizeReferralCode(code);
  const base = `${url.protocol}//${url.host}${url.pathname}`.replace(/\/+$/, '');
  return `${base}/r/${normalizedCode}`;
}

/** Extracts the code out of a shared link, so the claim form can accept a pasted URL. */
export function parseReferralCodeFromInput(input: unknown): string {
  if (typeof input !== 'string' || input.trim() === '') {
    throw new ReferralError('INVALID_CODE', 'Kode atau link referral wajib diisi');
  }
  const trimmed = input.trim();
  const marker = '/r/';
  const index = trimmed.lastIndexOf(marker);
  if (index >= 0) {
    return normalizeReferralCode(trimmed.slice(index + marker.length).split(/[?#]/)[0]);
  }
  return normalizeReferralCode(trimmed);
}

export function canTransitionReferral(from: ReferralStatus, to: ReferralStatus): boolean {
  return REFERRAL_TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertReferralTransition(from: ReferralStatus, to: ReferralStatus): void {
  if (!canTransitionReferral(from, to)) {
    throw new ReferralError(
      'INVALID_TRANSITION',
      `Status referral tidak bisa berubah dari ${from} ke ${to}`,
      409
    );
  }
}

/** Only pending referrals can be qualified, and only by a real order reference. */
export function assertCanQualify(status: ReferralStatus): void {
  if (status !== 'pending') {
    throw new ReferralError('INVALID_TRANSITION', 'Hanya referral pending yang bisa diverifikasi', 409);
  }
}

/** Only qualified referrals can be rewarded. Rewarded and cancelled rows are terminal. */
export function assertCanReward(status: ReferralStatus): void {
  if (status !== 'qualified') {
    throw new ReferralError('INVALID_TRANSITION', 'Hanya referral qualified yang bisa diberi hadiah', 409);
  }
}

export interface RefereeEligibilityInput {
  referrerId: string;
  refereeId: string;
  /** True when the referee already has a referral row, in any status. */
  alreadyReferred: boolean;
  /** True when the referee already has a paid or fulfilled order. */
  hasPaidOrder: boolean;
}

/**
 * Anti abuse gate. A referee must be a genuinely new customer, cannot refer themselves, and can
 * only be claimed once. Order history is checked because a long time customer claiming a code is
 * the cheapest form of referral fraud.
 */
export function assertRefereeEligible(input: RefereeEligibilityInput): void {
  if (!input.referrerId || !input.refereeId) {
    throw new ReferralError('REFERRAL_NOT_FOUND', 'Referral butuh referrer dan referee', 400);
  }
  if (input.referrerId === input.refereeId) {
    throw new ReferralError('SELF_REFERRAL', 'Tidak bisa memakai kode referral sendiri', 409);
  }
  if (input.alreadyReferred) {
    throw new ReferralError('ALREADY_REFERRED', 'Akun ini sudah pernah memakai kode referral', 409);
  }
  if (input.hasPaidOrder) {
    throw new ReferralError(
      'REFEREE_NOT_NEW',
      'Kode referral hanya untuk pelanggan baru yang belum punya order lunas',
      409
    );
  }
}

/** Caps how many referrals one account may accumulate. null means unlimited. */
export function assertWithinReferralLimit(count: number, maxReferralsPerUser: number | null): void {
  if (maxReferralsPerUser === null) return;
  const used = Number.isFinite(count) ? Math.max(0, count) : 0;
  if (used >= maxReferralsPerUser) {
    throw new ReferralError(
      'REFERRAL_LIMIT_REACHED',
      `Batas ${maxReferralsPerUser} referral per akun sudah tercapai`,
      409
    );
  }
}

export interface ReferralReward {
  referrerPoints: number;
  refereePoints: number;
}

/** Rewards for one successful referral. Zero is allowed, meaning one side gets nothing. */
export function referralRewards(
  config: ReferralProgramConfig = DEFAULT_REFERRAL_PROGRAM
): ReferralReward {
  const parsed = assertReferralProgramConfig(config);
  return { referrerPoints: parsed.referrerPoints, refereePoints: parsed.refereePoints };
}
