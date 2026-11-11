import { test, describe } from 'node:test';
import assert from 'node:assert';
import { realtimeHub } from '../services/realtime/realtimeService.js';

describe('Realtime Hub', () => {
  test('broadcasts order status updates', () => {
    return new Promise<void>((resolve) => {
      const orderId = 'test-order-999';
      
      realtimeHub.once(`order:${orderId}`, (data: any) => {
        assert.strictEqual(data.status, 'shipped');
        assert.strictEqual(data.orderId, orderId);
        resolve();
      });

      realtimeHub.broadcastOrderStatus(orderId, 'shipped', 'AWB12345');
    });
  });
});
