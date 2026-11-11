import { describe, it, after } from 'node:test';
import assert from 'node:assert';
import {
  recordFailure,
  getLockState,
  clearFailures,
  clearFailureCache,
} from '../services/loginGuard.js';
import { unifiedConfig } from '../config/unifiedConfig.js';
import { closeRedis } from '../config/redis.js';

const identifier = () => `lock-${Date.now()}-${Math.random().toString(36).slice(2)}`;

after(async () => {
  clearFailureCache();
  await closeRedis();
});

describe('loginGuard', () => {
  it('starts unlocked', async () => {
    const id = identifier();
    const state = await getLockState(id);
    assert.strictEqual(state.locked, false);
    assert.strictEqual(state.failures, 0);
  });

  it(`locks after ${unifiedConfig.auth.maxFailedAttempts} consecutive failures`, async () => {
    const id = identifier();
    let state = await getLockState(id);
    assert.strictEqual(state.locked, false);

    for (let attempt = 1; attempt <= unifiedConfig.auth.maxFailedAttempts; attempt += 1) {
      state = await recordFailure(id);
      assert.strictEqual(state.failures, attempt);
      assert.strictEqual(state.locked, attempt >= unifiedConfig.auth.maxFailedAttempts);
    }

    const locked = await getLockState(id);
    assert.strictEqual(locked.locked, true);
    assert.ok(locked.retryAfterSeconds > 0);
  });

  it('clears failures after a successful login', async () => {
    const id = identifier();
    await recordFailure(id);
    await recordFailure(id);
    await clearFailures(id);

    const state = await getLockState(id);
    assert.strictEqual(state.locked, false);
    assert.strictEqual(state.failures, 0);
  });
});
