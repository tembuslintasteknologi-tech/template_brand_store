/**
 * Kebijakan abandoned cart.
 *
 * Semua aturan di sini murni fungsi supaya bisa diuji tanpa database dan tanpa jam sistem.
 * Yang penting bukan sekadar "kapan cart dianggap abandoned", tapi juga kapan reminder boleh
 * dikirim lagi: tanpa cooldown, satu cart yang sama bisa memicu email setiap kali scanner
 * berjalan, dan itu yang membuat pelanggan berhenti membuka email brand.
 */

export interface AbandonmentPolicy {
  enabled: boolean;
  /** Menit tanpa aktivitas sebelum cart dianggap ditinggalkan. */
  idleMinutes: number;
  /** Batas jumlah reminder per cart, dihitung sejak cart terakhir aktif. */
  maxReminders: number;
  /** Jarak minimum antar reminder pada cart yang sama. */
  reminderCooldownMinutes: number;
  /** Umur token recovery sejak dibuat. */
  recoveryTtlHours: number;
}

export const DEFAULT_ABANDONMENT_POLICY: AbandonmentPolicy = {
  enabled: true,
  idleMinutes: 60,
  maxReminders: 2,
  reminderCooldownMinutes: 1440,
  recoveryTtlHours: 72,
};

const LIMITS = {
  idleMinutes: { min: 5, max: 20160 },
  maxReminders: { min: 0, max: 10 },
  reminderCooldownMinutes: { min: 15, max: 20160 },
  recoveryTtlHours: { min: 1, max: 720 },
};

function clampInt(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  const floored = Math.floor(parsed);
  if (floored < min) return min;
  if (floored > max) return max;
  return floored;
}

/**
 * Menerima JSON dari `settings['cart.abandonment']`. Nilai rusak tidak melempar error: scanner
 * yang berjalan tiap beberapa menit tidak boleh mati hanya karena satu field salah ketik.
 */
export function resolveAbandonmentPolicy(raw: unknown): AbandonmentPolicy {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_ABANDONMENT_POLICY };
  const record = raw as Record<string, unknown>;

  return {
    enabled: record.enabled === undefined ? DEFAULT_ABANDONMENT_POLICY.enabled : record.enabled === true,
    idleMinutes: clampInt(
      record.idleMinutes,
      DEFAULT_ABANDONMENT_POLICY.idleMinutes,
      LIMITS.idleMinutes.min,
      LIMITS.idleMinutes.max
    ),
    maxReminders: clampInt(
      record.maxReminders,
      DEFAULT_ABANDONMENT_POLICY.maxReminders,
      LIMITS.maxReminders.min,
      LIMITS.maxReminders.max
    ),
    reminderCooldownMinutes: clampInt(
      record.reminderCooldownMinutes,
      DEFAULT_ABANDONMENT_POLICY.reminderCooldownMinutes,
      LIMITS.reminderCooldownMinutes.min,
      LIMITS.reminderCooldownMinutes.max
    ),
    recoveryTtlHours: clampInt(
      record.recoveryTtlHours,
      DEFAULT_ABANDONMENT_POLICY.recoveryTtlHours,
      LIMITS.recoveryTtlHours.min,
      LIMITS.recoveryTtlHours.max
    ),
  };
}

export type RecoveryState =
  | 'active'
  | 'reminder_due'
  | 'reminded'
  | 'exhausted'
  | 'converted'
  | 'recovered';

export interface CartSnapshot {
  status?: string | null;
  lastActivityAt?: Date | string | null;
  reminderSentAt?: Date | string | null;
  reminderCount?: number | null;
  recoveredAt?: Date | string | null;
  itemCount?: number | null;
}

function toTime(value: Date | string | null | undefined): number | null {
  if (!value) return null;
  const time = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isNaN(time) ? null : time;
}

const MINUTE_MS = 60_000;

/** Cart yang sudah checkout atau sudah di-recover tidak pernah masuk hitungan abandoned. */
export function isAbandoned(cart: CartSnapshot, policy: AbandonmentPolicy, now: Date = new Date()): boolean {
  if (!policy.enabled) return false;
  if (cart.status === 'converted' || cart.status === 'abandoned') return cart.status === 'abandoned';
  if (cart.recoveredAt) return false;

  const last = toTime(cart.lastActivityAt);
  if (last === null) return false;

  return now.getTime() - last >= policy.idleMinutes * MINUTE_MS;
}

export function classifyCartForRecovery(
  cart: CartSnapshot,
  policy: AbandonmentPolicy,
  now: Date = new Date()
): RecoveryState {
  if (cart.status === 'converted') return 'converted';
  if (cart.recoveredAt) return 'recovered';
  if (!policy.enabled) return 'active';
  if ((cart.itemCount ?? null) !== null && (cart.itemCount as number) <= 0) return 'active';

  const last = toTime(cart.lastActivityAt);
  if (last === null) return 'active';

  const idleFor = now.getTime() - last;
  if (idleFor < policy.idleMinutes * MINUTE_MS) return 'active';

  const sentAt = toTime(cart.reminderSentAt);
  const sentCount = Number(cart.reminderCount ?? 0);

  if (sentCount >= policy.maxReminders) return 'exhausted';
  if (sentAt === null) return 'reminder_due';

  const sinceLast = now.getTime() - sentAt;
  if (sinceLast >= policy.reminderCooldownMinutes * MINUTE_MS) return 'reminder_due';

  return 'reminded';
}

export interface RecoverySummary {
  total: number;
  active: number;
  reminderDue: number;
  reminded: number;
  exhausted: number;
  converted: number;
  recovered: number;
}

export function summarizeRecovery(
  carts: Array<CartSnapshot & { id?: string }>,
  policy: AbandonmentPolicy,
  now: Date = new Date()
): RecoverySummary {
  const summary: RecoverySummary = {
    total: carts.length,
    active: 0,
    reminderDue: 0,
    reminded: 0,
    exhausted: 0,
    converted: 0,
    recovered: 0,
  };

  const bucket: Record<RecoveryState, keyof RecoverySummary> = {
    active: 'active',
    reminder_due: 'reminderDue',
    reminded: 'reminded',
    exhausted: 'exhausted',
    converted: 'converted',
    recovered: 'recovered',
  };

  for (const cart of carts) {
    summary[bucket[classifyCartForRecovery(cart, policy, now)]] += 1;
  }

  return summary;
}

/** Link yang dikirim ke pelanggan. Token selalu di-encode supaya karakter base64url aman. */
export function buildRecoveryLink(baseUrl: string, token: string): string {
  const base = String(baseUrl ?? '').trim().replace(/\/+$/, '');
  if (!base) {
    throw new Error('Base URL untuk link recovery belum diisi');
  }
  if (!token) {
    throw new Error('Token recovery kosong');
  }
  return `${base}/cart/recover/${encodeURIComponent(token)}`;
}

export function isRecoveryTokenExpired(
  createdAt: Date | string | null | undefined,
  policy: AbandonmentPolicy,
  now: Date = new Date()
): boolean {
  const created = toTime(createdAt);
  if (created === null) return true;
  return now.getTime() - created > policy.recoveryTtlHours * 3_600_000;
}
