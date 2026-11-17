import test from 'node:test';
import assert from 'node:assert';
import {
  DEFAULT_ABANDONMENT_POLICY,
  buildRecoveryLink,
  classifyCartForRecovery,
  isAbandoned,
  isRecoveryTokenExpired,
  resolveAbandonmentPolicy,
  summarizeRecovery,
  type AbandonmentPolicy,
} from '../services/cart/cartRecoveryService.js';

const NOW = new Date('2026-11-16T10:00:00Z');
const MINUTE = 60_000;

function minutesAgo(minutes: number): Date {
  return new Date(NOW.getTime() - minutes * MINUTE);
}

const policy: AbandonmentPolicy = { ...DEFAULT_ABANDONMENT_POLICY, idleMinutes: 60, maxReminders: 2, reminderCooldownMinutes: 1440 };

test('resolveAbandonmentPolicy keeps defaults for missing or unusable input', () => {
  assert.deepStrictEqual(resolveAbandonmentPolicy(null), DEFAULT_ABANDONMENT_POLICY);
  assert.deepStrictEqual(resolveAbandonmentPolicy('bukan objek'), DEFAULT_ABANDONMENT_POLICY);
  assert.deepStrictEqual(resolveAbandonmentPolicy({}), DEFAULT_ABANDONMENT_POLICY);

  const fromStrings = resolveAbandonmentPolicy({ idleMinutes: 'abc', maxReminders: 'juga salah' });
  assert.strictEqual(fromStrings.idleMinutes, DEFAULT_ABANDONMENT_POLICY.idleMinutes);
  assert.strictEqual(fromStrings.maxReminders, DEFAULT_ABANDONMENT_POLICY.maxReminders);
});

test('resolveAbandonmentPolicy clamps numbers into a workable range', () => {
  const tiny = resolveAbandonmentPolicy({
    idleMinutes: 1,
    maxReminders: -4,
    reminderCooldownMinutes: 1,
    recoveryTtlHours: 0,
  });
  assert.strictEqual(tiny.idleMinutes, 5);
  assert.strictEqual(tiny.maxReminders, 0);
  assert.strictEqual(tiny.reminderCooldownMinutes, 15);
  assert.strictEqual(tiny.recoveryTtlHours, 1);

  const huge = resolveAbandonmentPolicy({
    idleMinutes: 999_999,
    maxReminders: 500,
    reminderCooldownMinutes: 999_999,
    recoveryTtlHours: 99_999,
  });
  assert.strictEqual(huge.idleMinutes, 20160);
  assert.strictEqual(huge.maxReminders, 10);
  assert.strictEqual(huge.reminderCooldownMinutes, 20160);
  assert.strictEqual(huge.recoveryTtlHours, 720);
});

test('resolveAbandonmentPolicy accepts numeric strings and floors decimals', () => {
  const resolved = resolveAbandonmentPolicy({
    idleMinutes: '90',
    maxReminders: 2.9,
    reminderCooldownMinutes: '120',
    recoveryTtlHours: 48.5,
  });

  assert.strictEqual(resolved.idleMinutes, 90);
  assert.strictEqual(resolved.maxReminders, 2);
  assert.strictEqual(resolved.reminderCooldownMinutes, 120);
  assert.strictEqual(resolved.recoveryTtlHours, 48);
});

test('resolveAbandonmentPolicy only treats an explicit false as disabled', () => {
  assert.strictEqual(resolveAbandonmentPolicy({ enabled: false }).enabled, false);
  assert.strictEqual(resolveAbandonmentPolicy({ enabled: true }).enabled, true);
  assert.strictEqual(resolveAbandonmentPolicy({ enabled: 'false' }).enabled, false);
  assert.strictEqual(resolveAbandonmentPolicy({}).enabled, true);
});

test('isAbandoned requires idle time, an owner, and no conversion', () => {
  assert.strictEqual(isAbandoned({ lastActivityAt: minutesAgo(59) }, policy, NOW), false);
  assert.strictEqual(isAbandoned({ lastActivityAt: minutesAgo(60) }, policy, NOW), true);
  assert.strictEqual(isAbandoned({ lastActivityAt: minutesAgo(600) }, policy, NOW), true);

  assert.strictEqual(isAbandoned({ lastActivityAt: minutesAgo(600), status: 'converted' }, policy, NOW), false);
  assert.strictEqual(isAbandoned({ lastActivityAt: minutesAgo(600), status: 'abandoned' }, policy, NOW), true);
  assert.strictEqual(isAbandoned({ lastActivityAt: minutesAgo(600), recoveredAt: minutesAgo(10) }, policy, NOW), false);
  assert.strictEqual(isAbandoned({ lastActivityAt: null }, policy, NOW), false);
  assert.strictEqual(isAbandoned({ lastActivityAt: 'bukan tanggal' }, policy, NOW), false);
});

test('isAbandoned is inert when the program is disabled', () => {
  const disabled = { ...policy, enabled: false };
  assert.strictEqual(isAbandoned({ lastActivityAt: minutesAgo(10_000) }, disabled, NOW), false);
});

test('classifyCartForRecovery marks fresh carts as active', () => {
  assert.strictEqual(classifyCartForRecovery({ lastActivityAt: minutesAgo(5) }, policy, NOW), 'active');
  assert.strictEqual(classifyCartForRecovery({ lastActivityAt: minutesAgo(59) }, policy, NOW), 'active');
});

