/**
 * Kehadiran agen dan indikator mengetik.
 *
 * Keduanya sengaja tidak menyentuh tabel database. Indikator mengetik adalah sinyal sesaat:
 * menyimpannya berarti tabel `chat_messages` menggelembung oleh data yang tidak berguna lagi
 * beberapa detik kemudian, dan riwayat pesan jadi bercampur dengan event yang bukan pesan.
 * Kehadiran agen juga bukan data bisnis, jadi tempatnya di Redis dengan masa berlaku, bukan di
 * Postgres. Efek sampingnya: kalau `getRedisClient()` diganti ke Redis asli, kehadiran otomatis
 * benar lintas instance tanpa perubahan kode di sini.
 *
 * Ambang yang dipakai mengikuti kebiasaan chat support:
 * - typing dianggap berhenti sendiri setelah 6 detik tanpa pembaruan, klien cukup menyembunyikan
 *   indikator saat `expiresAt` lewat;
 * - pengiriman event typing dibatasi satu per 3 detik per orang per percakapan, karena mengetik
 *   memicu event jauh lebih sering daripada mengirim pesan;
 * - agen dianggap `online` bila heartbeat terakhir di bawah 45 detik, `away` sampai 90 detik,
 *   dan hilang dari daftar setelah itu. Klien dianjurkan heartbeat tiap 30 detik.
 */

import { getRedisClient } from '../../config/redis.js';

export const TYPING_TTL_MS = 6_000;
export const TYPING_THROTTLE_MS = 3_000;
export const PRESENCE_AWAY_MS = 45_000;
export const PRESENCE_TTL_MS = 90_000;
export const PRESENCE_HEARTBEAT_MS = 30_000;

export type TypingState = 'start' | 'stop';
export type PresenceStatus = 'online' | 'away' | 'offline';

const ALL_KEY = 'chat:presence:all';
const branchKey = (branchId: string) => `chat:presence:branch:${branchId}`;
const actorKey = (userId: string) => `chat:presence:actor:${userId}`;

/** Menerima `start`, `stop`, atau nilai aneh dari klien tanpa melempar. Default `start`. */
export function normalizeTypingState(input: unknown): TypingState {
  const value = String(input ?? '').trim().toLowerCase();
  if (value === 'stop' || value === 'stopped' || value === 'end') return 'stop';
  return 'start';
}

/** Umur maksimal satu event typing sebelum klien boleh mengabaikannya. */
export function typingExpiry(now: number = Date.now()): string {
  return new Date(now + TYPING_TTL_MS).toISOString();
}

/**
 * Penjaga frekuensi event typing. Disimpan di memori proses karena isinya hanya timestamp
 * terakhir per orang per percakapan dan tidak perlu bertahan lintas restart. Kunci selalu
 * dibersihkan saat klien mengirim `stop` supaya mulai mengetik lagi langsung terkirim.
 */
export class TypingThrottle {
  private last = new Map<string, number>();

  shouldEmit(key: string, now: number = Date.now(), state: TypingState = 'start'): boolean {
    if (state === 'stop') {
      this.last.delete(key);
      return true;
    }
    const previous = this.last.get(key);
    if (previous !== undefined && now - previous < TYPING_THROTTLE_MS) {
      return false;
    }
    this.last.set(key, now);
    this.prune(now);
    return true;
  }

  reset(key: string) {
    this.last.delete(key);
  }

  get size(): number {
    return this.last.size;
  }

  private prune(now: number) {
    const limit = TYPING_TTL_MS * 10;
    for (const [key, at] of this.last) {
      if (now - at > limit) this.last.delete(key);
    }
  }
}

export const typingThrottle = new TypingThrottle();

/**
 * `online` untuk heartbeat segar, `away` untuk yang mulai menganggur, `offline` untuk yang
 * sudah lewat masa berlaku. Waktu di masa depan (jam klien meleset) diperlakukan `online`
 * daripada menghapus agen yang sebenarnya hadir.
 */
export function classifyPresence(lastSeenMs: number, now: number = Date.now()): PresenceStatus {
  if (!Number.isFinite(lastSeenMs) || lastSeenMs <= 0) return 'offline';
  const age = now - lastSeenMs;
  if (age < 0) return 'online';
  if (age <= PRESENCE_AWAY_MS) return 'online';
  if (age <= PRESENCE_TTL_MS) return 'away';
  return 'offline';
}

export interface PresenceActor {
  id: string;
  role: string;
  branchId?: string | null;
  label?: string | null;
}

export interface PresenceEntry {
  userId: string;
  role: string;
  branchId: string | null;
  label: string | null;
  status: Exclude<PresenceStatus, 'offline'>;
  lastSeenAt: string;
  lastSeenMs: number;
}

export interface PresenceSnapshot {
  agents: PresenceEntry[];
  summary: { online: number; away: number; total: number };
}

export const EMPTY_PRESENCE: PresenceSnapshot = { agents: [], summary: { online: 0, away: 0, total: 0 } };

