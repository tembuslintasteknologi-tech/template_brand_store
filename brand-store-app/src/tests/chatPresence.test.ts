import test from 'node:test';
import assert from 'node:assert';

import server from '../index.js';
import { getRedisClient } from '../config/redis.js';
import {
  EMPTY_PRESENCE,
  PRESENCE_AWAY_MS,
  PRESENCE_TTL_MS,
  TYPING_THROTTLE_MS,
  TypingThrottle,
  classifyPresence,
  listPresence,
  markOffline,
  maskLabel,
  normalizeTypingState,
  recordHeartbeat,
  typingExpiry,
} from '../services/chat/chatPresence.js';
import { realtimeHub } from '../services/realtime/realtimeService.js';

async function resetRedis() {
  const client = getRedisClient();
  await client.flushall();
}

let ipSeed = 0;
function ip(): string {
  ipSeed += 1;
  return `10.88.${Math.floor(ipSeed / 250)}.${(ipSeed % 250) + 1}`;
}

async function call(method: string, path: string) {
  return server.fetch(
    new Request(`http://local${path}`, { method, headers: { 'x-forwarded-for': ip() } })
  );
}

test('classifyPresence memakai ambang online, away, dan offline yang tetap', () => {
  const now = 1_700_000_000_000;

  assert.strictEqual(classifyPresence(now, now), 'online');
  assert.strictEqual(classifyPresence(now - PRESENCE_AWAY_MS, now), 'online');
  assert.strictEqual(classifyPresence(now - PRESENCE_AWAY_MS - 1, now), 'away');
  assert.strictEqual(classifyPresence(now - PRESENCE_TTL_MS, now), 'away');
  assert.strictEqual(classifyPresence(now - PRESENCE_TTL_MS - 1, now), 'offline');
});

test('classifyPresence tidak menghukum jam klien yang meleset ke depan', () => {
  const now = 1_700_000_000_000;
  assert.strictEqual(classifyPresence(now + 5 * 60_000, now), 'online');
});

test('classifyPresence menganggap nilai tidak masuk akal sebagai offline', () => {
  assert.strictEqual(classifyPresence(Number.NaN), 'offline');
  assert.strictEqual(classifyPresence(0), 'offline');
  assert.strictEqual(classifyPresence(-5), 'offline');
  assert.strictEqual(classifyPresence(Number.POSITIVE_INFINITY), 'offline');
});

test('normalizeTypingState menerima variasi stop dan default ke start', () => {
  assert.strictEqual(normalizeTypingState('start'), 'start');
  assert.strictEqual(normalizeTypingState('typing'), 'start');
  assert.strictEqual(normalizeTypingState(undefined), 'start');
  assert.strictEqual(normalizeTypingState(null), 'start');
  assert.strictEqual(normalizeTypingState('stop'), 'stop');
  assert.strictEqual(normalizeTypingState('STOPPED'), 'stop');
  assert.strictEqual(normalizeTypingState(' end '), 'stop');
});

test('typingExpiry memberi umur singkat yang bisa dihitung klien', () => {
  const now = 1_700_000_000_000;
  const expiresAt = typingExpiry(now);
  assert.strictEqual(new Date(expiresAt).getTime() - now, 6_000);
});

test('TypingThrottle menahan start berulang tapi selalu meloloskan stop', () => {
  const throttle = new TypingThrottle();
  const key = 'typing:conversation:user';
  const now = 1_700_000_000_000;

  assert.strictEqual(throttle.shouldEmit(key, now, 'start'), true);
  assert.strictEqual(throttle.shouldEmit(key, now + 500, 'start'), false);
  assert.strictEqual(throttle.shouldEmit(key, now + TYPING_THROTTLE_MS - 1, 'start'), false);

  assert.strictEqual(throttle.shouldEmit(key, now + TYPING_THROTTLE_MS, 'start'), true);
  assert.strictEqual(throttle.shouldEmit(key, now + TYPING_THROTTLE_MS + 10, 'stop'), true);

  // Stop membuang kunci, jadi mulai mengetik lagi langsung terkirim.
  assert.strictEqual(throttle.shouldEmit(key, now + TYPING_THROTTLE_MS + 20, 'start'), true);
});

test('TypingThrottle memisahkan kunci per percakapan dan per orang', () => {
  const throttle = new TypingThrottle();
  const now = 1_700_000_000_000;

  assert.strictEqual(throttle.shouldEmit('a', now, 'start'), true);
  assert.strictEqual(throttle.shouldEmit('b', now, 'start'), true, 'orang lain tidak boleh tertahan');
  assert.strictEqual(throttle.shouldEmit('a', now, 'start'), false);
});

