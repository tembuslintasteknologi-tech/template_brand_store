import { describe, it, after } from 'node:test';
import assert from 'node:assert';
import {
  buildBranchDashboard,
  resolveDashboardWindow,
} from '../services/branch/branchDashboard.js';
import { BranchAnalyticsError } from '../services/admin/branchAnalytics.js';
import { createApp } from '../app.js';
import { closeRedis } from '../config/redis.js';
import { closeDatabase } from '../db/index.js';

const branch = {
  id: 'branch-jogja',
  code: 'CBG-JOGJA',
  name: 'Cabang Jogja',
  city: 'Yogyakarta',
  type: 'cabang',
};

const paidLine = (
  orderId: string,
  totalPrice: number | string,
  quantity = 1
) => ({
  orderId,
  branchId: branch.id,
  quantity,
  totalPrice,
  orderStatus: 'paid',
});

describe('branch dashboard pure assembly', () => {
  it('returns a zeroed dashboard for a branch without orders', () => {
    const body = buildBranchDashboard({ branch, sales: [] });

    assert.deepStrictEqual(body.branch, {
      id: 'branch-jogja',
      code: 'CBG-JOGJA',
      name: 'Cabang Jogja',
      city: 'Yogyakarta',
      type: 'cabang',
    });
    assert.strictEqual(body.orderCount, 0);
    assert.strictEqual(body.itemCount, 0);
    assert.strictEqual(body.grossSales, 0);
    assert.strictEqual(body.refundedTotal, 0);
    assert.strictEqual(body.unattributedRefundTotal, 0);
    assert.strictEqual(body.netSales, 0);
    assert.strictEqual(body.averageOrderValue, 0);
    assert.strictEqual(body.lowStockCount, 0);
    assert.deepStrictEqual(body.lowStock, []);
    assert.strictEqual(body.reservedQuantity, 0);
    assert.deepStrictEqual(body.activeReservations, []);
  });

  it('counts only revenue statuses and keeps order counts distinct', () => {
    const body = buildBranchDashboard({
      branch,
      sales: [
        paidLine('order-1', '100000.00', 2),
        paidLine('order-1', '50000.00', 1),
        paidLine('order-2', '30000.00', 3),
        { orderId: 'order-3', branchId: branch.id, quantity: 9, totalPrice: '900000.00', orderStatus: 'pending' },
        { orderId: 'order-4', branchId: branch.id, quantity: 9, totalPrice: '900000.00', orderStatus: 'cancelled' },
      ],
    });

    assert.strictEqual(body.orderCount, 2);
    assert.strictEqual(body.itemCount, 6);
    assert.strictEqual(body.grossSales, 180000);
    assert.strictEqual(body.netSales, 180000);
    assert.strictEqual(body.averageOrderValue, 90000);
  });

  it('allocates refunds only when every line of the order belongs to this branch', () => {
    const body = buildBranchDashboard({
      branch,
      sales: [
        paidLine('order-1', 100000),
        paidLine('order-2', 50000),
        paidLine('order-3', 30000),
      ],
      refunds: [
        { orderId: 'order-1', amount: '10000.00', status: 'approved' },
        { orderId: 'order-2', amount: '5000.00', status: 'processed' },
        { orderId: 'order-3', amount: '3000.00', status: 'completed' },
        { orderId: 'order-4', amount: '1000.00', status: 'succeeded' },
        { orderId: 'order-1', amount: '7000.00', status: 'pending' },
      ],
      orderBranches: [
        { orderId: 'order-1', branchId: branch.id },
        { orderId: 'order-2', branchId: branch.id },
        { orderId: 'order-2', branchId: 'branch-bandung' },
        // A legacy line with no branch makes order-3 ambiguous on purpose.
        { orderId: 'order-3', branchId: branch.id },
        { orderId: 'order-3', branchId: null },
      ],
    });

    assert.strictEqual(body.refundedTotal, 10000);
    assert.strictEqual(body.unattributedRefundTotal, 9000);
    assert.strictEqual(body.netSales, 170000);
  });

  it('lists stock under the branch threshold, zero stock first', () => {
    const body = buildBranchDashboard({
      branch,
      sales: [],
      lowStock: [
        { branchId: branch.id, variantId: 'v1', variantName: 'Kaos A', sku: 'KA', stock: 10, reservedStock: 8, lowStockThreshold: 5 },
        { branchId: branch.id, variantId: 'v2', variantName: 'Kaos B', sku: 'KB', stock: 3, reservedStock: 3, lowStockThreshold: 5 },
        { branchId: branch.id, variantId: 'v3', variantName: 'Kaos C', sku: 'KC', stock: 100, reservedStock: 0, lowStockThreshold: 5 },
        { branchId: branch.id, variantId: 'v4', variantName: 'Kaos D', sku: 'KD', stock: 5, reservedStock: 0, lowStockThreshold: 5 },
        { branchId: 'branch-lain', variantId: 'v9', variantName: 'Kaos Lain', sku: 'KL', stock: 0, reservedStock: 0, lowStockThreshold: 5 },
      ],
    });

    assert.strictEqual(body.lowStockCount, 3);
    assert.deepStrictEqual(
      body.lowStock.map((item) => ({ id: item.variantId, available: item.available, status: item.status })),
      [
        { id: 'v2', available: 0, status: 'out_of_stock' },
        { id: 'v1', available: 2, status: 'low_stock' },
        { id: 'v4', available: 5, status: 'low_stock' },
      ]
    );
  });

  it('sums active reservations and drops rows without reserved stock', () => {
    const body = buildBranchDashboard({
      branch,
      sales: [],
      reservations: [
        { variantId: 'v1', variantName: 'Kaos A', sku: 'KA', stock: 10, reservedStock: 4 },
        { variantId: 'v2', variantName: 'Kaos B', sku: 'KB', stock: 5, reservedStock: 0 },
        { variantId: 'v3', variantName: 'Kaos C', sku: 'KC', stock: 2, reservedStock: 5 },
      ],
    });

    assert.strictEqual(body.activeReservations.length, 2);
    assert.deepStrictEqual(
      body.activeReservations.map((row) => ({
        id: row.variantId,
        reserved: row.reservedStock,
        available: row.available,
      })),
      [
        { id: 'v3', reserved: 5, available: 0 },
        { id: 'v1', reserved: 4, available: 6 },
      ]
    );
    assert.strictEqual(body.reservedQuantity, 9);
  });

  it('reuses the BR-012 window rule', () => {
    const now = new Date('2026-11-14T00:00:00.000Z');
    const range = resolveDashboardWindow(undefined, undefined, now);

    assert.strictEqual(range.to.toISOString(), now.toISOString());
    assert.strictEqual(range.from.toISOString(), new Date('2026-10-15T00:00:00.000Z').toISOString());

    assert.throws(
      () => resolveDashboardWindow('nope', undefined),
      (err: any) =>
        err instanceof BranchAnalyticsError &&
        err.code === 'INVALID_DATE' &&
        err.status === 400
    );
    assert.throws(
      () => resolveDashboardWindow('2026-11-10', '2026-11-01'),
      (err: any) => err instanceof BranchAnalyticsError && err.code === 'INVALID_DATE_RANGE'
    );
  });
});