/**
 * Menyembunyikan alamat email di balik label yang aman ditampilkan ke rekan satu cabang.
 * `budi@toko.id` menjadi `b***@toko.id`, dan nilai tanpa `@` dipotong tiga karakter.
 */
export function maskLabel(raw: string | null | undefined): string | null {
  const value = String(raw ?? '').trim();
  if (!value) return null;
  const at = value.indexOf('@');
  if (at <= 0) {
    return value.length <= 3 ? '***' : `${value.slice(0, 3)}***`;
  }
  const name = value.slice(0, at);
  const domain = value.slice(at);
  const head = name.slice(0, 1);
  return `${head}***${domain}`;
}

function parseMeta(raw: Record<string, string> | null | undefined, now: number): PresenceEntry | null {
  if (!raw || !raw.userId) return null;
  const lastSeenMs = Number(raw.lastSeenMs ?? 0);
  const status = classifyPresence(lastSeenMs, now);
  if (status === 'offline') return null;
  return {
    userId: raw.userId,
    role: raw.role || 'admin',
    branchId: raw.branchId ? raw.branchId : null,
    label: raw.label ? raw.label : null,
    status,
    lastSeenAt: new Date(lastSeenMs).toISOString(),
    lastSeenMs,
  };
}

/**
 * Mencatat satu denyut dan mengembalikan status sebelumnya, supaya pemanggil bisa menyiarkan
 * event `presence` hanya saat status benar-benar berubah, bukan tiap 30 detik.
 */
export async function recordHeartbeat(
  actor: PresenceActor,
  now: number = Date.now()
): Promise<{ entry: PresenceEntry; previousStatus: PresenceStatus }> {
  const client = getRedisClient();

  const previousRaw = await client.zscore(ALL_KEY, actor.id);
  const previousStatus = previousRaw === null || previousRaw === undefined
    ? 'offline'
    : classifyPresence(Number(previousRaw), now);

  await client.zadd(ALL_KEY, now, actor.id);
  if (actor.branchId) {
    await client.zadd(branchKey(actor.branchId), now, actor.id);
  }
  await client.hset(actorKey(actor.id), {
    userId: actor.id,
    role: actor.role,
    branchId: actor.branchId ?? '',
    label: actor.label ?? '',
    lastSeenMs: String(now),
  });
  // Metadata boleh hilang sedikit lebih lambat daripada skor, tapi tidak boleh selamanya.
  await client.expire(actorKey(actor.id), Math.ceil(PRESENCE_TTL_MS / 1000) + 30);

  return {
    entry: {
      userId: actor.id,
      role: actor.role,
      branchId: actor.branchId ?? null,
      label: actor.label ?? null,
      status: 'online',
      lastSeenAt: new Date(now).toISOString(),
      lastSeenMs: now,
    },
    previousStatus,
  };
}

/** Menghapus kehadiran segera, dipakai saat stream SSE ditutup atau agen logout. */
export async function markOffline(actor: { id: string; branchId?: string | null }): Promise<void> {
  const client = getRedisClient();
  await client.zrem(ALL_KEY, actor.id);
  if (actor.branchId) {
    await client.zrem(branchKey(actor.branchId), actor.id);
  }
  await client.del(actorKey(actor.id));
}

/**
 * Daftar agen yang masih hadir. `branchIds` null berarti seluruh cabang (admin pusat).
 * Entri kedaluwarsa dibersihkan saat dibaca, jadi tidak perlu job pembersih terpisah, dan
 * tidak ada pemindaian `KEYS` yang memblokir Redis di produksi.
 */
export async function listPresence(options: {
  branchIds?: string[] | null;
  now?: number;
} = {}): Promise<PresenceSnapshot> {
  const client = getRedisClient();
  const now = options.now ?? Date.now();
  const cutoff = now - PRESENCE_TTL_MS;

  const keys: string[] = [];
  if (options.branchIds === null || options.branchIds === undefined) {
    keys.push(ALL_KEY);
  } else {
    for (const branchId of options.branchIds) {
      if (branchId) keys.push(branchKey(branchId));
    }
  }
  if (keys.length === 0) return EMPTY_PRESENCE;

  const ids = new Set<string>();
  for (const key of keys) {
    await client.zremrangebyscore(key, '-inf', cutoff - 1);
    const members = await client.zrangebyscore(key, cutoff, '+inf');
    for (const member of members) ids.add(String(member));
  }

  const agents: PresenceEntry[] = [];
  for (const id of ids) {
    const meta = await client.hgetall(actorKey(id));
    const entry = parseMeta(meta as Record<string, string> | null, now);
    if (!entry) continue;
    if (options.branchIds && entry.branchId && !options.branchIds.includes(entry.branchId)) continue;
    agents.push(entry);
  }

  agents.sort((a, b) => {
    if (a.status !== b.status) return a.status === 'online' ? -1 : 1;
    const left = a.label ?? a.userId;
    const right = b.label ?? b.userId;
    return left.localeCompare(right);
  });

  const online = agents.filter((agent) => agent.status === 'online').length;
  return {
    agents,
    summary: { online, away: agents.length - online, total: agents.length },
  };
}
