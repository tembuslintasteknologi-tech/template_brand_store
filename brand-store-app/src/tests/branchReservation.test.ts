import test from 'node:test';
import assert from 'node:assert';
import {
  reserveStockAtBranch,
  releaseStockAtBranch,
} from '../services/branch/branchReservationService.js';
import {
  findReservedBranch,
  hasReleasedReference,
} from '../services/branch/branchStockService.js';
import { branchInventory, inventoryLogs, productVariants } from '../db/schema.js';
import * as dbModule from '../db/index.js';

interface BranchInventoryRow {
  id: string;
  branchId: string;
  variantId: string;
  stock: number;
  reservedStock: number;
  lowStockThreshold: number;
}

const state: {
  branchRow: BranchInventoryRow | null;
  logs: any[];
  aggregate: number | null;
} = {
  branchRow: null,
  logs: [],
  aggregate: null,
};

function resetState(overrides: Partial<BranchInventoryRow> = {}) {
  state.branchRow = {
    id: 'bi-1',
    branchId: 'branch-a',
    variantId: 'var-1',
    stock: 20,
    reservedStock: 3,
    lowStockThreshold: 5,
    ...overrides,
  };
  state.logs = [];
  state.aggregate = null;
}

const dbMock: any = {
  select: (projection?: any) => ({
    from: (table: any) => ({
      where: () => {
        if (table === branchInventory) {
          if (projection && Object.prototype.hasOwnProperty.call(projection, 'total')) {
            return Promise.resolve([
              { total: state.branchRow ? state.branchRow.reservedStock : 0 },
            ]);
          }
          return Promise.resolve(state.branchRow ? [state.branchRow] : []);
        }
        if (table === inventoryLogs) {
          return Promise.resolve(state.logs);
        }
        if (table === productVariants) {
          return Promise.resolve([{ productId: 'prod-1' }]);
        }
        return Promise.resolve([]);
      },
    }),
  }),
  update: (table: any) => ({
    set: (payload: any) => ({
      where: () => {
        if (table === branchInventory && state.branchRow) {
          if (typeof payload.reservedStock === 'number') {
            state.branchRow.reservedStock = payload.reservedStock;
          }
          if (typeof payload.stock === 'number') {
            state.branchRow.stock = payload.stock;
          }
        }
        if (table === productVariants && typeof payload.reservedStock === 'number') {
          state.aggregate = payload.reservedStock;
        }
        return Promise.resolve();
      },
    }),
  }),
  insert: (table: any) => ({
    values: (row: any) => {
      if (table === inventoryLogs) {
        state.logs.push(row);
      }
      return Promise.resolve();
    },
  }),
};

Object.assign(dbModule.db, dbMock);

const isCode = (code: string) => (err: any) => {
  assert.strictEqual(err.name, 'BranchStockError');
  assert.strictEqual(err.code, code);
  return true;
};