test('maskLabel menyembunyikan bagian lokal alamat email', () => {
  assert.strictEqual(maskLabel('budi@toko.id'), 'b***@toko.id');
  assert.strictEqual(maskLabel('a@x.id'), 'a***@x.id');
  assert.strictEqual(maskLabel('nama-panjang@contoh.co.id'), 'n***@contoh.co.id');
  assert.strictEqual(maskLabel('  '), null);
  assert.strictEqual(maskLabel(null), null);
  assert.strictEqual(maskLabel(undefined), null);
  assert.strictEqual(maskLabel('tanpaemail'), 'tan***');
  assert.strictEqual(maskLabel('ab'), '***');
});

test('recordHeartbeat mencatat agen lalu listPresence melihatnya online', async () => {
  await resetRedis();
  const now = 1_700_000_000_000;

  const first = await recordHeartbeat({ id: 'agent-1', role: 'admin', branchId: null, label: 'a***@toko.id' }, now);
  assert.strictEqual(first.previousStatus, 'offline');
  assert.strictEqual(first.entry.status, 'online');

  const second = await recordHeartbeat({ id: 'agent-1', role: 'admin', branchId: null, label: 'a***@toko.id' }, now + 30_000);
  assert.strictEqual(second.previousStatus, 'online', 'denyut kedua tidak mengubah status');

  const snapshot = await listPresence({ now: now + 30_000 });
  assert.strictEqual(snapshot.summary.total, 1);
  assert.strictEqual(snapshot.summary.online, 1);
  assert.strictEqual(snapshot.summary.away, 0);
  assert.deepStrictEqual(snapshot.agents[0], {
    userId: 'agent-1',
    role: 'admin',
    branchId: null,
    label: 'a***@toko.id',
    status: 'online',
    lastSeenAt: new Date(now + 30_000).toISOString(),
    lastSeenMs: now + 30_000,
  });
});

test('listPresence memangkas agen yang sudah lewat masa berlaku tanpa job terpisah', async () => {
  await resetRedis();
  const now = 1_700_000_000_000;

  await recordHeartbeat({ id: 'agent-basi', role: 'admin', branchId: null }, now);
  const snapshot = await listPresence({ now: now + PRESENCE_TTL_MS + 1 });

  assert.strictEqual(snapshot.summary.total, 0);
  assert.deepStrictEqual(snapshot.agents, []);
});

test('listPresence menandai agen yang menganggur sebagai away', async () => {
  await resetRedis();
  const now = 1_700_000_000_000;

  await recordHeartbeat({ id: 'agent-away', role: 'branch_admin', branchId: 'br-1' }, now);
  const snapshot = await listPresence({ now: now + PRESENCE_AWAY_MS + 5_000 });

  assert.strictEqual(snapshot.summary.online, 0);
  assert.strictEqual(snapshot.summary.away, 1);
  assert.strictEqual(snapshot.agents[0].status, 'away');
});

test('listPresence hanya mengembalikan agen dari cabang yang diminta', async () => {
  await resetRedis();
  const now = 1_700_000_000_000;

  await recordHeartbeat({ id: 'agent-bandung', role: 'branch_admin', branchId: 'br-bandung' }, now);
  await recordHeartbeat({ id: 'agent-medan', role: 'branch_admin', branchId: 'br-medan' }, now);
  await recordHeartbeat({ id: 'agent-pusat', role: 'admin', branchId: null }, now);

  const bandung = await listPresence({ branchIds: ['br-bandung'], now });
  assert.deepStrictEqual(bandung.agents.map((agent) => agent.userId), ['agent-bandung']);

  const semua = await listPresence({ now });
  assert.strictEqual(semua.summary.total, 3, 'admin pusat melihat semua agen');

  const kosong = await listPresence({ branchIds: [], now });
  assert.deepStrictEqual(kosong, EMPTY_PRESENCE);
});

test('listPresence mengurutkan online lebih dulu lalu label', async () => {
  await resetRedis();
  const now = 1_700_000_000_000;

  await recordHeartbeat({ id: 'agent-z', role: 'admin', branchId: null, label: 'z***@toko.id' }, now);
  await recordHeartbeat({ id: 'agent-a', role: 'admin', branchId: null, label: 'a***@toko.id' }, now);
  await recordHeartbeat({ id: 'agent-away', role: 'admin', branchId: null, label: 'm***@toko.id' }, now - PRESENCE_AWAY_MS - 1);

  const snapshot = await listPresence({ now });
  assert.deepStrictEqual(
    snapshot.agents.map((agent) => agent.userId),
    ['agent-a', 'agent-z', 'agent-away']
  );
});

