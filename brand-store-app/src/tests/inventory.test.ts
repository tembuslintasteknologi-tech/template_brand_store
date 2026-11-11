import test from 'node:test';
import assert from 'node:assert';
import * as inventoryService from '../services/inventoryService.js';
import * as dbModule from '../db/index.js';

let variant = {
  id: 'var-1',
  productId: 'prod-1',
  stock: 10,
  reservedStock: 2,
  lowStockThreshold: 5,
};

const dbMock: any = {
  select: () => ({
    from: () => ({
      where: () => Promise.resolve([variant]),
    }),
  }),
  update: () => ({
    set: (payload: any) => ({
      where: () => {
        Object.assign(variant, payload);
        return Promise.resolve();
      },
    }),
  }),
  insert: () => ({
    values: () => Promise.resolve(),
  }),
};

Object.assign(dbModule.db, dbMock);

test('Inventory Service Behavioral Tests', async (t) => {
  const resetVariant = () => {
    variant = { id: 'var-1', productId: 'prod-1', stock: 10, reservedStock: 2, lowStockThreshold: 5 };
  };

  await t.test('adjustStock increases stock successfully', async () => {
    resetVariant();
    const result = await inventoryService.adjustStock({
      variantId: 'var-1',
      quantityChange: 5,
    });
    assert.strictEqual(result.newStock, 15);
  });

  await t.test('adjustStock decreases stock successfully', async () => {
    resetVariant();
    const result = await inventoryService.adjustStock({
      variantId: 'var-1',
      quantityChange: -5,
    });
    assert.strictEqual(result.newStock, 5);
  });

  await t.test('adjustStock throws error when adjustment would make stock negative', async () => {
    resetVariant();
    await assert.rejects(inventoryService.adjustStock({ variantId: 'var-1', quantityChange: -20 }));
  });

  await t.test('reserveStock reserves available stock successfully', async () => {
    resetVariant();
    const result = await inventoryService.reserveStock('var-1', 3, 'order-123');
    assert.strictEqual(result.success, true);
  });

  await t.test('reserveStock throws error when not enough available stock', async () => {
    resetVariant();
    await assert.rejects(inventoryService.reserveStock('var-1', 9, 'order-999'));
  });

  await t.test('adjustStock throws error when variant not found', async () => {
    const originalSelect = dbModule.db.select;
    dbModule.db.select = () => ({ from: () => ({ where: () => Promise.resolve([]) }) }) as any;
    try {
        await assert.rejects(inventoryService.adjustStock({ variantId: 'unknown', quantityChange: 1 }));
    } finally {
        dbModule.db.select = originalSelect;
    }
  });

  await t.test('reserveStock throws error when variant not found', async () => {
    const originalSelect = dbModule.db.select;
    dbModule.db.select = () => ({ from: () => ({ where: () => Promise.resolve([]) }) }) as any;
    try {
        await assert.rejects(inventoryService.reserveStock('unknown', 1, 'ref'));
    } finally {
        dbModule.db.select = originalSelect;
    }
  });

  await t.test('releaseReservedStock reduces reserved stock successfully', async () => {
    resetVariant();
    const result = await inventoryService.releaseReservedStock('var-1', 1, 'order-777');
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.reservedStock, 1);
  });

  await t.test('releaseReservedStock throws error when variant not found', async () => {
    const originalSelect = dbModule.db.select;
    dbModule.db.select = () => ({ from: () => ({ where: () => Promise.resolve([]) }) }) as any;
    try {
        await assert.rejects(inventoryService.releaseReservedStock('unknown', 1, 'ref'));
    } finally {
        dbModule.db.select = originalSelect;
    }
  });
});