test('Branch reservation service (BR-011)', async (t) => {
  await t.test('reserveStockAtBranch reserves on the given branch and writes a log', async () => {
    resetState();

    const result = await reserveStockAtBranch('branch-a', 'var-1', 4, 'ref-1');

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.branchId, 'branch-a');
    assert.strictEqual(result.variantId, 'var-1');
    assert.strictEqual(result.quantity, 4);
    assert.strictEqual(result.reservedStock, 7);
    assert.strictEqual(result.available, 13);
    assert.strictEqual(result.referenceId, 'ref-1');

    assert.strictEqual(state.branchRow?.reservedStock, 7);
    assert.strictEqual(state.logs.length, 1);
    assert.strictEqual(state.logs[0].changeType, 'reservation');
    assert.strictEqual(state.logs[0].branchId, 'branch-a');
    assert.strictEqual(state.logs[0].variantId, 'var-1');
    assert.strictEqual(state.logs[0].quantityChange, -4);
    assert.strictEqual(state.logs[0].referenceId, 'ref-1');
    assert.strictEqual(state.aggregate, 7);
  });

  await t.test('reserveStockAtBranch rejects a variant the branch does not carry', async () => {
    resetState();
    state.branchRow = null;

    await assert.rejects(
      reserveStockAtBranch('branch-a', 'var-1', 1, 'ref-missing'),
      isCode('BRANCH_STOCK_NOT_FOUND')
    );
    assert.strictEqual(state.logs.length, 0);
  });

  await t.test('reserveStockAtBranch rejects more than the branch can fulfil', async () => {
    resetState({ stock: 20, reservedStock: 18 });

    await assert.rejects(
      reserveStockAtBranch('branch-a', 'var-1', 5, 'ref-over'),
      isCode('INSUFFICIENT_STOCK')
    );
    assert.strictEqual(state.branchRow?.reservedStock, 18);
    assert.strictEqual(state.logs.length, 0);
  });

  await t.test('reserveStockAtBranch rejects a quantity that is not a positive integer', async () => {
    resetState();

    await assert.rejects(
      reserveStockAtBranch('branch-a', 'var-1', 0, 'ref-zero'),
      isCode('INVALID_QUANTITY')
    );
    await assert.rejects(
      reserveStockAtBranch('branch-a', 'var-1', -2, 'ref-negative'),
      isCode('INVALID_QUANTITY')
    );
    await assert.rejects(
      reserveStockAtBranch('branch-a', 'var-1', 1.5, 'ref-fraction'),
      isCode('INVALID_QUANTITY')
    );
    assert.strictEqual(state.logs.length, 0);
  });

  await t.test('reserveStockAtBranch rejects a blank branch id', async () => {
    resetState();

    await assert.rejects(
      reserveStockAtBranch('   ', 'var-1', 1, 'ref-blank'),
      isCode('BRANCH_STOCK_NOT_FOUND')
    );
  });

  await t.test('releaseStockAtBranch returns the reservation to the same branch', async () => {
    resetState({ reservedStock: 7 });
    state.logs.push({
      referenceId: 'ref-2',
      changeType: 'reservation',
      branchId: 'branch-a',
      variantId: 'var-1',
      quantityChange: -4,
    });

    const result = await releaseStockAtBranch('branch-a', 'var-1', 4, 'ref-2');

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.reservedStock, 3);
    assert.strictEqual(result.released, true);
    assert.strictEqual(result.alreadyReleased, false);
    assert.strictEqual(state.branchRow?.reservedStock, 3);
    assert.strictEqual(state.logs.length, 2);
    assert.strictEqual(state.logs[1].changeType, 'release');
    assert.strictEqual(state.logs[1].branchId, 'branch-a');
    assert.strictEqual(state.aggregate, 3);
  });

  await t.test('releaseStockAtBranch is idempotent for a reference already released', async () => {
    resetState({ reservedStock: 3 });
    state.logs.push(
      {
        referenceId: 'ref-3',
        changeType: 'reservation',
        branchId: 'branch-a',
        variantId: 'var-1',
        quantityChange: -4,
      },
      {
        referenceId: 'ref-3',
        changeType: 'release',
        branchId: 'branch-a',
        variantId: 'var-1',
        quantityChange: 4,
      }
    );

    const result = await releaseStockAtBranch('branch-a', 'var-1', 4, 'ref-3');

    assert.strictEqual(result.released, false);
    assert.strictEqual(result.alreadyReleased, true);
    assert.strictEqual(result.reservedStock, 3);
    assert.strictEqual(state.branchRow?.reservedStock, 3);
    assert.strictEqual(state.logs.length, 2);
  });

  await t.test('releaseStockAtBranch clamps at zero when releasing above reserved', async () => {
    resetState({ reservedStock: 2 });

    const result = await releaseStockAtBranch('branch-a', 'var-1', 5, 'ref-clamp');

    assert.strictEqual(result.reservedStock, 0);
    assert.strictEqual(result.released, true);
    assert.strictEqual(result.available, 20);
  });

  await t.test('releaseStockAtBranch rejects a variant the branch does not carry', async () => {
    resetState();
    state.branchRow = null;

    await assert.rejects(
      releaseStockAtBranch('branch-a', 'var-1', 1, 'ref-nowhere'),
      isCode('BRANCH_STOCK_NOT_FOUND')
    );
  });

  await t.test('findReservedBranch reads the branch from the reservation log', () => {
    const logs = [
      { referenceId: 'ref-x', changeType: 'release', branchId: 'branch-b' },
      { referenceId: 'ref-x', changeType: 'reservation', branchId: 'branch-b' },
      { referenceId: 'ref-x', changeType: 'reservation', branchId: 'branch-c' },
    ];

    assert.strictEqual(findReservedBranch(logs, 'ref-x'), 'branch-b');
    assert.strictEqual(findReservedBranch(logs, 'ref-unknown'), null);
    assert.strictEqual(findReservedBranch(logs, '   '), null);
    assert.strictEqual(
      findReservedBranch([{ referenceId: 'ref-y', changeType: 'reservation', branchId: null }], 'ref-y'),
      null
    );
  });

  await t.test('hasReleasedReference only matches release logs of the same reference', () => {
    const logs = [
      { referenceId: 'ref-x', changeType: 'reservation' },
      { referenceId: 'ref-z', changeType: 'release' },
    ];

    assert.strictEqual(hasReleasedReference(logs, 'ref-x'), false);
    assert.strictEqual(hasReleasedReference(logs, 'ref-z'), true);
    assert.strictEqual(hasReleasedReference([], 'ref-x'), false);
    assert.strictEqual(hasReleasedReference(logs, ''), false);
  });
});
