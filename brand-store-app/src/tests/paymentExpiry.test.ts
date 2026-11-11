import test from 'node:test';
import assert from 'node:assert';
import {
  resolvePaymentExpiry,
  isPaymentExpired,
  buildExpiredPaymentDetails,
} from '../services/payment/paymentExpiry.js';

test('resolvePaymentExpiry adds the configured minutes', () => {
  const now = new Date('2026-11-10T10:00:00.000Z');
  const expiry = resolvePaymentExpiry(now, 60);
  assert.strictEqual(expiry.toISOString(), '2026-11-10T11:00:00.000Z');
});

test('resolvePaymentExpiry tolerates invalid input by returning now', () => {
  const now = new Date('2026-11-10T10:00:00.000Z');
  assert.strictEqual(resolvePaymentExpiry(now, 0).toISOString(), now.toISOString());
  assert.strictEqual(resolvePaymentExpiry(now, -5).toISOString(), now.toISOString());
  assert.strictEqual(resolvePaymentExpiry(now, Number.NaN).toISOString(), now.toISOString());
});

test('isPaymentExpired handles Date, ISO string, null and invalid values', () => {
  const now = new Date('2026-11-10T10:00:00.000Z');
  assert.strictEqual(isPaymentExpired(new Date('2026-11-10T09:59:59.000Z'), now), true);
  assert.strictEqual(isPaymentExpired(new Date('2026-11-10T10:00:00.000Z'), now), true);
  assert.strictEqual(isPaymentExpired(new Date('2026-11-10T10:00:01.000Z'), now), false);
  assert.strictEqual(isPaymentExpired('2026-11-10T09:00:00.000Z', now), true);
  assert.strictEqual(isPaymentExpired(null, now), false);
  assert.strictEqual(isPaymentExpired(undefined, now), false);
  assert.strictEqual(isPaymentExpired('bukan-tanggal', now), false);
});

test('buildExpiredPaymentDetails keeps existing fields and marks the expiry', () => {
  const now = new Date('2026-11-10T10:00:00.000Z');
  const result = buildExpiredPaymentDetails({ gateway: 'midtrans', transactionId: 'TRX-1' }, now);
  assert.strictEqual(result.gateway, 'midtrans');
  assert.strictEqual(result.transactionId, 'TRX-1');
  assert.strictEqual(result.status, 'expired');
  assert.strictEqual(result.expiredAt, '2026-11-10T10:00:00.000Z');
});

test('buildExpiredPaymentDetails handles null and non-object input', () => {
  const now = new Date('2026-11-10T10:00:00.000Z');
  assert.deepStrictEqual(buildExpiredPaymentDetails(null, now), {
    status: 'expired',
    expiredAt: '2026-11-10T10:00:00.000Z',
  });
  assert.strictEqual(buildExpiredPaymentDetails('text', now).status, 'expired');
});