test('classifyCartForRecovery ignores carts that are empty or already finished', () => {
  assert.strictEqual(classifyCartForRecovery({ status: 'converted', lastActivityAt: minutesAgo(600) }, policy, NOW), 'converted');
  assert.strictEqual(
    classifyCartForRecovery({ recoveredAt: minutesAgo(5), lastActivityAt: minutesAgo(600) }, policy, NOW),
    'recovered'
  );
  assert.strictEqual(classifyCartForRecovery({ itemCount: 0, lastActivityAt: minutesAgo(600) }, policy, NOW), 'active');
  assert.strictEqual(classifyCartForRecovery({ lastActivityAt: null }, policy, NOW), 'active');
});

test('classifyCartForRecovery queues a reminder once the idle threshold passes', () => {
  assert.strictEqual(
    classifyCartForRecovery({ lastActivityAt: minutesAgo(60), reminderCount: 0 }, policy, NOW),
    'reminder_due'
  );
  assert.strictEqual(
    classifyCartForRecovery({ lastActivityAt: minutesAgo(60), reminderCount: 0, itemCount: 3 }, policy, NOW),
    'reminder_due'
  );
});

test('classifyCartForRecovery respects the reminder cooldown', () => {
  const reminded = classifyCartForRecovery(
    { lastActivityAt: minutesAgo(600), reminderCount: 1, reminderSentAt: minutesAgo(60) },
    policy,
    NOW
  );
  assert.strictEqual(reminded, 'reminded');

  const dueAgain = classifyCartForRecovery(
    { lastActivityAt: minutesAgo(3000), reminderCount: 1, reminderSentAt: minutesAgo(1440) },
    policy,
    NOW
  );
  assert.strictEqual(dueAgain, 'reminder_due');
});

test('classifyCartForRecovery stops after maxReminders', () => {
  const exhausted = classifyCartForRecovery(
    { lastActivityAt: minutesAgo(10_000), reminderCount: 2, reminderSentAt: minutesAgo(5000) },
    policy,
    NOW
  );
  assert.strictEqual(exhausted, 'exhausted');

  const zeroAllowed = classifyCartForRecovery(
    { lastActivityAt: minutesAgo(600), reminderCount: 0 },
    { ...policy, maxReminders: 0 },
    NOW
  );
  assert.strictEqual(zeroAllowed, 'exhausted');
});

test('summarizeRecovery buckets every cart exactly once', () => {
  const summary = summarizeRecovery(
    [
      { id: 'fresh', lastActivityAt: minutesAgo(5), itemCount: 2 },
      { id: 'due', lastActivityAt: minutesAgo(90), reminderCount: 0, itemCount: 1 },
      { id: 'waiting', lastActivityAt: minutesAgo(90), reminderCount: 1, reminderSentAt: minutesAgo(30), itemCount: 1 },
      { id: 'done', lastActivityAt: minutesAgo(5000), reminderCount: 2, reminderSentAt: minutesAgo(4000), itemCount: 1 },
      { id: 'paid', status: 'converted', lastActivityAt: minutesAgo(5000) },
      { id: 'back', recoveredAt: minutesAgo(5), lastActivityAt: minutesAgo(5000) },
    ],
    policy,
    NOW
  );

  assert.deepStrictEqual(summary, {
    total: 6,
    active: 1,
    reminderDue: 1,
    reminded: 1,
    exhausted: 1,
    converted: 1,
    recovered: 1,
  });
});

test('summarizeRecovery on an empty list is all zeroes', () => {
  assert.deepStrictEqual(summarizeRecovery([], policy, NOW), {
    total: 0,
    active: 0,
    reminderDue: 0,
    reminded: 0,
    exhausted: 0,
    converted: 0,
    recovered: 0,
  });
});

test('buildRecoveryLink trims trailing slashes and encodes the token', () => {
  assert.strictEqual(
    buildRecoveryLink('https://tembus.test/', 'abc123'),
    'https://tembus.test/cart/recover/abc123'
  );
  assert.strictEqual(
    buildRecoveryLink('https://tembus.test///', 'a+b/c='),
    'https://tembus.test/cart/recover/a%2Bb%2Fc%3D'
  );
  assert.throws(() => buildRecoveryLink('', 'abc'), /Base URL/);
  assert.throws(() => buildRecoveryLink('   ', 'abc'), /Base URL/);
  assert.throws(() => buildRecoveryLink('https://tembus.test', ''), /Token/);
});

test('isRecoveryTokenExpired uses the configured TTL and treats missing dates as expired', () => {
  const ttlPolicy = { ...policy, recoveryTtlHours: 72 };

  assert.strictEqual(isRecoveryTokenExpired(null, ttlPolicy, NOW), true);
  assert.strictEqual(isRecoveryTokenExpired('bukan tanggal', ttlPolicy, NOW), true);
  assert.strictEqual(isRecoveryTokenExpired(minutesAgo(60), ttlPolicy, NOW), false);
  assert.strictEqual(isRecoveryTokenExpired(minutesAgo(72 * 60), ttlPolicy, NOW), false);
  assert.strictEqual(isRecoveryTokenExpired(minutesAgo(72 * 60 + 1), ttlPolicy, NOW), true);
});
