import { describe, it, after } from 'node:test';
import assert from 'node:assert';
import { Hono } from 'hono';
import {
  correlationIdMiddleware,
  securityHeadersMiddleware,
  rateLimiter,
  consumeRateLimit,
  RATE_LIMITS,
  clientIp,
} from '../middleware/security.js';
import { closeRedis } from '../config/redis.js';

after(async () => {
  await closeRedis();
});

describe('correlationIdMiddleware', () => {
  it('generates a correlation id and mirrors it into response headers', async () => {
    const app = new Hono();
    app.use('*', correlationIdMiddleware());
    app.get('/test', (c) => c.json({ requestId: c.get('requestId') }));

    const res = await app.request('/test');
    const body = (await res.json()) as any;

    assert.strictEqual(res.status, 200);
    assert.ok(res.headers.get('x-correlation-id'));
    assert.strictEqual(res.headers.get('x-correlation-id'), body.requestId);
    assert.strictEqual(res.headers.get('x-request-id'), body.requestId);
  });

  it('reuses an inbound correlation id', async () => {
    const app = new Hono();
    app.use('*', correlationIdMiddleware());
    app.get('/test', (c) => c.json({ requestId: c.get('requestId') }));

    const res = await app.request('/test', { headers: { 'x-correlation-id': 'abc-123' } });
    const body = (await res.json()) as any;

    assert.strictEqual(res.headers.get('x-correlation-id'), 'abc-123');
    assert.strictEqual(body.requestId, 'abc-123');
  });

  it('ignores an oversized inbound correlation id', async () => {
    const app = new Hono();
    app.use('*', correlationIdMiddleware());
    app.get('/test', (c) => c.json({ requestId: c.get('requestId') }));

    const huge = 'x'.repeat(500);
    const res = await app.request('/test', { headers: { 'x-correlation-id': huge } });
    const body = (await res.json()) as any;

    assert.notStrictEqual(body.requestId, huge);
  });
});

describe('securityHeadersMiddleware', () => {
  it('sets hardening headers', async () => {
    const app = new Hono();
    app.use('*', securityHeadersMiddleware());
    app.get('/test', (c) => c.text('ok'));

    const res = await app.request('/test');
    assert.strictEqual(res.headers.get('x-content-type-options'), 'nosniff');
    assert.strictEqual(res.headers.get('x-frame-options'), 'DENY');
    assert.strictEqual(res.headers.get('referrer-policy'), 'no-referrer');
    assert.match(res.headers.get('content-security-policy') || '', /frame-ancestors 'none'/);
  });
});

describe('rate limit rules', () => {
  it('matches the documented per-scope limits', () => {
    assert.strictEqual(RATE_LIMITS.auth.limit, 5);
    assert.strictEqual(RATE_LIMITS.api.limit, 100);
    assert.strictEqual(RATE_LIMITS.search.limit, 30);
    assert.strictEqual(RATE_LIMITS.webhook.limit, 1000);
  });

  it('derives the client ip from forwarding headers', async () => {
    const app = new Hono();
    app.get('/ip', (c) => c.json({ ip: clientIp(c) }));

    const res = await app.request('/ip', {
      headers: { 'x-forwarded-for': '203.0.113.9, 10.0.0.1' },
    });
    const body = (await res.json()) as any;
    assert.strictEqual(body.ip, '203.0.113.9');
  });

  it('429s once the window limit is exhausted', async () => {
    const app = new Hono();
    app.use('/limited/*', rateLimiter('auth', { limit: 2, windowSeconds: 30 }));
    app.get('/limited/ping', (c) => c.json({ success: true }));

    const headers = { 'x-forwarded-for': `198.51.100.${Math.floor(Math.random() * 200) + 1}` };

    const first = await app.request('/limited/ping', { headers });
    const second = await app.request('/limited/ping', { headers });
    const third = await app.request('/limited/ping', { headers });

    assert.strictEqual(first.status, 200);
    assert.strictEqual(second.status, 200);
    assert.strictEqual(third.status, 429);

    const body = (await third.json()) as any;
    assert.strictEqual(body.error.code, 'RATE_LIMITED');
    assert.ok(third.headers.get('retry-after'));
  });

  it('counts requests through the shared Redis store', async () => {
    const identifier = `unit-test-${Date.now()}-${Math.random()}`;
    const first = await consumeRateLimit('search', identifier, { limit: 2, windowSeconds: 30 });
    const second = await consumeRateLimit('search', identifier, { limit: 2, windowSeconds: 30 });
    const third = await consumeRateLimit('search', identifier, { limit: 2, windowSeconds: 30 });

    assert.ok(first && second && third, 'Redis must be reachable for this assertion');
    assert.strictEqual(first.allowed, true);
    assert.strictEqual(second.allowed, true);
    assert.strictEqual(third.allowed, false);
    assert.strictEqual(third.remaining, 0);
  });
});
