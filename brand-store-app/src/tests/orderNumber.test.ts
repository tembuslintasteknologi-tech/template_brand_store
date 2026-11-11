import { describe, it } from 'node:test';
import assert from 'node:assert';
import { formatOrderNumber, parseOrderNumber, orderNumberPrefix } from '../services/orderNumber.js';

const date = new Date('2026-11-10T03:00:00Z');

describe('orderNumber', () => {
  it('formats an order number as INV/YYYY/MM/NNNNNN', () => {
    assert.strictEqual(formatOrderNumber(1, date), 'INV/2026/11/000001');
    assert.strictEqual(formatOrderNumber(123456, date), 'INV/2026/11/123456');
  });

  it('pads the sequence to six digits', () => {
    assert.strictEqual(formatOrderNumber(42, date), 'INV/2026/11/000042');
  });

  it('rejects non positive sequences', () => {
    assert.throws(() => formatOrderNumber(0), /positive integer/);
    assert.throws(() => formatOrderNumber(-3), /positive integer/);
    assert.throws(() => formatOrderNumber(1.5), /positive integer/);
  });

  it('exposes the monthly prefix', () => {
    assert.strictEqual(orderNumberPrefix(date), 'INV/2026/11/');
  });

  it('round trips through parseOrderNumber', () => {
    const parsed = parseOrderNumber(formatOrderNumber(7, date));
    assert.deepStrictEqual(parsed, { period: '2026/11', sequence: 7 });
  });

  it('returns null for unknown formats', () => {
    assert.strictEqual(parseOrderNumber('ORD-1234'), null);
    assert.strictEqual(parseOrderNumber('INV/2026/11/1'), null);
  });
});
