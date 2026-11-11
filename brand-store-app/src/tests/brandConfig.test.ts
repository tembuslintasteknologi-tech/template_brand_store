import test from 'node:test';
import assert from 'node:assert';
import {
  validateSetting,
  brandProfileSchema,
  featureFlagsSchema,
  pickDefaultLocation,
  shouldBlockForMaintenance,
  MAINTENANCE_ALLOWED_PREFIXES,
  ConfigError,
} from '../services/config/settings.js';

test('validateSetting accepts valid known keys', () => {
  assert.deepStrictEqual(validateSetting('tax.percent', { percent: 11 }), { percent: 11 });
  assert.deepStrictEqual(validateSetting('payment.expiry_minutes', { minutes: 1440 }), { minutes: 1440 });
  assert.deepStrictEqual(validateSetting('brand.currency', { code: 'IDR' }), { code: 'IDR' });
  assert.deepStrictEqual(validateSetting('brand.locale', { code: 'id-ID' }), { code: 'id-ID' });
});

test('validateSetting rejects out of range tax and expiry', () => {
  assert.throws(() => validateSetting('tax.percent', { percent: 150 }), ConfigError);
  assert.throws(() => validateSetting('tax.percent', { percent: -1 }), ConfigError);
  assert.throws(() => validateSetting('payment.expiry_minutes', { minutes: 0 }), ConfigError);
  assert.throws(() => validateSetting('payment.expiry_minutes', { minutes: 999999 }), ConfigError);
  assert.throws(() => validateSetting('brand.currency', { code: 'RUPIAH' }), ConfigError);
});

test('validateSetting rejects bad key names and non object values for unknown keys', () => {
  assert.throws(() => validateSetting('bad key!', { a: 1 }), /Kunci setting tidak valid/);
  assert.throws(() => validateSetting('custom.flag', 'text'), /harus berupa objek JSON/);
  assert.deepStrictEqual(validateSetting('custom.flag', { a: 1 }), { a: 1 });
});

test('brandProfileSchema requires a name and validates contact email', () => {
  assert.strictEqual(brandProfileSchema.safeParse({ name: 'Tembus Store' }).success, true);
  assert.strictEqual(brandProfileSchema.safeParse({ name: '' }).success, false);
  assert.strictEqual(
    brandProfileSchema.safeParse({ name: 'Tembus', contact: { email: 'not-an-email' } }).success,
    false
  );
  assert.strictEqual(
    brandProfileSchema.safeParse({ name: 'Tembus', contact: { email: 'halo@tembus.id' } }).success,
    true
  );
});

test('featureFlagsSchema only accepts boolean values', () => {
  assert.strictEqual(featureFlagsSchema.safeParse({ reviews: true, wallet: false }).success, true);
  assert.strictEqual(featureFlagsSchema.safeParse({ reviews: 'yes' }).success, false);
});

test('pickDefaultLocation prefers an active default location', () => {
  const rows = [
    { id: 'a', isDefault: false, isActive: true },
    { id: 'b', isDefault: true, isActive: true },
    { id: 'c', isDefault: true, isActive: false },
  ];
  assert.strictEqual(pickDefaultLocation(rows)?.id, 'b');
  assert.strictEqual(pickDefaultLocation([{ id: 'x', isDefault: false }]), null);
  assert.strictEqual(pickDefaultLocation([]), null);
});


test('shouldBlockForMaintenance keeps admin, auth, health and webhooks reachable', () => {
  assert.strictEqual(shouldBlockForMaintenance(false, '/api/v1/products'), false);
  assert.strictEqual(shouldBlockForMaintenance(true, '/api/v1/products'), true);
  assert.strictEqual(shouldBlockForMaintenance(true, '/health'), false);
  assert.strictEqual(shouldBlockForMaintenance(true, '/api/v1/admin/settings'), false);
  assert.strictEqual(shouldBlockForMaintenance(true, '/api/v1/auth/login'), false);
  assert.strictEqual(shouldBlockForMaintenance(true, '/webhooks/logistics/tembus_ondemand'), false);
  assert.ok(MAINTENANCE_ALLOWED_PREFIXES.includes('/api/v1/admin'));
});

test('validateSetting accepts maintenance.mode and rejects wrong shape', () => {
  assert.deepStrictEqual(validateSetting('maintenance.mode', { enabled: true, message: 'Tutup sementara' }), {
    enabled: true,
    message: 'Tutup sementara',
  });
  assert.throws(() => validateSetting('maintenance.mode', { enabled: 'yes' }), ConfigError);
});
