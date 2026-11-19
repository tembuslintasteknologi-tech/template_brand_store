/**
 * Kebijakan password akun admin.
 *
 * Seed membuat akun admin dari `ADMIN_PASSWORD`. Selama variabel itu tidak diisi, instalasi
 * memakai password contoh yang tertulis di dokumentasi, jadi password tersebut harus dianggap
 * publik. Login tetap diizinkan, tetapi respons menandai `mustChangePassword` supaya frontend
 * memaksa penggantian sebelum fitur lain dipakai.
 */

import argon2 from 'argon2';

/** Nilai cadangan yang sama dengan `unifiedConfig.admin.password`. */
export const DEFAULT_ADMIN_PASSWORD = 'AdminPassword123!';

/**
 * Password seed yang sudah tertulis di repo (fallback kode dan contoh `.env.example`).
 * Keduanya harus dianggap publik: siapa pun yang pernah membaca template ini tahu nilainya.
 */
export const KNOWN_DEFAULT_ADMIN_PASSWORDS = [DEFAULT_ADMIN_PASSWORD, 'Admin12345!'] as const;

export const PASSWORD_MIN_LENGTH = 12;

const WEAK_PASSWORDS = new Set([
  DEFAULT_ADMIN_PASSWORD.toLowerCase(),
  'password',
  'password123',
  'admin',
  'admin123',
  'administrator',
  'qwerty123',
  '123456789012',
  'letmein12345',
  'changeme1234',
]);

export const PRIVILEGED_ROLES = new Set(['admin', 'branch_admin']);

export interface PasswordContext {
  email?: string | null;
  fullName?: string | null;
}

export interface PasswordStrengthResult {
  ok: boolean;
  issues: string[];
}

export function isPrivilegedRole(role?: string | null): boolean {
  return PRIVILEGED_ROLES.has(String(role ?? ''));
}

/**
 * True kalau environment masih memakai password admin contoh: `ADMIN_PASSWORD` kosong atau
 * persis sama dengan nilai default. Dipakai untuk peringatan startup dan dokumentasi.
 */
export function isDefaultAdminPasswordActive(env: NodeJS.ProcessEnv = process.env): boolean {
  const configured = String(env.ADMIN_PASSWORD ?? '').trim();
  return configured.length === 0 || configured === DEFAULT_ADMIN_PASSWORD;
}

/** Validasi kekuatan password baru. Dipakai endpoint ganti password dan test. */
export function validatePasswordStrength(
  password: string,
  context: PasswordContext = {}
): PasswordStrengthResult {
  const value = String(password ?? '');
  const issues: string[] = [];

  if (value.length < PASSWORD_MIN_LENGTH) {
    issues.push(`Minimal ${PASSWORD_MIN_LENGTH} karakter`);
  }
  if (!/[a-z]/.test(value)) issues.push('Harus memuat huruf kecil');
  if (!/[A-Z]/.test(value)) issues.push('Harus memuat huruf besar');
  if (!/[0-9]/.test(value)) issues.push('Harus memuat angka');
  if (!/[^A-Za-z0-9]/.test(value)) issues.push('Harus memuat simbol');
  if (WEAK_PASSWORDS.has(value.toLowerCase())) issues.push('Password terlalu umum');
  for (const known of KNOWN_DEFAULT_ADMIN_PASSWORDS) {
    if (value.toLowerCase() === known.toLowerCase()) {
      issues.push('Tidak boleh memakai password default');
      break;
    }
  }
  if (/\s/.test(value)) issues.push('Tidak boleh memuat spasi');

  const email = String(context.email ?? '')
    .trim()
    .toLowerCase();
  if (email) {
    const localPart = email.split('@')[0];
    if (localPart.length >= 4 && value.toLowerCase().includes(localPart)) {
      issues.push('Tidak boleh memuat bagian dari email');
    }
  }

  const fullName = String(context.fullName ?? '')
    .trim()
    .toLowerCase();
  if (fullName.length >= 4 && value.toLowerCase().includes(fullName)) {
    issues.push('Tidak boleh memuat nama lengkap');
  }

  return { ok: issues.length === 0, issues };
}

/**
 * Cek apakah hash di database masih hash dari salah satu password seed yang tertulis di repo.
 * Biaya argon2 verify memang mahal, tetapi hanya dijalankan saat login akun admin.
 */
export async function isHashOfDefaultPassword(passwordHash: string): Promise<boolean> {
  if (!passwordHash) return false;
  for (const candidate of KNOWN_DEFAULT_ADMIN_PASSWORDS) {
    try {
      if (await argon2.verify(passwordHash, candidate)) return true;
    } catch {
      return false;
    }
  }
  return false;
}

/** Satu tempat untuk memutuskan apakah respons login perlu membawa flag ganti password. */
export async function requiresPasswordChange(user: {
  role?: string | null;
  passwordHash?: string | null;
}): Promise<boolean> {
  if (!isPrivilegedRole(user.role)) return false;
  if (!user.passwordHash) return false;
  // Per akun, bukan per environment: admin yang sudah mengganti password tidak boleh terus
  // dipaksa mengganti hanya karena ADMIN_PASSWORD di server masih kosong.
  return isHashOfDefaultPassword(user.passwordHash);
}