test('markOffline menghapus agen dari daftar seketika', async () => {
  await resetRedis();
  const now = 1_700_000_000_000;

  await recordHeartbeat({ id: 'agent-pergi', role: 'branch_admin', branchId: 'br-1' }, now);
  await markOffline({ id: 'agent-pergi', branchId: 'br-1' });

  const snapshot = await listPresence({ branchIds: ['br-1'], now });
  assert.deepStrictEqual(snapshot, EMPTY_PRESENCE);
});

test('broadcastTyping pelanggan tidak di-echo ke kanal pelanggan sendiri', () => {
  const seen: Array<{ channel: string; payload: any }> = [];
  const channels = ['chat:user:cust-1', 'chat:branch:br-1', 'chat:admin'];
  const listeners = new Map<string, (payload: any) => void>();
  for (const channel of channels) {
    const listener = (payload: any) => seen.push({ channel, payload });
    listeners.set(channel, listener);
    realtimeHub.on(channel, listener);
  }

  try {
    realtimeHub.broadcastTyping({
      conversationId: 'conv-1',
      branchId: 'br-1',
      actorId: 'cust-1',
      actorRole: 'customer',
      state: 'start',
      expiresAt: '2026-01-01T00:00:06.000Z',
    });
  } finally {
    for (const channel of channels) realtimeHub.off(channel, listeners.get(channel)!);
  }

  assert.deepStrictEqual(
    seen.map((entry) => entry.channel),
    ['chat:branch:br-1', 'chat:admin']
  );
  for (const entry of seen) {
    assert.strictEqual(entry.payload.event, 'typing');
    assert.strictEqual(entry.payload.typingState, 'start');
    assert.strictEqual(entry.payload.actorId, 'cust-1');
    assert.strictEqual(entry.payload.actorRole, 'customer');
    assert.strictEqual(entry.payload.body, undefined, 'indikator mengetik tidak membawa isi pesan');
  }
});

test('broadcastTyping staf sampai ke pelanggan, cabang, dan admin', () => {
  const hadir: string[] = [];
  const channels = ['chat:user:cust-1', 'chat:branch:br-1', 'chat:admin'];
  const listeners = new Map<string, () => void>();
  for (const channel of channels) {
    const listener = () => hadir.push(channel);
    listeners.set(channel, listener);
    realtimeHub.on(channel, listener);
  }

  try {
    realtimeHub.broadcastTyping({
      conversationId: 'conv-1',
      branchId: 'br-1',
      userId: 'cust-1',
      actorId: 'agent-1',
      actorRole: 'branch_admin',
      state: 'stop',
      expiresAt: null,
    });
  } finally {
    for (const channel of channels) realtimeHub.off(channel, listeners.get(channel)!);
  }

  assert.deepStrictEqual(hadir, ['chat:user:cust-1', 'chat:branch:br-1', 'chat:admin']);
});

test('broadcastPresence membawa cabang supaya filter admin bekerja', () => {
  const seen: Array<{ channel: string; payload: any }> = [];
  const channels = ['chat:branch:br-1', 'chat:admin'];
  const listeners = new Map<string, (payload: any) => void>();
  for (const channel of channels) {
    const listener = (payload: any) => seen.push({ channel, payload });
    listeners.set(channel, listener);
    realtimeHub.on(channel, listener);
  }

  try {
    realtimeHub.broadcastPresence({
      branchId: 'br-1',
      userId: 'agent-1',
      role: 'branch_admin',
      label: 'a***@toko.id',
      status: 'online',
      lastSeenAt: '2026-01-01T00:00:00.000Z',
    });
  } finally {
    for (const channel of channels) realtimeHub.off(channel, listeners.get(channel)!);
  }

  assert.deepStrictEqual(seen.map((entry) => entry.channel), ['chat:branch:br-1', 'chat:admin']);
  assert.strictEqual(seen[0].payload.event, 'presence');
  assert.strictEqual(seen[0].payload.branchId, 'br-1');
  assert.strictEqual(seen[0].payload.status, 'online');
});

test('rute typing dan presence menolak permintaan tanpa token', async () => {
  const cases: Array<[string, string]> = [
    ['POST', '/api/v1/chat/conversations/conv-1/typing'],
    ['POST', '/api/v1/admin/chat/conversations/conv-1/typing'],
    ['POST', '/api/v1/admin/chat/heartbeat'],
    ['GET', '/api/v1/admin/chat/presence'],
    ['DELETE', '/api/v1/admin/chat/presence'],
  ];

  for (const [method, path] of cases) {
    const response = await call(method, path);
    assert.strictEqual(response.status, 401, `${method} ${path} harus butuh auth`);
  }
});
