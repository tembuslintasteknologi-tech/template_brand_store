import { test, describe } from 'node:test';
import assert from 'node:assert';
import { SocialAuthService } from '../services/auth/socialAuthService.js';

describe('SocialAuthService', () => {
  test('verifies a valid token', async () => {
    const service = new SocialAuthService();
    const profile = await service.verifyToken('google', 'valid-token');
    assert.strictEqual(profile.email, 'test@example.com');
  });

  test('throws on invalid token', async () => {
    const service = new SocialAuthService();
    await assert.rejects(service.verifyToken('google', 'invalid-token'));
  });
});
