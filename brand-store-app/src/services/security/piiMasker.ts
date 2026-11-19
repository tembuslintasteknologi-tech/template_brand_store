/**
 * Redaksi PII untuk log dan tampilan admin.
 *
 * Log aplikasi tidak boleh menjadi salinan database. Email, nomor HP, NIK, nomor kartu, dan
 * parameter sensitif (token, password, OTP) di query string harus ditutup sebelum keluar ke
 * stdout, karena stdout biasanya dikirim ke log aggregator pihak ketiga dan retensinya panjang.
 *
 * Fungsi di file ini murni (tanpa I/O) supaya bisa diuji tanpa database maupun Redis.
 */

export const MASK = '***';

/** Key yang nilainya tidak pernah boleh tercetak apa adanya. */
export const SENSITIVE_KEYS = new Set([
  'password',
  'pass',
  'passwd',
  'new_password',
  'current_password',
  'password_hash',
  'token',
  'access_token',
  'refresh_token',
  'authorization',
  'api_key',
  'apikey',
  'secret',
  'client_secret',
  'otp',
  'code',
  'recovery_code',
  'nik',
  'ktp',
  'email',
  'phone',
  'phone_number',
  'no_hp',
  'card',
  'card_number',
  'cvv',
  'cvc',
]);

const EMAIL_RE = /([A-Za-z0-9])[A-Za-z0-9._%+-]*@([A-Za-z0-9.-]+\.[A-Za-z]{2,})/g;
const PHONE_RE = /(?:\+62|62|0)8[1-9][0-9]{6,10}/g;
const CARD_RE = /\b(?:\d{4}[ -]?){3}\d{3,4}\b/g;

function keepEdges(value: string, head: number, tail: number): string {
  if (value.length <= head + tail) return '*'.repeat(value.length || 1);
  return `${value.slice(0, head)}${'*'.repeat(value.length - head - tail)}${value.slice(-tail)}`;
}

/** `budi.santoso@example.com` menjadi `b***@example.com`. */
export function maskEmail(value: string): string {
  return String(value).replace(EMAIL_RE, (_match, first: string, domain: string) => {
    return `${first}${MASK}@${domain}`;
  });
}

/** `+6281234567890` menjadi `+628*******890`. */
export function maskPhone(value: string): string {
  return String(value).replace(PHONE_RE, (match) => keepEdges(match, 4, 3));
}

/** NIK dan nomor kartu dipertahankan empat digit terakhir agar masih bisa dicocokkan manual. */
export function maskCardLike(value: string): string {
  return String(value).replace(CARD_RE, (match) => {
    const digits = match.replace(/[^0-9]/g, '');
    if (digits.length < 13) return match;
    return `${'*'.repeat(digits.length - 4)}${digits.slice(-4)}`;
  });
}

/** Masker gabungan untuk teks bebas (pesan log, pesan error, potongan body). */
export function maskPii(value: string): string {
  const input = String(value ?? '');
  if (!input) return input;
  return maskPhone(maskEmail(maskCardLike(input)));
}

/** Alamat IP dimasking pada oktet/segmen terakhir, cukup untuk korelasi tanpa menyimpan identitas penuh. */
export function maskIpAddress(value: string): string {
  const input = String(value ?? '').trim();
  if (!input) return input;
  if (input.includes(':')) {
    const parts = input.split(':');
    for (let index = parts.length - 1; index >= 0; index -= 1) {
      if (parts[index]) {
        parts[index] = '****';
        return parts.join(':');
      }
    }
    return input;
  }
  const octets = input.split('.');
  if (octets.length !== 4) return input;
  return `${octets.slice(0, 3).join('.')}.***`;
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value.replace(/\+/g, ' '));
  } catch {
    return value;
  }
}

function isSensitiveKey(key: string): boolean {
  const normalized = key.toLowerCase().replace(/[-.]/g, '_');
  if (SENSITIVE_KEYS.has(normalized)) return true;
  return /(token|secret|password|otp|api_?key)/.test(normalized);
}

/**
 * Redaksi URL untuk log HTTP.
 *
 * Path tetap utuh supaya statistik route masih berguna, sementara nilai query yang sensitif
 * diganti `***`. Nilai yang tidak sensitif tetap dimasking kalau bentuknya PII (misalnya
 * `?search=budi@example.com`).
 */
export function redactUrl(rawUrl: string): string {
  const raw = String(rawUrl ?? '');
  if (!raw) return raw;

  const queryIndex = raw.indexOf('?');
  const path = queryIndex === -1 ? raw : raw.slice(0, queryIndex);
  const query = queryIndex === -1 ? '' : raw.slice(queryIndex + 1);
  const maskedPath = maskPii(path);

  if (!query) return maskedPath;

  const pairs = query
    .split('&')
    .filter((pair) => pair.length > 0)
    .map((pair) => {
      const equals = pair.indexOf('=');
      const key = equals === -1 ? pair : pair.slice(0, equals);
      if (isSensitiveKey(safeDecode(key))) return `${key}=${MASK}`;
      if (equals === -1) return key;
      const value = pair.slice(equals + 1);
      return `${key}=${maskPii(safeDecode(value))}`;
    });

  return pairs.length > 0 ? `${maskedPath}?${pairs.join('&')}` : maskedPath;
}

/** Menyaring metadata log secara rekursif dengan batas kedalaman supaya objek siklik tidak menggantung. */
export function sanitizeLogMeta(meta: unknown, depth = 0): unknown {
  if (meta === null || meta === undefined) return meta;
  if (typeof meta === 'string') return maskPii(meta);
  if (typeof meta === 'number' || typeof meta === 'boolean') return meta;
  if (meta instanceof Error) {
    return { name: meta.name, message: maskPii(meta.message) };
  }
  if (depth >= 4) return '[truncated]';
  if (Array.isArray(meta)) {
    return meta.slice(0, 50).map((entry) => sanitizeLogMeta(entry, depth + 1));
  }
  if (typeof meta === 'object') {
    const output: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(meta as Record<string, unknown>)) {
      output[key] = isSensitiveKey(key) ? MASK : sanitizeLogMeta(value, depth + 1);
    }
    return output;
  }
  return meta;
}
