import { describe, it, after } from 'node:test';
import assert from 'node:assert';
import {
  STOCK_TRANSFER_ACTIONS,
  STOCK_TRANSFER_STATUSES,
  StockTransferError,
  applyReceiveStock,
  applyShipStock,
  assertDistinctBranches,
  assertTransferQuantity,
  nextStatus,
  type StockTransferStatus,
} from '../services/branch/stockTransferService.js';
import { createApp } from '../app.js';
import { closeRedis } from '../config/redis.js';
import { closeDatabase } from '../db/index.js';

function isTransferError(code: string) {
  return (err: any) => err instanceof StockTransferError && err.code === code;
}

describe('stock transfer state machine', () => {
  it('keeps approval in draft because the contract only allows four statuses', () => {
    assert.strictEqual(nextStatus('draft', 'approve'), 'draft');
  });

  it('walks draft -> in_transit -> received', () => {
    const shipped = nextStatus('draft', 'ship');
    assert.strictEqual(shipped, 'in_transit');
    assert.strictEqual(nextStatus(shipped, 'receive'), 'received');
  });

  it('cancels only from draft', () => {
    assert.strictEqual(nextStatus('draft', 'cancel'), 'cancelled');
    assert.throws(
      () => nextStatus('in_transit', 'cancel'),
      isTransferError('INVALID_TRANSITION')
    );
    assert.throws(
      () => nextStatus('received', 'cancel'),
      isTransferError('INVALID_TRANSITION')
    );
  });

  it('rejects every action that does not match the current status', () => {
    const invalid: Array<[StockTransferStatus, string]> = [
      ['in_transit', 'ship'],
      ['received', 'ship'],
      ['cancelled', 'ship'],
      ['draft', 'receive'],
      ['received', 'receive'],
      ['in_transit', 'approve'],
      ['received', 'approve'],
      ['cancelled', 'approve'],
    ];

    for (const [status, action] of invalid) {
      assert.throws(
        () => nextStatus(status, action as any),
        isTransferError('INVALID_TRANSITION'),
        `${action} should be rejected from ${status}`
      );
    }
  });

  it('rejects an unknown action instead of guessing a status', () => {
    assert.throws(
      () => nextStatus('draft', 'teleport' as any),
      isTransferError('INVALID_TRANSITION')
    );
  });

  it('publishes exactly the four documented statuses and four actions', () => {
    assert.deepStrictEqual([...STOCK_TRANSFER_STATUSES], ['draft', 'in_transit', 'received', 'cancelled']);
    assert.deepStrictEqual([...STOCK_TRANSFER_ACTIONS], ['approve', 'ship', 'receive', 'cancel']);
  });
});

describe('stock transfer validation', () => {
  it('accepts positive integers only', () => {
    for (const good of [1, 2, 99]) {
      assert.doesNotThrow(() => assertTransferQuantity(good));
    }
    for (const bad of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      assert.throws(
        () => assertTransferQuantity(bad),
        isTransferError('INVALID_QUANTITY'),
        `${bad} should be rejected`
      );
    }
  });

  it('requires two branch ids that differ', () => {
    assert.doesNotThrow(() => assertDistinctBranches('branch-a', 'branch-b'));

    assert.throws(
      () => assertDistinctBranches('', 'branch-b'),
      isTransferError('BRANCH_REQUIRED')
    );
    assert.throws(
      () => assertDistinctBranches('branch-a', undefined),
      isTransferError('BRANCH_REQUIRED')
    );
    assert.throws(
      () => assertDistinctBranches('branch-a', 'branch-a'),
      isTransferError('SAME_BRANCH')
    );
    assert.throws(
      () => assertDistinctBranches(' branch-a ', 'branch-a'),
      isTransferError('SAME_BRANCH')
    );
  });

  it('ships available stock without touching reserved stock', () => {
    const row = { stock: 10, reservedStock: 4, lowStockThreshold: 2 };
    const next = applyShipStock(row, 6);

    assert.strictEqual(next.stock, 4);
    assert.strictEqual(next.reservedStock, 4);
    assert.strictEqual(row.stock, 10, 'input row must not be mutated');

    assert.throws(
      () => applyShipStock(row, 7),
      isTransferError('INSUFFICIENT_STOCK')
    );
  });

  it('receives stock by adding the same quantity', () => {
    const next = applyReceiveStock({ stock: 3, reservedStock: 1 }, 8);
    assert.strictEqual(next.stock, 11);
    assert.strictEqual(next.reservedStock, 1);
  });

  it('conserves the total across ship and receive', () => {
    const source = { stock: 20, reservedStock: 0 };
    const destination = { stock: 5, reservedStock: 0 };
    const quantity = 8;

    const afterShip = applyShipStock(source, quantity);
    const afterReceive = applyReceiveStock(destination, quantity);

    assert.strictEqual(afterShip.stock, 12);
    assert.strictEqual(afterReceive.stock, 13);
    assert.strictEqual(
      afterShip.stock + afterReceive.stock,
      source.stock + destination.stock,
      'no quantity may appear or disappear between ship and receive'
    );

    // The status machine is what stops the same quantity from being shipped twice.
    assert.throws(
      () => nextStatus('in_transit', 'ship'),
      isTransferError('INVALID_TRANSITION')
    );
  });
});

