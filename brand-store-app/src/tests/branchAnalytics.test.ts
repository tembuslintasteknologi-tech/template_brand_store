import test from 'node:test';
import assert from 'node:assert';
import {
  DEFAULT_ANALYTICS_DAYS,
  BranchAnalyticsError,
  buildBranchAnalytics,
  resolveAnalyticsWindow,
} from '../services/admin/branchAnalytics.js';

const branches = [
  { id: 'branch-b', code: 'CBG-B', name: 'Cabang B', city: 'Bandung', type: 'cabang' },
  { id: 'pusat', code: 'PUSAT', name: 'Pusat', city: 'Jakarta', type: 'pusat' },
  { id: 'branch-a', code: 'CBG-A', name: 'Cabang A', city: 'Bekasi', type: 'cabang' },
];

const sales = [
  { orderId: 'order-1', branchId: 'branch-a', quantity: 2, totalPrice: '200000.00', orderStatus: 'paid' },
  { orderId: 'order-1', branchId: 'branch-a', quantity: 1, totalPrice: 100000, orderStatus: 'paid' },
  { orderId: 'order-2', branchId: 'branch-b', quantity: 1, totalPrice: '50000.00', orderStatus: 'shipped' },
  { orderId: 'order-3', branchId: 'branch-a', quantity: 5, totalPrice: '400000.00', orderStatus: 'pending' },
  { orderId: 'order-4', branchId: null, quantity: 2, totalPrice: '30000.00', orderStatus: 'delivered' },
  { orderId: 'order-5', branchId: 'branch-a', quantity: 1, totalPrice: '10000.00', orderStatus: 'paid' },
  { orderId: 'order-5', branchId: 'branch-b', quantity: 1, totalPrice: '10000.00', orderStatus: 'paid' },
];

const refunds = [
  { orderId: 'order-1', amount: '50000.00', status: 'approved' },
  { orderId: 'order-5', amount: '20000.00', status: 'processed' },
  { orderId: 'order-2', amount: '10000.00', status: 'pending' },
  { orderId: 'order-99', amount: '5000.00', status: 'completed' },
  { orderId: 'order-4', amount: '2500.00', status: 'succeeded' },
];

const orderBranches = [
  { orderId: 'order-1', branchId: 'branch-a' },
  { orderId: 'order-2', branchId: 'branch-b' },
  { orderId: 'order-4', branchId: null },
  { orderId: 'order-5', branchId: 'branch-a' },
  { orderId: 'order-5', branchId: 'branch-b' },
];

const lowStock = [
  {
    branchId: 'branch-a',
    variantId: 'v1',
    variantName: 'Kaos A',
    sku: 'KA',
    stock: 10,
    reservedStock: 8,
    lowStockThreshold: 5,
  },
  {
    branchId: 'branch-a',
    variantId: 'v2',
    variantName: 'Kaos B',
    sku: 'KB',
    stock: 3,
    reservedStock: 3,
    lowStockThreshold: 5,
  },
  {
    branchId: 'branch-a',
    variantId: 'v3',
    variantName: 'Kaos C',
    sku: 'KC',
    stock: 100,
    reservedStock: 0,
    lowStockThreshold: 5,
  },
  {
    branchId: 'branch-b',
    variantId: 'v4',
    variantName: 'Kaos D',
    sku: 'KD',
    stock: 5,
    reservedStock: 0,
    lowStockThreshold: 5,
  },
  {
    branchId: 'branch-ghost',
    variantId: 'v9',
    variantName: 'Kaos Hantu',
    sku: 'KH',
    stock: 0,
    reservedStock: 0,
    lowStockThreshold: 5,
  },
];

const isAnalyticsCode = (code: string) => (err: any) => {
  assert.strictEqual(err.name, 'BranchAnalyticsError');
  assert.strictEqual(err.code, code);
  assert.strictEqual(err.status, 400);
  return true;
};

test('resolveAnalyticsWindow defaults to the last 30 days', () => {
  const now = new Date('2026-11-14T00:00:00.000Z');
  const range = resolveAnalyticsWindow(undefined, undefined, now);

  assert.strictEqual(DEFAULT_ANALYTICS_DAYS, 30);
  assert.strictEqual(range.to.toISOString(), now.toISOString());
  assert.strictEqual(
    range.from.toISOString(),
    new Date('2026-10-15T00:00:00.000Z').toISOString()
  );
});

