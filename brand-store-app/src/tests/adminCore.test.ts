import test from 'node:test';
import assert from 'node:assert';
import { buildCsv, buildExport, escapeCsvValue, unsupportedFormatError } from '../services/admin/reports.js';
import { fillDailySeries } from '../services/admin/dashboard.js';
import { classifyStock } from '../services/admin/alerts.js';
import { isUuid } from '../services/admin/auditLog.js';

test('escapeCsvValue quotes commas, quotes and newlines', () => {
  assert.strictEqual(escapeCsvValue('plain'), 'plain');
  assert.strictEqual(escapeCsvValue('a,b'), '"a,b"');
  assert.strictEqual(escapeCsvValue('say "hi"'), '"say ""hi"""');
  assert.strictEqual(escapeCsvValue('line1\nline2'), '"line1\nline2"');
  assert.strictEqual(escapeCsvValue(null), '');
  assert.strictEqual(escapeCsvValue(undefined), '');
  assert.strictEqual(escapeCsvValue({ a: 1 }), '"{""a"":1}"');
});

test('buildCsv writes a header row and one line per record', () => {
  const columns = [
    { key: 'orderNumber' as const, header: 'order_number' },
    { key: 'totalAmount' as const, header: 'total_amount' },
  ];
  const csv = buildCsv([{ orderNumber: 'ORD-1', totalAmount: '15000.00' }], columns);
  assert.strictEqual(csv, 'order_number,total_amount\r\nORD-1,15000.00\r\n');
});

test('buildExport produces a BOM csv file name and json payload', () => {
  const stamp = new Date('2026-11-10T10:00:00.000Z');
  const rows = [{ id: 'p1', title: 'Kaos' }];
  const columns = [
    { key: 'id' as const, header: 'id' },
    { key: 'title' as const, header: 'title' },
  ];

  const csv = buildExport('products', 'csv', rows, columns, stamp);
  assert.strictEqual(csv.filename, 'products-2026-11-10.csv');
  assert.match(csv.contentType, /text\/csv/);
  assert.ok(csv.body.startsWith('\uFEFF'));
  assert.match(csv.body, /p1,Kaos/);

  const json = buildExport('products', 'json', rows, columns, stamp);
  assert.strictEqual(json.filename, 'products-2026-11-10.json');
  assert.match(json.contentType, /application\/json/);
  const parsed = JSON.parse(json.body);
  assert.strictEqual(parsed.rowCount, 1);
  assert.strictEqual(parsed.rows[0].title, 'Kaos');
});

test('unsupportedFormatError explains which formats exist', () => {
  const message = unsupportedFormatError('xlsx');
  assert.match(message, /xlsx/);
  assert.match(message, /csv, json/);
});

test('fillDailySeries fills missing days with zero and keeps order', () => {
  const from = new Date('2026-11-08T00:00:00.000Z');
  const to = new Date('2026-11-10T00:00:00.000Z');
  const series = fillDailySeries(
    [
      { date: '2026-11-08', orders: 2, revenue: '30000.00' },
      { date: '2026-11-10', orders: '1', revenue: 15000 },
    ],
    from,
    to
  );

  assert.deepStrictEqual(series, [
    { date: '2026-11-08', orders: 2, revenue: 30000 },
    { date: '2026-11-09', orders: 0, revenue: 0 },
    { date: '2026-11-10', orders: 1, revenue: 15000 },
  ]);
});

test('classifyStock separates critical, warning and ok', () => {
  assert.strictEqual(classifyStock(0, 5), 'critical');
  assert.strictEqual(classifyStock(-3, 5), 'critical');
  assert.strictEqual(classifyStock(5, 5), 'warning');
  assert.strictEqual(classifyStock(1, 5), 'warning');
  assert.strictEqual(classifyStock(6, 5), 'ok');
});


test('isUuid rejects mock actor identifiers so audit rows never fail on cast', () => {
  assert.strictEqual(isUuid('7b0165bd-e389-4394-92de-32f8c4d5b61b'), true);
  assert.strictEqual(isUuid('admin-uuid-001'), false);
  assert.strictEqual(isUuid('mock-customer-token-1'), false);
  assert.strictEqual(isUuid(''), false);
  assert.strictEqual(isUuid(null), false);
  assert.strictEqual(isUuid(undefined), false);
});
