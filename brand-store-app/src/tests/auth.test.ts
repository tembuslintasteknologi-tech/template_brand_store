import { describe, it, after } from 'node:test';
import assert from 'node:assert';
import { Hono } from 'hono';
import {
  signJwt,
  signAccessToken,
  signRefreshToken,
  verifyJwt,
  verifyAccessToken,
  verifyRefreshToken,
  authMiddleware,
  adminOnlyMiddleware,
  requireRole,
  signToken,
  revokeToken,
  isTokenRevoked,
  clearRevocationCache,
} from '../middleware/auth.js';
import { closeRedis } from '../config/redis.js';

const customer = { id: 'user-1', email: 'customer@example.com', role: 'customer' as const };
const admin = { id: 'user-2', email: 'admin@example.com', role: 'admin' as const };

after(async () => {
  clearRevocationCache();
  await closeRedis();
});

describe('JWT core', () => {
  it('signs and verifies an access token', () => {
    const token = signAccessToken(customer);
    assert.match(token, /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);

    const payload = verifyAccessToken(token);
    assert.strictEqual(payload.sub, customer.id);
    assert.strictEqual(payload.email, customer.email);
    assert.strictEqual(payload.role, 'customer');
    assert.strictEqual(payload.typ, 'access');
    assert.ok(payload.jti.length > 0);
  });

  it('uses a 15 minute access token and 7 day refresh token lifetime', () => {
    const access = verifyAccessToken(signAccessToken(customer));
    const refresh = verifyRefreshToken(signRefreshToken(customer));

    assert.strictEqual(access.exp - access.iat, 900);
    assert.strictEqual(refresh.exp - refresh.iat, 604800);
  });

  it('rejects a tampered signature', () => {
    const token = signAccessToken(customer);
    const tampered = token.slice(0, -4) + 'AAAA';
    assert.throws(() => verifyAccessToken(tampered), /Invalid signature/);
  });

  it('rejects a token signed with the refresh secret when used as access token', () => {
    const refreshToken = signRefreshToken(customer);
    assert.throws(() => verifyAccessToken(refreshToken), /Invalid signature/);
  });

  it('rejects an expired token', () => {
    const expired = signToken(customer, 'access', -30);
    assert.throws(() => verifyAccessToken(expired), /Token expired/);
  });

  it('rejects malformed tokens', () => {
    assert.throws(() => verifyJwt('not-a-token'), /Invalid token format/);
    assert.throws(() => verifyJwt('a.b'), /Invalid token format/);
  });

  it('keeps the legacy signJwt helper usable', () => {
    const token = signJwt({ role: 'admin' });
    const payload = verifyJwt(token) as unknown as { role: string; exp: number };
    assert.strictEqual(payload.role, 'admin');
    assert.ok(payload.exp > Math.floor(Date.now() / 1000));
  });
});

describe('authMiddleware', () => {
  const buildApp = () => {
    const app = new Hono();
    app.use('/protected/*', authMiddleware);
    app.get('/protected/resource', (c) => c.json({ success: true, user: c.get('user') }));
    return app;
  };

  it('returns 401 without an Authorization header', async () => {
    const res = await buildApp().request('/protected/resource');
    assert.strictEqual(res.status, 401);
    const body = (await res.json()) as any;
    assert.strictEqual(body.error.code, 'UNAUTHORIZED');
  });

  it('returns 401 for a malformed token', async () => {
    const res = await buildApp().request('/protected/resource', {
      headers: { Authorization: 'Bearer garbage' },
    });
    assert.strictEqual(res.status, 401);
  });

  it('exposes the authenticated user for a valid token', async () => {
    const token = signAccessToken(customer);
    const res = await buildApp().request('/protected/resource', {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.strictEqual(res.status, 200);
    const body = (await res.json()) as any;
    assert.strictEqual(body.user.id, customer.id);
    assert.strictEqual(body.user.role, 'customer');
  });

  it('rejects a revoked token', async () => {
    const token = signAccessToken(customer);
    const payload = verifyAccessToken(token);
    await revokeToken(payload.jti, payload.exp);

    assert.strictEqual(await isTokenRevoked(payload.jti), true);

    const res = await buildApp().request('/protected/resource', {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.strictEqual(res.status, 401);
    const body = (await res.json()) as any;
    assert.match(body.error.message, /revoked/i);
  });
});

describe('role guards', () => {
  it('adminOnlyMiddleware returns 403 for customers and 200 for admins', async () => {
    const app = new Hono();
    app.use('/admin/*', authMiddleware, adminOnlyMiddleware);
    app.get('/admin/dashboard', (c) => c.json({ success: true }));

    const customerRes = await app.request('/admin/dashboard', {
      headers: { Authorization: `Bearer ${signAccessToken(customer)}` },
    });
    assert.strictEqual(customerRes.status, 403);
    const forbidden = (await customerRes.json()) as any;
    assert.strictEqual(forbidden.error.code, 'FORBIDDEN');

    const adminRes = await app.request('/admin/dashboard', {
      headers: { Authorization: `Bearer ${signAccessToken(admin)}` },
    });
    assert.strictEqual(adminRes.status, 200);
  });

  it('requireRole accepts listed roles only', async () => {
    const app = new Hono();
    app.use('/ops/*', authMiddleware, requireRole('admin'));
    app.get('/ops/ping', (c) => c.json({ success: true }));

    const customerRes = await app.request('/ops/ping', {
      headers: { Authorization: `Bearer ${signAccessToken(customer)}` },
    });
    assert.strictEqual(customerRes.status, 403);

    const adminRes = await app.request('/ops/ping', {
      headers: { Authorization: `Bearer ${signAccessToken(admin)}` },
    });
    assert.strictEqual(adminRes.status, 200);
  });
});
