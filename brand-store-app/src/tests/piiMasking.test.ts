import test from 'node:test';
import assert from 'node:assert';
import {
  MASK,
  maskEmail,
  maskIpAddress,
  maskPhone,
  maskPii,
  redactUrl,
  sanitizeLogMeta,
} from '../services/security/piiMasker.js';
import { logHttpRequest } from '../config/logger.js';

test('maskEmail keeps the first character and the domain', () => {
  assert.strictEqual(maskEmail('budi.santoso@example.com'), 'b***@example.com');
  assert.strictEqual(
    maskEmail('hubungi budi@example.com atau sari@toko.id'),
    'hubungi b***@example.com atau s***@toko.id'
  );
});

test('maskPhone hides the middle digits of Indonesian numbers', () => {
  const masked = maskPhone('+6281234567890');
  assert.ok(masked.startsWith('+628'));
  assert.ok(masked.endsWith('890'));
  assert.ok(masked.includes('*'));
  assert.ok(!masked.includes('1234567'));
});

test('maskPii removes NIK and card numbers but keeps the last four digits', () => {
  const masked = maskPii('NIK 1601234567890123 kartu 4111 1111 1111 1111');
  assert.ok(!masked.includes('1601234567890123'));
  assert.ok(!masked.includes('4111 1111 1111 1111'));
  assert.match(masked, /0123/);
  assert.match(masked, /1111/);
});

test('redactUrl replaces sensitive query values and masks PII in the rest', () => {
  const url = '/api/v1/auth/reset?token=abc123&email=budi@example.com&search=nama%20budi&page=2';
  const redacted = redactUrl(url);

  assert.ok(redacted.startsWith('/api/v1/auth/reset?'));
  assert.ok(redacted.includes(`token=${MASK}`));
  assert.ok(redacted.includes(`email=${MASK}`));
  assert.ok(!redacted.includes('budi@example.com'));
  assert.ok(redacted.includes('page=2'));
  assert.ok(!redacted.includes('abc123'));
});

test('redactUrl leaves a queryless path untouched', () => {
  assert.strictEqual(redactUrl('/api/v1/products'), '/api/v1/products');
  assert.strictEqual(redactUrl(''), '');
});

test('sanitizeLogMeta masks nested PII and sensitive keys', () => {
  const sanitized = sanitizeLogMeta({
    email: 'budi@example.com',
    nested: { phone: '+6281234567890', note: 'hubungi budi@example.com' },
    count: 3,
    ok: true,
  }) as any;

  assert.strictEqual(sanitized.email, MASK);
  assert.strictEqual(sanitized.nested.phone, MASK);
  assert.strictEqual(sanitized.nested.note, 'hubungi b***@example.com');
  assert.strictEqual(sanitized.count, 3);
  assert.strictEqual(sanitized.ok, true);
});

test('sanitizeLogMeta truncates deep structures instead of recursing forever', () => {
  const deep = { a: { b: { c: { d: { e: 'value' } } } } };
  const sanitized = sanitizeLogMeta(deep) as any;
  assert.strictEqual(sanitized.a.b.c.d, '[truncated]');
});

test('maskIpAddress hides the last octet and last IPv6 segment', () => {
  assert.strictEqual(maskIpAddress('203.0.113.9'), '203.0.113.***');
  assert.strictEqual(maskIpAddress('2001:db8:85a3::8a2e'), '2001:db8:85a3::****');
});

test('logHttpRequest writes a redacted URL', () => {
  const lines: string[] = [];
  const original = console.log;
  console.log = (...args: unknown[]) => {
    lines.push(args.map(String).join(' '));
  };
  try {
    logHttpRequest(
      { method: 'get', url: '/api/v1/auth/reset?token=secret-token&email=budi@example.com' },
      { status: 200 },
      12
    );
  } finally {
    console.log = original;
  }

  assert.strictEqual(lines.length, 1);
  assert.ok(lines[0].includes('[HTTP] GET /api/v1/auth/reset?'));
  assert.ok(!lines[0].includes('secret-token'));
  assert.ok(!lines[0].includes('budi@example.com'));
  assert.ok(lines[0].includes('200 (12ms)'));
});
