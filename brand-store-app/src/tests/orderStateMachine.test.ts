import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  canTransition,
  nextStatuses,
  isTerminal,
  isOrderStatus,
  validateTransition,
} from '../services/orderStateMachine.js';

describe('order state machine', () => {
  it('allows the happy path pending -> paid -> processing -> shipped -> delivered', () => {
    assert.strictEqual(canTransition('pending', 'paid'), true);
    assert.strictEqual(canTransition('paid', 'processing'), true);
    assert.strictEqual(canTransition('processing', 'shipped'), true);
    assert.strictEqual(canTransition('shipped', 'delivered'), true);
    assert.strictEqual(canTransition('delivered', 'completed'), true);
  });

  it('allows cancelling an unpaid order', () => {
    assert.strictEqual(canTransition('pending', 'cancelled'), true);
    assert.strictEqual(canTransition('pending', 'expired'), true);
  });

  it('blocks skipping states', () => {
    assert.strictEqual(canTransition('pending', 'shipped'), false);
    assert.strictEqual(canTransition('paid', 'delivered'), false);
  });

  it('blocks moving backwards', () => {
    assert.strictEqual(canTransition('shipped', 'processing'), false);
    assert.strictEqual(canTransition('delivered', 'shipped'), false);
  });

  it('treats closed orders as terminal', () => {
    for (const status of ['cancelled', 'expired', 'refunded'] as const) {
      assert.strictEqual(isTerminal(status), true);
      assert.deepStrictEqual(nextStatuses(status), []);
    }
    assert.strictEqual(isTerminal('paid'), false);
  });

  it('reports transition reasons', () => {
    assert.deepStrictEqual(validateTransition('pending', 'pending'), {
      allowed: false,
      reason: 'SAME_STATUS',
    });
    assert.deepStrictEqual(validateTransition('pending', 'shipped'), {
      allowed: false,
      reason: 'INVALID_TRANSITION',
    });
    assert.deepStrictEqual(validateTransition('nope', 'paid'), {
      allowed: false,
      reason: 'UNKNOWN_STATUS',
    });
    assert.deepStrictEqual(validateTransition('pending', 'paid'), { allowed: true });
  });

  it('recognises known statuses only', () => {
    assert.strictEqual(isOrderStatus('paid'), true);
    assert.strictEqual(isOrderStatus('PAID'), false);
    assert.strictEqual(isOrderStatus('ghost'), false);
  });
});
