import test from 'node:test';
import assert from 'node:assert';
import {
  isValidPhone,
  maskPhone,
  normalizePhoneNumber,
  readSmsConfig,
  renderOtpMessage,
  selectSmsProvider,
} from '../services/notifications/smsService.js';

test('normalizePhoneNumber converts Indonesian formats to E.164', () => {
  assert.strictEqual(normalizePhoneNumber('08123456789'), '+628123456789');
  assert.strictEqual(normalizePhoneNumber('628123456789'), '+628123456789');
  assert.strictEqual(normalizePhoneNumber('8123456789'), '+628123456789');
  assert.strictEqual(normalizePhoneNumber('+62 812-3456-789'), '+628123456789');
  assert.strictEqual(normalizePhoneNumber('(0812) 3456 789'), '+628123456789');
});

test('normalizePhoneNumber keeps non-Indonesian country codes intact', () => {
  assert.strictEqual(normalizePhoneNumber('+1 415 555 0100'), '+14155550100');
  assert.strictEqual(normalizePhoneNumber('+44 20 7946 0958'), '+442079460958');
});

test('normalizePhoneNumber returns an empty string for blank input', () => {
  assert.strictEqual(normalizePhoneNumber(''), '');
  assert.strictEqual(normalizePhoneNumber('   '), '');
});

test('isValidPhone accepts E.164 and rejects short garbage', () => {
  assert.strictEqual(isValidPhone('08123456789'), true);
  assert.strictEqual(isValidPhone('+628123456789'), true);
  assert.strictEqual(isValidPhone('123'), false);
  assert.strictEqual(isValidPhone('abcdefghij'), false);
});

test('maskPhone keeps the prefix and last three digits', () => {
  assert.strictEqual(maskPhone('08123456789'), '+628******789');
  assert.strictEqual(maskPhone('12345'), '******');
});

test('renderOtpMessage includes brand, code, and validity window', () => {
  const message = renderOtpMessage('123456');
  assert.ok(message.includes('TEMBUS'));
  assert.ok(message.includes('123456'));
  assert.ok(message.includes('5 menit'));

  const custom = renderOtpMessage('654321', { brand: 'TEMBUS Express', minutes: 3 });
  assert.ok(custom.includes('TEMBUS Express'));
  assert.ok(custom.includes('3 menit'));
});

test('selectSmsProvider prefers Twilio, then Fonnte, then log', () => {
  assert.strictEqual(
    selectSmsProvider({
      TWILIO_ACCOUNT_SID: 'AC123',
      TWILIO_AUTH_TOKEN: 'secret',
      TWILIO_FROM_NUMBER: '+15550001111',
      FONNTE_TOKEN: 'fonnte',
    } as any),
    'twilio'
  );

  assert.strictEqual(selectSmsProvider({ FONNTE_TOKEN: 'fonnte' } as any), 'fonnte');
  assert.strictEqual(selectSmsProvider({} as any), 'log');
});

test('readSmsConfig exposes credentials for the chosen provider', () => {
  const config = readSmsConfig({ FONNTE_TOKEN: 'fonnte-token' } as any);
  assert.strictEqual(config.provider, 'fonnte');
  assert.strictEqual(config.fonnteToken, 'fonnte-token');
  assert.strictEqual(config.twilioAuthToken, null);
});
