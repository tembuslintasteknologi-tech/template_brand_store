/**
 * RFC 4226 (HOTP) dan RFC 6238 (TOTP) tanpa dependency.
 *
 * Kenapa ditulis sendiri: `otplib` dan sejenisnya menarik beberapa paket tambahan hanya untuk
 * ~100 baris HMAC. Implementasi ini memakai `node:crypto` langsung dan diuji terhadap test
 * vector resmi RFC di `src/tests/totp.test.ts`, jadi kompatibel dengan Google Authenticator,
 * Authy, 1Password, dan aplikasi authenticator lain.
 */

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export const DEFAULT_TOTP_DIGITS = 6;
export const DEFAULT_TOTP_PERIOD = 30;
export const DEFAULT_TOTP_WINDOW = 1;

export class TotpError extends Error {
  readonly status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = 'TotpError';
    this.status = status;
  }
}

/** Base32 tanpa padding, sesuai yang diharapkan authenticator di field `secret`. */
export function base32Encode(bytes: Uint8Array): string {
  let output = '';
  let buffer = 0;
  let bits = 0;

  for (const byte of bytes) {
    buffer = (buffer << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      output += BASE32_ALPHABET[(buffer >>> bits) & 31];
    }
  }

  if (bits > 0) {
    output += BASE32_ALPHABET[(buffer << (5 - bits)) & 31];
  }

  return output;
}

/**
 * Menerima secret apa adanya dari input user: huruf kecil, spasi, dan tanda hubung tetap
 * dibaca, karena orang menyalin secret dari layar dengan format yang berbeda-beda.
 */
export function base32Decode(input: string): Buffer {
  const normalized = String(input ?? '')
    .toUpperCase()
    .replace(/[\s-]/g, '')
    .replace(/=+$/g, '');

  if (normalized.length === 0) {
    throw new TotpError('Secret TOTP kosong');
  }

  let buffer = 0;
  let bits = 0;
  const output: number[] = [];

  for (const char of normalized) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index === -1) {
      throw new TotpError(`Karakter base32 tidak valid: ${char}`);
    }
    buffer = (buffer << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      output.push((buffer >>> bits) & 0xff);
    }
  }

  return Buffer.from(output);
}

export function generateTotpSecret(byteLength = 20): string {
  if (!Number.isInteger(byteLength) || byteLength < 10 || byteLength > 64) {
    throw new TotpError('Panjang secret harus antara 10 dan 64 byte');
  }
  return base32Encode(randomBytes(byteLength));
}

function counterToBuffer(counter: number): Buffer {
  if (!Number.isFinite(counter) || counter < 0) {
    throw new TotpError('Counter TOTP tidak valid');
  }
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64BE(BigInt(Math.floor(counter)));
  return buffer;
}

/** HOTP dengan dynamic truncation sesuai RFC 4226 bagian 5.3. */
export function hotp(secret: string | Buffer, counter: number, digits = DEFAULT_TOTP_DIGITS): string {
  if (!Number.isInteger(digits) || digits < 6 || digits > 10) {
    throw new TotpError('Digit TOTP harus antara 6 dan 10');
  }

  const key = Buffer.isBuffer(secret) ? secret : base32Decode(secret);
  const digest = createHmac('sha1', key).update(counterToBuffer(counter)).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);

  return String(binary % 10 ** digits).padStart(digits, '0');
}

export interface TotpOptions {
  digits?: number;
  period?: number;
  /** Waktu acuan, default `Date.now()`. Diisi eksplisit di test. */
  now?: number;
}

/** Kode TOTP untuk jendela waktu yang memuat `now`. */
export function totp(secret: string, options: TotpOptions = {}): string {
  const period = options.period ?? DEFAULT_TOTP_PERIOD;
  const now = options.now ?? Date.now();
  const counter = Math.floor(now / 1000 / period);
  return hotp(secret, counter, options.digits ?? DEFAULT_TOTP_DIGITS);
}