test('resolveAnalyticsWindow accepts ISO bounds and rejects bad input', () => {
  const range = resolveAnalyticsWindow('2026-11-01', '2026-11-10T23:59:59.000Z');
  assert.strictEqual(range.from.toISOString(), new Date('2026-11-01').toISOString());
  assert.strictEqual(range.to.toISOString(), '2026-11-10T23:59:59.000Z');

  assert.throws(() => resolveAnalyticsWindow('not-a-date', undefined), isAnalyticsCode('INVALID_DATE'));
  assert.throws(
    () => resolveAnalyticsWindow('2026-11-10', '2026-11-01'),
    isAnalyticsCode('INVALID_DATE_RANGE')
  );
  assert.ok(new BranchAnalyticsError('INVALID_DATE', 'x') instanceof Error);
});

test('buildBranchAnalytics keeps zero-order branches and sorts pusat first', () => {
  const { branches: entries } = buildBranchAnalytics({
    branches,
    sales: [],
    fallbackBranchId: 'pusat',
  });

  assert.deepStrictEqual(
    entries.map((entry) => entry.branchId),
    ['pusat', 'branch-a', 'branch-b']
  );
  for (const entry of entries) {
    assert.strictEqual(entry.orderCount, 0);
    assert.strictEqual(entry.itemCount, 0);
    assert.strictEqual(entry.grossSales, 0);
    assert.strictEqual(entry.averageOrderValue, 0);
    assert.strictEqual(entry.netSales, 0);
    assert.strictEqual(entry.lowStockCount, 0);
  }
});

test('buildBranchAnalytics recognises revenue statuses only', () => {
  const { branches: entries, rollup } = buildBranchAnalytics({
    branches,
    sales,
    fallbackBranchId: 'pusat',
  });

  const byId = new Map(entries.map((entry) => [entry.branchId, entry]));

  const a = byId.get('branch-a')!;
  assert.strictEqual(a.orderCount, 2);
  assert.strictEqual(a.itemCount, 4);
  assert.strictEqual(a.grossSales, 310000);
  assert.strictEqual(a.averageOrderValue, 155000);

  const b = byId.get('branch-b')!;
  assert.strictEqual(b.orderCount, 2);
  assert.strictEqual(b.itemCount, 2);
  assert.strictEqual(b.grossSales, 60000);
  assert.strictEqual(b.averageOrderValue, 30000);

  // Legacy null branch lines land on the pusat fallback.
  const pusat = byId.get('pusat')!;
  assert.strictEqual(pusat.orderCount, 1);
  assert.strictEqual(pusat.itemCount, 2);
  assert.strictEqual(pusat.grossSales, 30000);

  // The pending order-3 (400000) never reaches gross sales or item count.
  assert.strictEqual(rollup.orderCount, 4);
  assert.strictEqual(rollup.itemCount, 8);
  assert.strictEqual(rollup.grossSales, 400000);
  assert.strictEqual(rollup.averageOrderValue, 100000);
  assert.strictEqual(rollup.unassignedSales, 0);
});

test('buildBranchAnalytics rounds AOV to two decimals', () => {
  const { branches: entries } = buildBranchAnalytics({
    branches: [branches[2]],
    sales: [
      { orderId: 'o-1', branchId: 'branch-a', quantity: 1, totalPrice: '100.00', orderStatus: 'paid' },
      { orderId: 'o-2', branchId: 'branch-a', quantity: 1, totalPrice: '100.00', orderStatus: 'paid' },
      { orderId: 'o-3', branchId: 'branch-a', quantity: 1, totalPrice: '100.00', orderStatus: 'paid' },
    ],
  });

  assert.strictEqual(entries[0].grossSales, 300);
  assert.strictEqual(entries[0].averageOrderValue, 100);
});

