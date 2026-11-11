import { test, describe } from 'node:test';
import assert from 'node:assert';
import { RefundService } from '../services/refund/refundService.js';

describe('RefundService', () => {
  test('requests a refund', async () => {
    const service = new RefundService();
    const refund = await service.requestRefund('order-123', 100, 'broken');
    assert.strictEqual(refund.status, 'pending');
  });

  test('approves a refund', async () => {
    const service = new RefundService();
    const result = await service.approveRefund('refund-1');
    assert.strictEqual(result.status, 'approved');
  });
});
