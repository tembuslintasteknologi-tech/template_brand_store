import test from 'node:test';
import assert from 'node:assert';
import { Hono } from 'hono';
import {
  adminIpAllowlist,
  isIpAllowed,
  ipMatchesEntry,
  ipv4ToInt,
  parseIpAllowlist,
} from '../middleware/security.js';

test('parseIpAllowlist treats an empty value as allow all', () => {
  assert.deepStrictEqual(parseIpAllowlist(undefined), { entries: [], allowAll: true });
  assert.deepStrictEqual(parseIpAllowlist(''), { entries: [], allowAll: true });
  assert.deepStrictEqual(parseIpAllowlist('  ,  '), { entries: [], allowAll: true });
});

test('parseIpAllowlist splits, trims, and accepts the wildcard', () => {
  assert.deepStrictEqual(parseIpAllowlist(' 10.0.0.0/8 , 203.0.113.7 '), {
    entries: ['10.0.0.0/8', '203.0.113.7'],
    allowAll: false,
  });
  assert.deepStrictEqual(parseIpAllowlist('*'), { entries: [], allowAll: true });
});

test('ipv4ToInt rejects malformed addresses', () => {
  assert.strictEqual(ipv4ToInt('192.168.1.1'), 3232235777);
  assert.strictEqual(ipv4ToInt('256.1.1.1'), null);
  assert.strictEqual(ipv4ToInt('1.2.3'), null);
  assert.strictEqual(ipv4ToInt('abc'), null);
});

test('ipMatchesEntry handles exact addresses, CIDR, and IPv4 mapped in IPv6', () => {
  assert.strictEqual(ipMatchesEntry('203.0.113.7', '203.0.113.7'), true);
  assert.strictEqual(ipMatchesEntry('203.0.113.8', '203.0.113.7'), false);
  assert.strictEqual(ipMatchesEntry('10.42.7.9', '10.0.0.0/8'), true);
  assert.strictEqual(ipMatchesEntry('11.42.7.9', '10.0.0.0/8'), false);
  assert.strictEqual(ipMatchesEntry('10.42.7.9', '10.42.0.0/16'), true);
  assert.strictEqual(ipMatchesEntry('::1', '::1'), true);
  assert.strictEqual(ipMatchesEntry('::ffff:127.0.0.1', '127.0.0.1'), true);
});

test('isIpAllowed returns true when the list is empty', () => {
  assert.strictEqual(isIpAllowed('8.8.8.8', parseIpAllowlist('')), true);
  assert.strictEqual(isIpAllowed('8.8.8.8', parseIpAllowlist('10.0.0.0/8')), false);
});

test('adminIpAllowlist passes through when unset', async () => {
  const app = new Hono();
  app.use('*', adminIpAllowlist(''));
  app.get('/admin/ping', (c) => c.json({ ok: true }));

  const res = await app.request('/admin/ping', {
    headers: { 'x-forwarded-for': '198.51.100.77' },
  });
  assert.strictEqual(res.status, 200);
});

test('adminIpAllowlist rejects an IP outside the list with 403', async () => {
  const app = new Hono();
  app.use('*', adminIpAllowlist('10.0.0.0/8'));
  app.get('/admin/ping', (c) => c.json({ ok: true }));

  const res = await app.request('/admin/ping', {
    headers: { 'x-forwarded-for': '203.0.113.9' },
  });
  const body = (await res.json()) as any;

  assert.strictEqual(res.status, 403);
  assert.strictEqual(body.error.code, 'IP_NOT_ALLOWED');
  assert.strictEqual(body.success, false);
});

test('adminIpAllowlist allows an IP inside the CIDR block', async () => {
  const app = new Hono();
  app.use('*', adminIpAllowlist('10.0.0.0/8, 127.0.0.1'));
  app.get('/admin/ping', (c) => c.json({ ok: true }));

  const res = await app.request('/admin/ping', {
    headers: { 'x-forwarded-for': '10.9.8.7' },
  });
  assert.strictEqual(res.status, 200);
});