test('buildBranchAnalytics attributes refunds only to single-branch orders', () => {
  const { branches: entries, rollup } = buildBranchAnalytics({
    branches,
    sales,
    refunds,
    orderBranches,
    fallbackBranchId: 'pusat',
  });

  const byId = new Map(entries.map((entry) => [entry.branchId, entry]));

  assert.strictEqual(byId.get('branch-a')!.refundedTotal, 50000);
  assert.strictEqual(byId.get('branch-a')!.netSales, 260000);

  assert.strictEqual(byId.get('branch-b')!.refundedTotal, 0);
  assert.strictEqual(byId.get('branch-b')!.netSales, 60000);

  // order-4 has a null branch line, resolved to the pusat fallback.
  assert.strictEqual(byId.get('pusat')!.refundedTotal, 2500);
  assert.strictEqual(byId.get('pusat')!.netSales, 27500);

  // order-5 spans two branches and order-99 has no branch map, so both stay unallocated.
  // The pending refund on order-2 is not settled and is ignored entirely.
  assert.strictEqual(rollup.unallocatedRefundTotal, 25000);
  assert.strictEqual(rollup.refundedTotal, 77500);
  assert.strictEqual(rollup.netSales, 322500);
});

test('buildBranchAnalytics groups low stock per branch and drops healthy rows', () => {
  const { branches: entries, rollup } = buildBranchAnalytics({
    branches,
    sales: [],
    lowStock,
  });

  const byId = new Map(entries.map((entry) => [entry.branchId, entry]));

  const a = byId.get('branch-a')!;
  assert.strictEqual(a.lowStockCount, 2);
  assert.deepStrictEqual(
    a.lowStockItems.map((item) => ({ id: item.variantId, available: item.available, status: item.status })),
    [
      { id: 'v2', available: 0, status: 'out_of_stock' },
      { id: 'v1', available: 2, status: 'low_stock' },
    ]
  );

  const b = byId.get('branch-b')!;
  assert.strictEqual(b.lowStockCount, 1);
  assert.strictEqual(b.lowStockItems[0].status, 'low_stock');
  assert.strictEqual(b.lowStockItems[0].available, 5);

  // Row from an unknown branch is ignored, both in the branch row and the rollup.
  assert.strictEqual(rollup.lowStockCount, 3);
});

test('buildBranchAnalytics counts multi-branch orders once in the rollup', () => {
  const { rollup } = buildBranchAnalytics({
    branches,
    sales: [
      { orderId: 'order-x', branchId: 'branch-a', quantity: 1, totalPrice: '10000.00', orderStatus: 'paid' },
      { orderId: 'order-x', branchId: 'branch-b', quantity: 2, totalPrice: '20000.00', orderStatus: 'paid' },
    ],
  });

  assert.strictEqual(rollup.orderCount, 1);
  assert.strictEqual(rollup.itemCount, 3);
  assert.strictEqual(rollup.grossSales, 30000);
  assert.strictEqual(rollup.averageOrderValue, 30000);
});

test('buildBranchAnalytics reports lines without a branch as unassigned sales', () => {
  const { branches: entries, rollup } = buildBranchAnalytics({
    branches,
    sales: [
      { orderId: 'legacy-1', branchId: null, quantity: 2, totalPrice: '40000.00', orderStatus: 'paid' },
    ],
  });

  assert.strictEqual(rollup.orderCount, 1);
  assert.strictEqual(rollup.itemCount, 2);
  assert.strictEqual(rollup.grossSales, 40000);
  assert.strictEqual(rollup.unassignedSales, 40000);
  assert.strictEqual(
    entries.reduce((total, entry) => total + entry.grossSales, 0),
    0
  );
});

test('branch analytics route is mounted and rejects branch_admin with 403', async () => {
  const { createApp } = await import('../app.js');
  const { signAccessToken } = await import('../middleware/auth.js');
  const app = createApp();

  const anonymous = await app.request('/api/v1/admin/analytics/branches');
  assert.strictEqual(anonymous.status, 401);

  const token = signAccessToken({ id: 'u-branch', role: 'branch_admin', branchId: 'branch-a' });
  const res = await app.request('/api/v1/admin/analytics/branches', {
    headers: { authorization: `Bearer ${token}` },
  });
  const body = (await res.json()) as any;

  assert.strictEqual(res.status, 403);
  assert.strictEqual(body.success, false);
  assert.strictEqual(body.error.code, 'FORBIDDEN');
});

