import { describe, it } from 'node:test';
import assert from 'node:assert';
import { unifiedConfig } from '../config/unifiedConfig.js';

function secondsOf(timespan: string): number {
  const match = /^(\d+)s$/.exec(timespan);
  assert.ok(match, `timespan must be seconds, got ${timespan}`);
  return Number(match![1]);
}

describe('unifiedConfig', () => {
  it('exposes runtime settings', () => {
    assert.strictEqual(typeof unifiedConfig.port, 'number');
    assert.ok(unifiedConfig.port > 0);
    assert.ok(['development', 'production', 'test'].includes(unifiedConfig.env));
  });

  it('exposes database and redis connection strings', () => {
    assert.match(unifiedConfig.database.url, /^postgres(ql)?:\/\//);
    assert.match(unifiedConfig.redis.url, /^redis:\/\//);
  });

  it('exposes jwt secrets and required lifetimes', () => {
    assert.ok(unifiedConfig.jwt.secret.length >= 10);
    assert.ok(unifiedConfig.jwt.refreshSecret.length >= 10);
    assert.notStrictEqual(unifiedConfig.jwt.secret, unifiedConfig.jwt.refreshSecret);
    // jsonwebtoken accepts a timespan string; the contract is 900s and 604800s.
    assert.strictEqual(unifiedConfig.jwt.expiresIn, '900s');
    assert.strictEqual(unifiedConfig.jwt.refreshExpiresIn, '604800s');
    assert.strictEqual(secondsOf(unifiedConfig.jwt.expiresIn), 900);
    assert.strictEqual(secondsOf(unifiedConfig.jwt.refreshExpiresIn), 604800);
  });

  it('exposes brute force protection settings', () => {
    assert.strictEqual(unifiedConfig.auth.maxFailedAttempts, 5);
    assert.ok(unifiedConfig.auth.lockTtlSeconds > 0);
  });

  it('exposes brand and store origin defaults', () => {
    assert.ok(unifiedConfig.brand.name.length > 0);
    assert.strictEqual(unifiedConfig.brand.currency, 'IDR');
    assert.ok(unifiedConfig.brand.taxPercent >= 0);
    assert.ok(unifiedConfig.storeOrigin.city.length > 0);
    assert.ok(unifiedConfig.storeOrigin.postalCode.length > 0);
  });

  it('exposes tembus, midtrans and storage integrations', () => {
    assert.match(unifiedConfig.tembus.apiUrl, /^https?:\/\//);
    assert.strictEqual(typeof unifiedConfig.tembus.apiKey, 'string');
    assert.strictEqual(typeof unifiedConfig.midtrans.isProduction, 'boolean');
    assert.ok(unifiedConfig.storage.port > 0);
    assert.ok(unifiedConfig.storage.bucket.length > 0);
  });
});
