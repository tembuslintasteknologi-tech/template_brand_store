import { describe, it, after } from 'node:test';
import assert from 'node:assert';
import { createApp } from '../app.js';
import { signAccessToken } from '../middleware/auth.js';
import { closeRedis } from '../config/redis.js';
import { closeDatabase } from '../db/index.js';

const app = createApp();

// Every request gets its own forwarded IP so the Redis rate limiter windows never
// collide with other suites or with earlier manual runs.
let ipSeed = 0;
function ip(): string {
  ipSeed += 1;
  return `10.42.${Math.floor(ipSeed / 250)}.${(ipSeed % 250) + 1}`;
}

function request(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set('x-forwarded-for', ip());
  return app.request(path, { ...init, headers });
}

after(async () => {
  await closeRedis();
  await closeDatabase();
});

describe('app wiring', () => {
  it('serves /health with per-dependency checks', async () => {
    const res = await request('/health');
    const body = (await res.json()) as any;

    assert.strictEqual(res.status, 200);
    assert.strictEqual(body.success, true);
    assert.strictEqual(body.data.service, 'brand-store-api');
    assert.ok(['ok', 'degraded'].includes(body.data.status));
    assert.ok(['up', 'down'].includes(body.data.checks.database));
    assert.ok(['up', 'down'].includes(body.data.checks.redis));
    assert.ok(['up', 'down'].includes(body.data.checks.storage));
  });

  it('returns a structured 404 for unknown routes', async () => {
    const res = await request('/api/v1/does-not-exist');
    const body = (await res.json()) as any;

    assert.strictEqual(res.status, 404);
    assert.strictEqual(body.success, false);
    assert.strictEqual(body.error.code, 'NOT_FOUND');
    assert.ok(body.error.requestId);
  });

  it('keeps the legacy /api prefix unmounted so clients use /api/v1', async () => {
    const res = await request('/api/auth/login', { method: 'POST' });
    assert.strictEqual(res.status, 404);
  });

  it('requires authentication on protected v1 routes', async () => {
    const res = await request('/api/v1/orders/my-orders');
    const body = (await res.json()) as any;

    assert.strictEqual(res.status, 401);
    assert.strictEqual(body.error.code, 'UNAUTHORIZED');
  });

  it('rejects customer tokens on the admin route group with 403', async () => {
    const token = signAccessToken({ id: 'c-1', email: 'c@example.com', role: 'customer' });
    const res = await request('/api/v1/admin/dashboard', {
      headers: { Authorization: `Bearer ${token}` },
    });
    const body = (await res.json()) as any;

    assert.strictEqual(res.status, 403);
    assert.strictEqual(body.error.code, 'FORBIDDEN');
  });

  it('rejects an invalid bearer token on the admin route group with 401', async () => {
    const res = await request('/api/v1/admin/dashboard', {
      headers: { Authorization: 'Bearer not-a-jwt' },
    });
    assert.strictEqual(res.status, 401);
  });

  it('validates the login payload before touching the database', async () => {
    const res = await request('/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'not-an-email' }),
    });
    const body = (await res.json()) as any;

    assert.strictEqual(res.status, 400);
    assert.strictEqual(body.error.code, 'VALIDATION_ERROR');
    assert.ok(Array.isArray(body.error.details));
  });

  it('validates the promo payload before touching the database', async () => {
    const res = await request('/api/v1/promos/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subtotal: -1, codes: [] }),
    });
    const body = (await res.json()) as any;

    assert.strictEqual(res.status, 400);
    assert.strictEqual(body.error.code, 'VALIDATION_ERROR');
  });

  it('always echoes the correlation id on errors', async () => {
    const res = await request('/nope', { headers: { 'x-correlation-id': 'corr-42' } });
    assert.strictEqual(res.headers.get('x-correlation-id'), 'corr-42');
    const body = (await res.json()) as any;
    assert.strictEqual(body.error.requestId, 'corr-42');
  });

  it('returns 404 for the legacy /checkout endpoint that was never implemented', async () => {
    const res = await request('/api/v1/checkout/legacy-process', { method: 'POST' });
    assert.strictEqual(res.status, 404);
  });
});
