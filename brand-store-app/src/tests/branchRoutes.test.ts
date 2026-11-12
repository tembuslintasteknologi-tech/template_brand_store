import { describe, it, after } from 'node:test';
import assert from 'node:assert';
import { createApp } from '../app.js';
import { closeRedis } from '../config/redis.js';
import { closeDatabase } from '../db/index.js';

const app = createApp();

// Separate forwarded IPs so the Redis limiter windows never collide with other suites.
let ipSeed = 1300;
function ip(): string {
  ipSeed += 1;
  return `10.43.${Math.floor(ipSeed / 250)}.${(ipSeed % 250) + 1}`;
}

function request(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set('x-forwarded-for', ip());
  return app.request(path, { ...init, headers });
}

function bearer(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

after(async () => {
  await closeRedis();
  await closeDatabase();
});

describe('branch rd inventory access control', () => {
  it('rejects an unauthenticated inventory read', async () => {
    const res = await request('/api/v1/branch/inventory');
    assert.strictEqual(res.status, 401);
  });

  it('rejects a customer token', async () => {
    const res = await request('/api/v1/branch/inventory', {
      headers: bearer('mock-customer-token-customer-uuid-001'),
    });
    assert.strictEqual(res.status, 403);
  });

  it('rejects a branch admin that targets another branch through the header', async () => {
    const res = await request('/api/v1/branch/inventory', {
      headers: {
        ...bearer('mock-branch-admin-token-branch-jogja'),
        'X-Branch-Id': 'branch-bandung',
      },
    });
    assert.strictEqual(res.status, 403);
    const body = (await res.json()) as any;
    assert.strictEqual(body.error.code, 'BRANCH_SCOPE_MISMATCH');
  });

  it('rejects a branch admin account without a linked branch', async () => {
    const res = await request('/api/v1/branch/inventory/logs', {
      headers: bearer('mock-branch-admin-token-'),
    });
    assert.strictEqual(res.status, 403);
    const body = (await res.json()) as any;
    assert.strictEqual(body.error.code, 'BRANCH_SCOPE_MISSING');
  });

  it('refuses an inventory adjustment without a reason before touching the database', async () => {
    const res = await request('/api/v1/branch/inventory/00000000-0000-0000-0000-000000000000', {
      method: 'PATCH',
      headers: {
        ...bearer('mock-branch-admin-token-branch-jogja'),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ quantityChange: 5 }),
    });
    assert.strictEqual(res.status, 400);
    const body = (await res.json()) as any;
    assert.strictEqual(body.error.code, 'REASON_REQUIRED');
  });
});

describe('admin branch master data access control', () => {
  it('rejects a customer token', async () => {
    const res = await request('/api/v1/admin/branches', {
      headers: bearer('mock-customer-token-customer-uuid-001'),
    });
    assert.strictEqual(res.status, 403);
  });

  it('rejects a branch admin token, pusat admin only', async () => {
    const res = await request('/api/v1/admin/branches', {
      headers: bearer('mock-branch-admin-token-branch-jogja'),
    });
    assert.strictEqual(res.status, 403);
  });

  it('rejects an unauthenticated branch create', async () => {
    const res = await request('/api/v1/admin/branches', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Cabang Baru' }),
    });
    assert.strictEqual(res.status, 401);
  });
});