/** Membuang spasi, tanda hubung, dan karakter non digit dari kode yang diketik user. */
export function normalizeTotpCode(raw: unknown): string {
  return String(raw ?? '').replace(/\D/g, '');
}

export interface VerifyTotpOptions extends TotpOptions {
  /**
   * Toleransi jendela ke belakang dan ke depan. `1` berarti kode masih diterima satu periode
   * sebelum dan sesudah jendela sekarang, cukup untuk selisih jam perangkat tanpa membuka
   * ruang brute force yang lebar.
   */
  window?: number;
}

export function verifyTotp(secret: string, code: unknown, options: VerifyTotpOptions = {}): boolean {
  const normalized = normalizeTotpCode(code);
  const digits = options.digits ?? DEFAULT_TOTP_DIGITS;

  if (normalized.length !== digits) return false;

  const period = options.period ?? DEFAULT_TOTP_PERIOD;
  const now = options.now ?? Date.now();
  const window = Math.max(0, Math.min(options.window ?? DEFAULT_TOTP_WINDOW, 5));
  const counter = Math.floor(now / 1000 / period);

  let matched = false;
  for (let offset = -window; offset <= window; offset += 1) {
    const candidate = hotp(secret, counter + offset, digits);
    const expected = Buffer.from(candidate, 'utf8');
    const provided = Buffer.from(normalized, 'utf8');
    if (expected.length === provided.length && timingSafeEqual(expected, provided)) {
      matched = true;
    }
  }

  return matched;
}

export interface OtpauthInput {
  issuer: string;
  account: string;
  secret: string;
  digits?: number;
  period?: number;
  algorithm?: 'SHA1' | 'SHA256' | 'SHA512';
}

/**
 * URI yang dipindai QR code di aplikasi authenticator. Format mengikuti Key Uri Format Google
 * Authenticator; label dan issuer di-encode supaya spasi serta titik dua tidak memutus query.
 */
export function buildOtpauthUri(input: OtpauthInput): string {
  const issuer = String(input.issuer ?? '').trim();
  const account = String(input.account ?? '').trim();
  const secret = String(input.secret ?? '').trim();

  if (!issuer) throw new TotpError('Issuer otpauth wajib diisi');
  if (!account) throw new TotpError('Account otpauth wajib diisi');
  if (!secret) throw new TotpError('Secret otpauth wajib diisi');

  const label = encodeURIComponent(`${issuer}:${account}`);
  const params = new URLSearchParams({
    secret,
    issuer,
    algorithm: input.algorithm ?? 'SHA1',
    digits: String(input.digits ?? DEFAULT_TOTP_DIGITS),
    period: String(input.period ?? DEFAULT_TOTP_PERIOD),
  });

  return `otpauth://totp/${label}?${params.toString()}`;
}

const RECOVERY_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/**
 * Recovery code sekali pakai. Alfabet sengaja membuang `I`, `O`, `0`, `1` supaya tidak ada
 * pasangan karakter yang tertukar saat user mengetik ulang dari kertas.
 */
export function generateRecoveryCodes(count = 10, length = 10): string[] {
  if (!Number.isInteger(count) || count < 1 || count > 50) {
    throw new TotpError('Jumlah recovery code harus antara 1 dan 50');
  }
  if (!Number.isInteger(length) || length < 8 || length > 20) {
    throw new TotpError('Panjang recovery code harus antara 8 dan 20');
  }

  const codes: string[] = [];
  while (codes.length < count) {
    const bytes = randomBytes(length);
    let code = '';
    for (const byte of bytes) {
      code += RECOVERY_ALPHABET[byte % RECOVERY_ALPHABET.length];
    }
    if (!codes.includes(code)) codes.push(code);
  }
  return codes;
}

/** Menormalkan recovery code supaya `abcd-efgh` dan `ABCDEFGH` dianggap sama. */
export function normalizeRecoveryCode(raw: unknown): string {
  return String(raw ?? '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}
