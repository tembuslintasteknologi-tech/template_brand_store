import test from 'node:test';
import assert from 'node:assert';
import {
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  PaginationError,
  buildCursorPage,
  clampPageSize,
  decodeCursor,
  encodeCursor,
  parseFields,
  projectRow,
} from '../utils/pagination.js';

test('clampPageSize keeps the default on junk and caps the ceiling', () => {
  assert.strictEqual(clampPageSize(undefined), DEFAULT_PAGE_SIZE);
  assert.strictEqual(clampPageSize('abc'), DEFAULT_PAGE_SIZE);
  assert.strictEqual(clampPageSize('0'), DEFAULT_PAGE_SIZE);
  assert.strictEqual(clampPageSize('-5'), DEFAULT_PAGE_SIZE);
  assert.strictEqual(clampPageSize('25'), 25);
  assert.strictEqual(clampPageSize('25.9'), 25);
  assert.strictEqual(clampPageSize(MAX_PAGE_SIZE + 500), MAX_PAGE_SIZE);
  assert.strictEqual(clampPageSize('500', 20, 50), 50);
});

test('encodeCursor and decodeCursor round trip the createdAt plus id pair', () => {
  const cursor = encodeCursor({ createdAt: '2026-11-10T12:00:00.000Z', id: 'row-1' });
  assert.ok(cursor);
  const decoded = decodeCursor(cursor);
  assert.deepStrictEqual(decoded, { createdAt: '2026-11-10T12:00:00.000Z', id: 'row-1' });
});

test('encodeCursor normalises a Date instance and refuses rows without an id', () => {
  const fromDate = encodeCursor({ createdAt: new Date('2026-11-10T12:00:00.000Z'), id: 'row-2' });
  assert.deepStrictEqual(decodeCursor(fromDate), { createdAt: '2026-11-10T12:00:00.000Z', id: 'row-2' });
  assert.strictEqual(encodeCursor({ createdAt: '2026-11-10T12:00:00.000Z' }), null);
  assert.strictEqual(encodeCursor({ createdAt: 'not-a-date', id: 'row-3' }), null);
});

test('decodeCursor accepts an absent cursor but rejects a malformed one', () => {
  assert.strictEqual(decodeCursor(undefined), null);
  assert.strictEqual(decodeCursor(null), null);
  assert.strictEqual(decodeCursor(''), null);
  assert.strictEqual(decodeCursor('   '), null);
  assert.throws(() => decodeCursor(Buffer.from('no-separator').toString('base64url')), PaginationError);
  assert.throws(() => decodeCursor(Buffer.from('2026-11-10T12:00:00.000Z|').toString('base64url')), PaginationError);
  assert.throws(() => decodeCursor(Buffer.from('nope|row-1').toString('base64url')), PaginationError);
});

test('parseFields splits, trims and de-duplicates', () => {
  assert.strictEqual(parseFields(undefined), null);
  assert.strictEqual(parseFields(''), null);
  assert.strictEqual(parseFields(' , , '), null);
  assert.deepStrictEqual(parseFields('id, title ,price'), ['id', 'title', 'price']);
  assert.deepStrictEqual(parseFields('id,id,title'), ['id', 'title']);
});

test('projectRow narrows to known keys and ignores typos', () => {
  const row = { id: 'p1', title: 'Kaos', price: 99000, internalCost: 40000 };
  assert.deepStrictEqual(projectRow(row, ['id', 'title']), { id: 'p1', title: 'Kaos' });
  assert.deepStrictEqual(projectRow(row, ['id', 'nope']), { id: 'p1' });
  assert.strictEqual(projectRow(row, null), row);
  assert.strictEqual(projectRow(row, []), row);
});

test('buildCursorPage reports hasMore from the extra row and stops at the limit', () => {
  const rows = [
    { id: 'c', createdAt: '2026-11-10T12:00:00.000Z' },
    { id: 'b', createdAt: '2026-11-10T11:00:00.000Z' },
    { id: 'a', createdAt: '2026-11-10T10:00:00.000Z' },
  ];

  const first = buildCursorPage(rows, 2);
  assert.deepStrictEqual(first.items.map((row: any) => row.id), ['c', 'b']);
  assert.strictEqual(first.hasMore, true);
  assert.strictEqual(first.limit, 2);
  assert.deepStrictEqual(decodeCursor(first.nextCursor), { createdAt: '2026-11-10T11:00:00.000Z', id: 'b' });

  const last = buildCursorPage(rows, 3);
  assert.strictEqual(last.items.length, 3);
  assert.strictEqual(last.hasMore, false);
  assert.strictEqual(last.nextCursor, null);
});

test('buildCursorPage applies field projection after slicing', () => {
  const rows = [
    { id: 'b', createdAt: '2026-11-10T12:00:00.000Z', title: 'B', price: 2 },
    { id: 'a', createdAt: '2026-11-10T11:00:00.000Z', title: 'A', price: 1 },
  ];
  const page = buildCursorPage(rows, 2, { fields: ['id', 'title'] });
  assert.deepStrictEqual(page.items, [
    { id: 'b', title: 'B' },
    { id: 'a', title: 'A' },
  ]);
  assert.strictEqual(page.hasMore, false);
});

test('buildCursorPage returns an empty page for no rows', () => {
  const page = buildCursorPage([], 20);
  assert.deepStrictEqual(page.items, []);
  assert.strictEqual(page.nextCursor, null);
  assert.strictEqual(page.hasMore, false);
});
