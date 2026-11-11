import { describe, it, after } from 'node:test';
import assert from 'node:assert';
import { issueTokenPair, rotateTokenPair, revokeSession } from '../services/tokenService.js';
import {
  verifyAccessToken,
  verifyRefreshToken,
  isTokenRevoked,
  clearRevocationCache,
} from '../middleware/auth.js';
import { closeRedis } from '../config/redis.js';

const user = { id: 'user-77', email: 'buyer@example.com', role: 'customer' as const };

after(async () => {
  clearRevocationCache();
  await closeRedis();
});

describe('tokenService', () => {
  it('issues an access/refresh pair with the configured lifetimes', () => {
    const pair = issueTokenPair(user);

    assert.strictEqual(pair.tokenType, 'Bearer');
    assert.strictEqual(pair.expiresIn, 900);
    assert.strictEqual(pair.refreshExpiresIn, 604800);

    const access = verifyAccessToken(pair.token);
    const refresh = verifyRefreshToken(pair.refreshToken);

    assert.strictEqual(access.sub, user.id);
    assert.strictEqual(refresh.sub, user.id);
    assert.strictEqual(access.typ, 'access');
    assert.strictEqual(refresh.typ, 'refresh');
  });

  it('rotates the refresh token and revokes the previous one', async () => {
    const first = issueTokenPair(user);
    const oldPayload = verifyRefreshToken(first.refreshToken);

    const rotated = await rotateTokenPair(first.refreshToken);

    assert.notStrictEqual(rotated.pair.refreshToken, first.refreshToken);
    assert.strictEqual(rotated.user.id, user.id);
    assert.strictEqual(await isTokenRevoked(oldPayload.jti), true);

    const newPayload = verifyRefreshToken(rotated.pair.refreshToken);
    assert.strictEqual(await isTokenRevoked(newPayload.jti), false);
  });

  it('rejects replaying an already rotated refresh token', async () => {
    const first = issueTokenPair(user);
    await rotateTokenPair(first.refreshToken);

    await assert.rejects(() => rotateTokenPair(first.refreshToken), /already been used/);
  });

  it('revokes a session from both tokens', async () => {
    const pair = issueTokenPair(user);
    const access = verifyAccessToken(pair.token);
    const refresh = verifyRefreshToken(pair.refreshToken);

    await revokeSession(pair.token, pair.refreshToken);

    assert.strictEqual(await isTokenRevoked(access.jti), true);
    assert.strictEqual(await isTokenRevoked(refresh.jti), true);
  });

  it('ignores malformed tokens during logout', async () => {
    await revokeSession('garbage', undefined);
    assert.ok(true);
  });
});
