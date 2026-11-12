import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  OrderSourceError,
  assertFulfillmentMode,
  buildBranchSnapshot,
  distinctBranchIds,
  planBranchShipments,
  resolveFulfillmentSource,
} from '../services/branch/orderSourceService.js';

// The branch-bound helpers (assertBranchCanFulfill, getBranchSnapshot) need Postgres, so this
// suite covers the decision layer only: which branch an order remembers, how the source is
// labelled, and how the cart splits into shipments.

describe('distinctBranchIds', () => {
  it('collapses repeated branches into one id', () => {
    assert.deepStrictEqual(
      distinctBranchIds([{ branchId: 'a' }, { branchId: 'a' }, { branchId: 'b' }]),
      ['a', 'b']
    );
  });

  it('ignores null, empty and whitespace-only branch ids', () => {
    assert.deepStrictEqual(
      distinctBranchIds([{ branchId: null }, { branchId: '' }, { branchId: '  ' }, { branchId: 'a' }]),
      ['a']
    );
  });

  it('returns nothing when no item carries a branch', () => {
    assert.deepStrictEqual(distinctBranchIds([{ branchId: null }, {}]), []);
  });
});

describe('resolveFulfillmentSource', () => {
  it('labels a single branch cart as branch', () => {
    assert.strictEqual(resolveFulfillmentSource([{ branchId: 'a' }, { branchId: 'a' }]), 'branch');
  });

  it('labels a cart without branches as branch, not as its own value', () => {
    assert.strictEqual(resolveFulfillmentSource([{ branchId: null }]), 'branch');
  });

  it('labels a cart spanning two branches as multi_branch', () => {
    assert.strictEqual(
      resolveFulfillmentSource([{ branchId: 'jakarta' }, { branchId: 'bandung' }]),
      'multi_branch'
    );
  });

  it('does not treat a pusat item as a second branch', () => {
    assert.strictEqual(
      resolveFulfillmentSource([{ branchId: 'jakarta' }, { branchId: null }]),
      'branch'
    );
  });
});

describe('assertFulfillmentMode', () => {
  it('defaults to aggregator when the client sends nothing', () => {
    assert.strictEqual(assertFulfillmentMode(undefined), 'aggregator');
    assert.strictEqual(assertFulfillmentMode(null), 'aggregator');
    assert.strictEqual(assertFulfillmentMode(''), 'aggregator');
  });

  it('accepts both known modes, case and padding included', () => {
    assert.strictEqual(assertFulfillmentMode('ondemand'), 'ondemand');
    assert.strictEqual(assertFulfillmentMode('  AGGREGATOR '), 'aggregator');
  });

  it('rejects an unknown mode instead of guessing one', () => {
    assert.throws(
      () => assertFulfillmentMode('instant'),
      (err: unknown) => {
        assert.ok(err instanceof OrderSourceError);
        assert.strictEqual(err.code, 'INVALID_FULFILLMENT_MODE');
        assert.strictEqual(err.status, 400);
        return true;
      }
    );
  });
});

describe('buildBranchSnapshot', () => {
  it('freezes the readable branch identity', () => {
    assert.deepStrictEqual(
      buildBranchSnapshot({ id: 'b1', code: 'CBG-AAAA1111', name: 'Cabang Bandung', city: 'Bandung' }),
      { id: 'b1', code: 'CBG-AAAA1111', name: 'Cabang Bandung', city: 'Bandung' }
    );
  });

  it('normalises a missing code and city to null and empty string', () => {
    assert.deepStrictEqual(buildBranchSnapshot({ id: 'b1', name: 'Cabang Lama' }), {
      id: 'b1',
      code: null,
      name: 'Cabang Lama',
      city: '',
    });
  });

  it('returns null when there is no branch to snapshot', () => {
    assert.strictEqual(buildBranchSnapshot(null), null);
    assert.strictEqual(buildBranchSnapshot(undefined), null);
  });
});

describe('planBranchShipments', () => {
  it('creates one shipment per branch, in first seen order', () => {
    const plan = planBranchShipments([
      { branchId: 'jakarta', productId: 'p1', quantity: 1, fulfillmentMode: 'ondemand' },
      { branchId: 'bandung', productId: 'p2', quantity: 2, fulfillmentMode: 'aggregator' },
      { branchId: 'jakarta', productId: 'p3', quantity: 1, fulfillmentMode: 'ondemand' },
    ]);

    assert.strictEqual(plan.length, 2);
    assert.deepStrictEqual(
      plan.map((group) => group.branchId),
      ['jakarta', 'bandung']
    );
    assert.strictEqual(plan[0].itemCount, 2);
    assert.strictEqual(plan[0].quantity, 2);
    assert.deepStrictEqual(plan[0].productIds, ['p1', 'p3']);
    assert.strictEqual(plan[1].mode, 'aggregator');
  });

  it('puts every branchless item under the pusat group', () => {
    const plan = planBranchShipments([
      { branchId: null, productId: 'p1', quantity: 1 },
      { productId: 'p2', quantity: 3 },
      { branchId: 'jakarta', productId: 'p3', quantity: 1, fulfillmentMode: 'ondemand' },
    ]);

    assert.strictEqual(plan.length, 2);
    assert.strictEqual(plan[0].branchId, null);
    assert.strictEqual(plan[0].itemCount, 2);
    assert.strictEqual(plan[0].quantity, 4);
    assert.strictEqual(plan[0].mode, 'aggregator');
  });

  it('does not duplicate a product id inside one group', () => {
    const plan = planBranchShipments([
      { branchId: 'jakarta', productId: 'p1', quantity: 1 },
      { branchId: 'jakarta', productId: 'p1', quantity: 1 },
    ]);

    assert.strictEqual(plan.length, 1);
    assert.deepStrictEqual(plan[0].productIds, ['p1']);
    assert.strictEqual(plan[0].quantity, 2);
  });

  it('rejects an invalid mode while grouping, not silently later', () => {
    assert.throws(
      () =>
        planBranchShipments([
          { branchId: 'jakarta', productId: 'p1', quantity: 1, fulfillmentMode: 'kilat' },
        ]),
      (err: unknown) => {
        assert.ok(err instanceof OrderSourceError);
        assert.strictEqual(err.code, 'INVALID_FULFILLMENT_MODE');
        return true;
      }
    );
  });

  it('returns an empty plan for an empty cart', () => {
    assert.deepStrictEqual(planBranchShipments([]), []);
  });
});