describe('stock transfer routes', () => {
  const app = createApp();
  let ipSeed = 2100;

  function request(path: string, init: RequestInit = {}) {
    ipSeed += 1;
    const headers = new Headers(init.headers);
    headers.set('x-forwarded-for', `10.52.${Math.floor(ipSeed / 250)}.${(ipSeed % 250) + 1}`);
    return app.request(path, { ...init, headers });
  }

  function bearer(token: string): Record<string, string> {
    return { Authorization: `Bearer ${token}` };
  }

  function jsonInit(body: unknown, token?: string): RequestInit {
    return {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(token ? bearer(token) : {}),
      },
      body: JSON.stringify(body),
    };
  }

  after(async () => {
    await closeRedis();
    await closeDatabase();
  });

  it('rejects an anonymous list read with 401', async () => {
    const res = await request('/api/v1/admin/stock-transfers');
    assert.strictEqual(res.status, 401);
  });

  it('rejects an anonymous create with 401', async () => {
    const res = await request(
      '/api/v1/admin/stock-transfers',
      jsonInit({ fromBranchId: 'a', toBranchId: 'b', variantId: 'v', quantity: 1 })
    );
    assert.strictEqual(res.status, 401);
  });

  it('rejects an anonymous action call with 401', async () => {
    const res = await request(
      '/api/v1/admin/stock-transfers/transfer-1/approve',
      { method: 'POST' }
    );
    assert.strictEqual(res.status, 401);
  });

  it('rejects a customer token with 403', async () => {
    const res = await request(
      '/api/v1/admin/stock-transfers',
      jsonInit(
        { fromBranchId: 'a', toBranchId: 'b', variantId: 'v', quantity: 1 },
        'mock-customer-token-customer-uuid-001'
      )
    );
    assert.strictEqual(res.status, 403);
  });

  it('rejects a non-integer quantity before touching the database', async () => {
    for (const quantity of [0, -3, 2.5]) {
      const res = await request(
        '/api/v1/admin/stock-transfers',
        jsonInit(
          { fromBranchId: 'branch-a', toBranchId: 'branch-b', variantId: 'variant-1', quantity },
          'mock-admin-token'
        )
      );
      assert.strictEqual(res.status, 400);
      const body = (await res.json()) as any;
      assert.strictEqual(body.error.code, 'INVALID_QUANTITY');
    }
  });

  it('rejects a transfer to the same branch before touching the database', async () => {
    const res = await request(
      '/api/v1/admin/stock-transfers',
      jsonInit(
        { fromBranchId: 'branch-a', toBranchId: 'branch-a', variantId: 'variant-1', quantity: 2 },
        'mock-admin-token'
      )
    );
    assert.strictEqual(res.status, 409);
    const body = (await res.json()) as any;
    assert.strictEqual(body.error.code, 'SAME_BRANCH');
  });

  it('rejects a missing branch before touching the database', async () => {
    const res = await request(
      '/api/v1/admin/stock-transfers',
      jsonInit(
        { fromBranchId: 'branch-a', variantId: 'variant-1', quantity: 2 },
        'mock-admin-token'
      )
    );
    assert.strictEqual(res.status, 400);
    const body = (await res.json()) as any;
    assert.strictEqual(body.error.code, 'BRANCH_REQUIRED');
  });

  it('rejects a missing variant before touching the database', async () => {
    const res = await request(
      '/api/v1/admin/stock-transfers',
      jsonInit(
        { fromBranchId: 'branch-a', toBranchId: 'branch-b', quantity: 2 },
        'mock-admin-token'
      )
    );
    assert.strictEqual(res.status, 400);
    const body = (await res.json()) as any;
    assert.strictEqual(body.error.code, 'VARIANT_NOT_FOUND');
  });
});