describe('branch dashboard route scope', () => {
  const app = createApp();
  let ipSeed = 1700;

  function request(path: string, init: RequestInit = {}) {
    ipSeed += 1;
    const headers = new Headers(init.headers);
    headers.set('x-forwarded-for', `10.46.${Math.floor(ipSeed / 250)}.${(ipSeed % 250) + 1}`);
    return app.request(path, { ...init, headers });
  }

  function bearer(token: string): Record<string, string> {
    return { Authorization: `Bearer ${token}` };
  }

  after(async () => {
    await closeRedis();
    await closeDatabase();
  });

  it('rejects an anonymous read with 401', async () => {
    const res = await request('/api/v1/branch/dashboard');
    assert.strictEqual(res.status, 401);
  });

  it('rejects a customer token with 403', async () => {
    const res = await request('/api/v1/branch/dashboard', {
      headers: bearer('mock-customer-token-customer-uuid-001'),
    });
    assert.strictEqual(res.status, 403);
  });

  it('rejects a branch admin that asks for another branch', async () => {
    const res = await request('/api/v1/branch/dashboard', {
      headers: { ...bearer('mock-branch-admin-token-branch-jogja'), 'X-Branch-Id': 'branch-bandung' },
    });
    assert.strictEqual(res.status, 403);
    const body = (await res.json()) as any;
    assert.strictEqual(body.error.code, 'BRANCH_SCOPE_MISMATCH');
  });

  it('rejects a branch admin without a linked branch', async () => {
    const res = await request('/api/v1/branch/dashboard', {
      headers: bearer('mock-branch-admin-token-'),
    });
    assert.strictEqual(res.status, 403);
    const body = (await res.json()) as any;
    assert.strictEqual(body.error.code, 'BRANCH_SCOPE_MISSING');
  });

  it('asks the pusat admin for a branch instead of guessing one', async () => {
    const res = await request('/api/v1/branch/dashboard', {
      headers: bearer('mock-admin-token'),
    });
    assert.strictEqual(res.status, 400);
    const body = (await res.json()) as any;
    assert.strictEqual(body.error.code, 'BRANCH_REQUIRED');
  });

  it('rejects a bad date before touching the database', async () => {
    const res = await request('/api/v1/branch/dashboard?from=bukan-tanggal', {
      headers: bearer('mock-branch-admin-token-branch-jogja'),
    });
    assert.strictEqual(res.status, 400);
    const body = (await res.json()) as any;
    assert.strictEqual(body.error.code, 'INVALID_DATE');
  });

  it('rejects an inverted date range before touching the database', async () => {
    const res = await request('/api/v1/branch/dashboard?from=2026-11-10&to=2026-11-01', {
      headers: bearer('mock-branch-admin-token-branch-jogja'),
    });
    assert.strictEqual(res.status, 400);
    const body = (await res.json()) as any;
    assert.strictEqual(body.error.code, 'INVALID_DATE_RANGE');
  });
});
