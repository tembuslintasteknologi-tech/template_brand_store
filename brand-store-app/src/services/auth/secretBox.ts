/**
 * Enkripsi secret TOTP saat disimpan.
 *
 * Secret TOTP setara password jangka panjang: siapa pun yang bisa membacanya dapat membuat kode
 * valid selamanya. Karena itu kolom `admin_totp.secret_encrypted` tidak pernah menyimpan base32
 * polos. Kunci diambil dari `TOTP_ENCRYPTION_KEY` dan enrollment ditolak kalau kunci itu tidak
 * ada, bukan diam-diam memakai kunci default yang bisa ditebak dari source code.
 */

import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from 'node:crypto';

export const TOTP_KEY_ENV = 'TOTP_ENCRYPTION_KEY';
const VERSION = 'v1';
const IV_BYTES = 12;

export class SecretBoxError extends Error {
  readonly status: number;

  constructor(message: string, status = 500) {
    super(message);
    this.name = 'SecretBoxError';
    this.status = status;
  }
}

function decodeKeyMaterial(raw: string): Buffer {
  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    return Buffer.from(raw, 'hex');
  }

  const base64 = Buffer.from(raw, 'base64');
  if (base64.length === 32 && base64.toString('base64').replace(/=+$/, '') === raw.replace(/=+$/, '')) {
    return base64;
  }

  if (raw.length < 32) {
    throw new SecretBoxError(
      `${TOTP_KEY_ENV} minimal 32 karakter, atau 64 hex, atau base64 dari 32 byte`
    );
  }

  // Passphrase panjang dipadatkan ke 32 byte. Ini bukan KDF ideal, tetapi tetap jauh lebih baik
  // daripada menyimpan secret polos, dan dokumentasi menyarankan nilai acak 32 byte.
  return createHash('sha256').update(raw, 'utf8').digest();
}

export function resolveSecretBoxKey(env: NodeJS.ProcessEnv = process.env): Buffer | null {
  const raw = env[TOTP_KEY_ENV];
  if (!raw || raw.trim().length === 0) return null;
  return decodeKeyMaterial(raw.trim());
}

export function isSecretBoxConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return resolveSecretBoxKey(env) !== null;
}

function requireKey(): Buffer {
  const key = resolveSecretBoxKey();
  if (!key) {
    throw new SecretBoxError(
      `2FA belum bisa diaktifkan: ${TOTP_KEY_ENV} belum diisi di environment`,
      503
    );
  }
  return key;
}

/** Format: `v1:<iv base64>:<auth tag base64>:<ciphertext base64>`. */
export function sealSecret(plaintext: string): string {
  if (!plaintext) {
    throw new SecretBoxError('Secret yang dienkripsi tidak boleh kosong');
  }
  const key = requireKey();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString('base64'), tag.toString('base64'), ciphertext.toString('base64')].join(':');
}

export function openSecret(sealed: string): string {
  const parts = String(sealed ?? '').split(':');
  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new SecretBoxError('Format secret terenkripsi tidak dikenal');
  }
  const key = requireKey();
  const iv = Buffer.from(parts[1], 'base64');
  const tag = Buffer.from(parts[2], 'base64');
  const ciphertext = Buffer.from(parts[3], 'base64');

  if (iv.length !== IV_BYTES || tag.length !== 16) {
    throw new SecretBoxError('Secret terenkripsi rusak');
  }

  try {
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  } catch {
    // Auth tag gagal berarti kunci salah atau ciphertext diubah. Keduanya tidak boleh dibedakan
    // ke client karena perbedaannya membocorkan informasi tentang kunci.
    throw new SecretBoxError(`Secret tidak bisa dibuka, periksa ${TOTP_KEY_ENV}`);
  }
}

/** Perbandingan constant time untuk hash recovery code yang dibaca dari JSON. */
export function safeEqualText(a: string, b: string): boolean {
  const left = Buffer.from(String(a ?? ''), 'utf8');
  const right = Buffer.from(String(b ?? ''), 'utf8');
  if (left.length !== right.length || left.length === 0) return false;
  return timingSafeEqual(left, right);
}
