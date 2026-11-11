import test from 'node:test';
import assert from 'node:assert';
import {
  FinanceError,
  buildFinanceCsv,
  computeFinancialSummary,
  computeMargin,
  resolveRange,
} from '../services/finance/financeService.js';

const ORDERS = [
  {
    status: 'paid',
    totalAmount: '100000',
    discountAmount: '10000',
    shippingAmount: '5000',
    createdAt: '2026-11-01T02:00:00.000Z',
  },
  {
    status: 'delivered',
    totalAmount: '50000',
    discountAmount: '0',
    shippingAmount: '0',
    createdAt: '2026-11-03T02:00:00.000Z',
  },
  {
    status: 'cancelled',
    totalAmount: '70000',
    createdAt: '2026-11-04T02:00:00.000Z',
  },
  {
    status: 'paid',
    totalAmount: '25000',
    createdAt: '2026-10-20T02:00:00.000Z',
  },
];

test('computeFinancialSummary only counts revenue-bearing statuses', () => {
  const summary = computeFinancialSummary(ORDERS);

  assert.strictEqual(summary.orderCount, 4);
  assert.strictEqual(summary.paidOrderCount, 3);
  assert.strictEqual(summary.grossRevenue, 175000);
  assert.strictEqual(summary.discountTotal, 10000);
  assert.strictEqual(summary.shippingTotal, 5000);
  assert.strictEqual(summary.refundedTotal, 0);
  assert.strictEqual(summary.netRevenue, 175000);
  assert.strictEqual(summary.averageOrderValue, 58333.33);
});

test('computeFinancialSummary buckets orders by status', () => {
  const summary = computeFinancialSummary(ORDERS);
  const byStatus = new Map(summary.byStatus.map((row) => [row.status, row]));

  assert.strictEqual(byStatus.get('paid')?.orders, 2);
  assert.strictEqual(byStatus.get('paid')?.revenue, 125000);
  assert.strictEqual(byStatus.get('delivered')?.revenue, 50000);
  assert.strictEqual(byStatus.get('cancelled')?.revenue, 70000);
  assert.deepStrictEqual(
    summary.byStatus.map((row) => row.status),
    ['cancelled', 'delivered', 'paid']
  );
});

test('computeFinancialSummary subtracts approved refunds from net revenue', () => {
  const summary = computeFinancialSummary(ORDERS, [
    { amount: '25000', status: 'approved', createdAt: '2026-11-05T02:00:00.000Z' },
    { amount: '99999', status: 'pending', createdAt: '2026-11-06T02:00:00.000Z' },
  ]);

  assert.strictEqual(summary.refundedTotal, 25000);
  assert.strictEqual(summary.netRevenue, 150000);
});

test('computeFinancialSummary groups monthly gross, refund, and net', () => {
  const summary = computeFinancialSummary(ORDERS, [
    { amount: '25000', status: 'approved', createdAt: '2026-11-05T02:00:00.000Z' },
  ]);
  const november = summary.byMonth.find((row) => row.month === '2026-11');
  const october = summary.byMonth.find((row) => row.month === '2026-10');

  assert.ok(november);
  assert.strictEqual(november?.orders, 3);
  assert.strictEqual(november?.revenue, 150000);
  assert.strictEqual(november?.refunded, 25000);
  assert.strictEqual(november?.net, 125000);

  assert.ok(october);
  assert.strictEqual(october?.revenue, 25000);
  assert.strictEqual(october?.net, 25000);
});

test('computeFinancialSummary handles an empty ledger', () => {
  const summary = computeFinancialSummary([], []);
  assert.strictEqual(summary.orderCount, 0);
  assert.strictEqual(summary.grossRevenue, 0);
  assert.strictEqual(summary.netRevenue, 0);
  assert.strictEqual(summary.averageOrderValue, 0);
  assert.deepStrictEqual(summary.byStatus, []);
  assert.deepStrictEqual(summary.byMonth, []);
});

test('computeFinancialSummary tolerates malformed amounts and dates', () => {
  const summary = computeFinancialSummary([
    { status: 'paid', totalAmount: 'not-a-number', createdAt: 'bukan-tanggal' },
  ]);
  assert.strictEqual(summary.grossRevenue, 0);
  assert.strictEqual(summary.byMonth[0].month, 'unknown');
});

test('computeMargin reports gross profit and percentage', () => {
  assert.deepStrictEqual(computeMargin(100000, 60000), {
    revenue: 100000,
    cost: 60000,
    grossProfit: 40000,
    marginPercent: 40,
  });

  assert.strictEqual(computeMargin(0, 0).marginPercent, 0);
  assert.strictEqual(computeMargin(90000, 120000).marginPercent, -33.33);
});

test('resolveRange defaults to the last 30 days', () => {
  const range = resolveRange(null, null);
  const days = (range.to.getTime() - range.from.getTime()) / (24 * 60 * 60 * 1000);
  assert.ok(Math.abs(days - 30) < 0.01);
});

test('resolveRange accepts ISO input and rejects inverted ranges', () => {
  const range = resolveRange('2026-11-01T00:00:00.000Z', '2026-11-10T00:00:00.000Z');
  assert.strictEqual(range.from.toISOString(), '2026-11-01T00:00:00.000Z');
  assert.strictEqual(range.to.toISOString(), '2026-11-10T00:00:00.000Z');

  assert.throws(() => resolveRange('2026-11-10', '2026-11-01'), FinanceError);
  assert.throws(() => resolveRange('bukan-tanggal', null), FinanceError);
});

test('buildFinanceCsv emits one metric per line with a header', () => {
  const csv = buildFinanceCsv(computeFinancialSummary(ORDERS));
  const lines = csv.trim().split('\r\n');

  assert.strictEqual(lines[0], 'metric,value');
  assert.ok(lines.includes('grossRevenue,175000'));
  assert.ok(lines.includes('netRevenue,175000'));
  assert.strictEqual(lines.length, 9);
});
