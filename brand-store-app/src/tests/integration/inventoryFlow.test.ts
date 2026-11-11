import test from 'node:test';
import assert from 'node:assert';
import * as inventoryService from '../../services/inventoryService.js';
import * as dbModule from '../../db/index.js';

test('Integration Suite: Inventory Operations Lifecycle', async (t) => {
  let mockRecord = {
    id: 'int-var-1',
    productId: 'int-prod-1',
    stock: 50,
    reservedStock: 10,
    lowStockThreshold: 15,
  };

  const integrationDbMock: any = {
    select: () => ({
      from: () => ({
        where: () => Promise.resolve([mockRecord]),
      }),
    }),
    update: () => ({
      set: (payload: any) => ({
        where: () => {
          Object.assign(mockRecord, payload);
          return Promise.resolve();
        },
      }),
    }),
    insert: () => ({
      values: (val: any) => {
        return Promise.resolve();
      },
    }),
  };

  const originalDb = dbModule.db;
  Object.assign(dbModule.db, integrationDbMock);

  t.after(() => {
    dbModule.db.select = originalDb.select;
    dbModule.db.update = originalDb.update;
    dbModule.db.insert = originalDb.insert;
  });

  await t.test('Full lifecycle: check stock, reserve, release, and adjust', async () => {
    // 1. Check initial state
    const initial = await inventoryService.getVariantStock('int-var-1');
    assert.strictEqual(initial.stock, 50);
    assert.strictEqual(initial.reservedStock, 10);

    // 2. Reserve stock
    const resResult = await inventoryService.reserveStock('int-var-1', 5, 'order-int-1');
    assert.strictEqual(resResult.success, true);
    assert.strictEqual(mockRecord.reservedStock, 15);

    // 3. Release reserved stock
    const relResult = await inventoryService.releaseReservedStock('int-var-1', 5, 'order-int-1');
    assert.strictEqual(relResult.success, true);
    assert.strictEqual(mockRecord.reservedStock, 10);

    // 4. Adjust stock downwards
    const adjResult = await inventoryService.adjustStock({
      variantId: 'int-var-1',
      quantityChange: -10,
      reason: 'Stock count correction',
      performedBy: 'admin-user',
    });
    assert.strictEqual(adjResult.newStock, 40);
    assert.strictEqual(adjResult.isLowStock, false);
  });
});
