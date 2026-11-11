import { test } from 'node:test';
import assert from 'node:assert';
import { sendPush } from '../services/notifications/pushService.js';

test('sendPush should return false when no device token is provided', async () => {
  const result = await sendPush('user1', 'Hello', 'Body', {});
  assert.strictEqual(result.sent, false);
});
