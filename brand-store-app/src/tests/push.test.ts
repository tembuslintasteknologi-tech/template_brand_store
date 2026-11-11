import test from 'node:test';
import assert from 'node:assert';
import {
  buildApnsPayload,
  buildFcmMessage,
  isProviderConfigured,
  readPushConfig,
  resolvePushProvider,
  selectDeliverableDevices,
} from '../services/notifications/pushService.js';

test('resolvePushProvider maps iOS to APNs and everything else to FCM', () => {
  assert.strictEqual(resolvePushProvider('ios'), 'apns');
  assert.strictEqual(resolvePushProvider('android'), 'fcm');
  assert.strictEqual(resolvePushProvider('web'), 'fcm');
});

test('selectDeliverableDevices drops inactive and malformed tokens', () => {
  const devices = [
    { token: 'token-abcdefgh', platform: 'android', isActive: true },
    { token: 'token-ijklmnop', platform: 'ios', isActive: false },
    { token: 'short', platform: 'android', isActive: true },
    { token: '', platform: 'android', isActive: true },
  ];
  const selected = selectDeliverableDevices(devices);
  assert.strictEqual(selected.length, 1);
  assert.strictEqual(selected[0].token, 'token-abcdefgh');
});

test('buildFcmMessage stringifies data values', () => {
  const payload = buildFcmMessage('token-abcdefgh', 'Judul', 'Isi', { orderId: 'ORD-1', total: 25000 });
  assert.strictEqual(payload.message.token, 'token-abcdefgh');
  assert.strictEqual(payload.message.notification.title, 'Judul');
  assert.strictEqual(payload.message.data.orderId, 'ORD-1');
  assert.strictEqual(payload.message.data.total, '25000');
  assert.strictEqual(payload.message.android.priority, 'HIGH');
});

test('buildApnsPayload keeps aps alert and extra keys', () => {
  const payload = buildApnsPayload('Judul', 'Isi', { deepLink: '/orders/1' });
  assert.deepStrictEqual(payload.aps.alert, { title: 'Judul', body: 'Isi' });
  assert.strictEqual(payload.aps.sound, 'default');
  assert.strictEqual(payload.deepLink, '/orders/1');
});

test('readPushConfig detects whether a provider is configured', () => {
  const configured = readPushConfig({ FCM_SERVER_KEY: 'key-123', APNS_AUTH_TOKEN: 'apns-123' } as any);
  assert.strictEqual(isProviderConfigured('fcm', configured), true);
  assert.strictEqual(isProviderConfigured('apns', configured), true);

  const empty = readPushConfig({} as any);
  assert.strictEqual(isProviderConfigured('fcm', empty), false);
  assert.strictEqual(isProviderConfigured('apns', empty), false);
});
