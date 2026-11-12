import { test } from 'node:test';
import assert from 'node:assert';
import {
  BranchStockError,
  applyRelease,
  applyReserve,
  canFulfill,
  groupItemsByBranch,
  planReservation,
  resolveAvailable,
  stockStatus,
  type BranchStockRow,
} from '../services/branch/branchStockService.js';

const pusat: BranchStockRow = {
  branchId: 'branch-pusat',
  variantId: 'var-powerbank',
  stock: 10,
  reservedStock: 2,
  lowStockThreshold: 3,
};

const jogja: BranchStockRow = {
  branchId: 'branch-jogja',
  variantId: 'var-powerbank',
  stock: 4,
  reservedStock: 0,
  lowStockThreshold: 3,
};

test('branch stock: resolveAvailable subtracts reservations and never goes negative', () => {
  assert.strictEqual(resolveAvailable(pusat), 8);
  assert.strictEqual(resolveAvailable({ ...pusat, stock: 1, reservedStock: 5 }), 0);
});

test('branch stock: resolveAvailable rejects malformed rows', () => {
  assert.throws(
    () => resolveAvailable({ ...pusat, stock: -1 }),
    (err: unknown) => err instanceof BranchStockError && err.code === 'INVALID_QUANTITY'
  );
  assert.throws(
    () => resolveAvailable({ ...pusat, reservedStock: 1.5 }),
    (err: unknown) => err instanceof BranchStockError && err.code === 'INVALID_QUANTITY'
  );
});

test('branch stock: canFulfill respects available stock and input quantity', () => {
  assert.strictEqual(canFulfill(pusat, 8), true);
  assert.strictEqual(canFulfill(pusat, 9), false);
  assert.throws(
    () => canFulfill(pusat, 0),
    (err: unknown) => err instanceof BranchStockError && err.code === 'INVALID_QUANTITY'
  );
});

test('branch stock: stockStatus matches storefront badges', () => {
  assert.strictEqual(stockStatus(pusat), 'in_stock');
  assert.strictEqual(stockStatus({ ...pusat, stock: 5, reservedStock: 2 }), 'low_stock');
  assert.strictEqual(stockStatus({ ...pusat, stock: 2, reservedStock: 2 }), 'out_of_stock');
  assert.strictEqual(stockStatus({ ...pusat, stock: 6, reservedStock: 0, lowStockThreshold: undefined }), 'in_stock');
});

test('branch stock: groupItemsByBranch keeps first-seen branch order', () => {
  const groups = groupItemsByBranch([
    { branchId: 'branch-jakarta', variantId: 'v1', quantity: 1 },
    { branchId: 'branch-bandung', variantId: 'v2', quantity: 2 },
    { branchId: 'branch-jakarta', variantId: 'v3', quantity: 3 },
  ]);

  assert.deepStrictEqual(groups.map((group) => group.branchId), ['branch-jakarta', 'branch-bandung']);
  assert.strictEqual(groups[0].items.length, 2);
  assert.strictEqual(groups[1].items.length, 1);
});

test('branch stock: groupItemsByBranch rejects a cart line without a branch', () => {
  assert.throws(
    () => groupItemsByBranch([{ branchId: '', variantId: 'v1', quantity: 1 }]),
    (err: unknown) => err instanceof BranchStockError && err.code === 'BRANCH_STOCK_NOT_FOUND'
  );
});

test('branch stock: planReservation sums duplicate lines into one entry', () => {
  const plan = planReservation([pusat], [
    { branchId: 'branch-pusat', variantId: 'var-powerbank', quantity: 5 },
    { branchId: 'branch-pusat', variantId: 'var-powerbank', quantity: 3 },
  ]);

  assert.deepStrictEqual(plan, [{ branchId: 'branch-pusat', variantId: 'var-powerbank', quantity: 8 }]);
});

test('branch stock: duplicate lines are summed before the availability check', () => {
  assert.throws(
    () =>
      planReservation([pusat], [
        { branchId: 'branch-pusat', variantId: 'var-powerbank', quantity: 5 },
        { branchId: 'branch-pusat', variantId: 'var-powerbank', quantity: 4 },
      ]),
    (err: unknown) =>
      err instanceof BranchStockError &&
      err.code === 'INSUFFICIENT_STOCK' &&
      /only has 8 available/.test(err.message)
  );
});

test('branch stock: planReservation rejects a branch that does not carry the variant', () => {
  assert.throws(
    () => planReservation([pusat], [{ branchId: 'branch-medan', variantId: 'var-powerbank', quantity: 1 }]),
    (err: unknown) => err instanceof BranchStockError && err.code === 'BRANCH_STOCK_NOT_FOUND'
  );
});

test('branch stock: planReservation rejects over-request with a readable number', () => {
  assert.throws(
    () => planReservation([jogja], [{ branchId: 'branch-jogja', variantId: 'var-powerbank', quantity: 5 }]),
    (err: unknown) =>
      err instanceof BranchStockError &&
      err.code === 'INSUFFICIENT_STOCK' &&
      /only has 4 available/.test(err.message)
  );
});

test('branch stock: planReservation returns an empty plan for an empty cart', () => {
  assert.deepStrictEqual(planReservation([pusat], []), []);
});

test('branch stock: applyReserve does not mutate input and adds reservations', () => {
  const rows = [pusat];
  const plan = [{ branchId: 'branch-pusat', variantId: 'var-powerbank', quantity: 3 }];
  const next = applyReserve(rows, plan);

  assert.strictEqual(rows[0].reservedStock, 2);
  assert.strictEqual(next[0].reservedStock, 5);
  assert.strictEqual(resolveAvailable(next[0]), 5);
});

test('branch stock: applyReserve rejects a plan for an unknown branch row', () => {
  assert.throws(
    () => applyReserve([pusat], [{ branchId: 'branch-medan', variantId: 'var-powerbank', quantity: 1 }]),
    (err: unknown) => err instanceof BranchStockError && err.code === 'BRANCH_STOCK_NOT_FOUND'
  );
});

test('branch stock: applyRelease is clamped and safe to call twice', () => {
  const reserved: BranchStockRow = { ...pusat, reservedStock: 3 };
  const plan = [{ branchId: 'branch-pusat', variantId: 'var-powerbank', quantity: 3 }];

  const once = applyRelease([reserved], plan);
  assert.strictEqual(once[0].reservedStock, 0);

  const twice = applyRelease(once, plan);
  assert.strictEqual(twice[0].reservedStock, 0);
});

test('branch stock: reserve then release returns to the starting reservation', () => {
  const plan = [{ branchId: 'branch-pusat', variantId: 'var-powerbank', quantity: 4 }];
  const reserved = applyReserve([pusat], plan);
  const released = applyRelease(reserved, plan);

  assert.strictEqual(released[0].reservedStock, pusat.reservedStock);
});
