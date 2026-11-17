import { describe, it, after } from 'node:test';
import assert from 'node:assert';
import { Hono } from 'hono';
import { createApp } from '../app.js';
import { closeRedis } from '../config/redis.js';
import { closeDatabase } from '../db/index.js';
import { authMiddleware, requirePermission } from '../middleware/auth.js';
import {
  ADMIN_PERMISSIONS,
  PermissionError,
  ROLE_PERMISSION_DEFAULTS,
  assertPermission,
  canGrant,
  defaultsForRole,
  diffPermissions,
  effectivePermissions,
  hasPermission,
  normalizeOverrides,
  overridesForUpdate,
} from '../services/auth/permissions.js';

const app = createApp();

let ipSeed = 1700;
function ip(): string {
  ipSeed += 1;
  return `10.47.${Math.floor(ipSeed / 250)}.${(ipSeed % 250) + 1}`;
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

describe('permission catalog and role defaults', () => {
  it('gives the pusat admin every scope', () => {
    assert.deepStrictEqual(defaultsForRole('admin'), [...ADMIN_PERMISSIONS]);
  });

  it('gives branch admins the operational subset without finance or scope management', () => {
    const defaults = defaultsForRole('branch_admin');
    assert.ok(defaults.includes('inventory.manage'));
    assert.ok(defaults.includes('orders.manage'));
    assert.ok(defaults.includes('chat.manage'));
    assert.ok(!defaults.includes('finance.view'));
    assert.ok(!defaults.includes('permissions.manage'));
    assert.strictEqual(defaults.length, ROLE_PERMISSION_DEFAULTS.branch_admin.length);
  });

  it('gives customers no admin scope and unknown roles none either', () => {
    assert.deepStrictEqual(defaultsForRole('customer'), []);
    assert.deepStrictEqual(defaultsForRole('owner'), []);
    assert.deepStrictEqual(defaultsForRole(null), []);
  });

  it('keeps catalog order stable in effective permissions', () => {
    const effective = effectivePermissions('admin');
    assert.deepStrictEqual(effective, [...ADMIN_PERMISSIONS]);
    assert.strictEqual(effective[0], 'dashboard.view');
    assert.strictEqual(effective[effective.length - 1], 'permissions.manage');
  });
});

describe('overrides', () => {
  it('adds a scope beyond the role default', () => {
    const effective = effectivePermissions('branch_admin', [
      { permission: 'finance.view', effect: 'grant' },
    ]);
    assert.ok(effective.includes('finance.view'));
    assert.ok(effective.includes('inventory.manage'));
  });

  it('removes a scope that the role grants by default', () => {
    const effective = effectivePermissions('admin', [{ permission: 'users.manage', effect: 'revoke' }]);
    assert.ok(!effective.includes('users.manage'));
    assert.ok(effective.includes('users.view'));
    assert.strictEqual(effective.length, ADMIN_PERMISSIONS.length - 1);
  });

  it('lets the later duplicate win instead of failing the update', () => {
    const effective = effectivePermissions('branch_admin', [
      { permission: 'finance.view', effect: 'grant' },
      { permission: 'finance.view', effect: 'revoke' },
    ]);
    assert.ok(!effective.includes('finance.view'));
  });

  it('rejects an unknown permission with a typed error', () => {
    assert.throws(
      () => normalizeOverrides([{ permission: 'root.everything', effect: 'grant' }]),
      (err: any) => err instanceof PermissionError && err.code === 'UNKNOWN_PERMISSION'
    );
  });

  it('rejects an effect other than grant or revoke', () => {
    assert.throws(
      () => normalizeOverrides([{ permission: 'users.view', effect: 'maybe' }]),
      (err: any) => err instanceof PermissionError && err.code === 'INVALID_EFFECT'
    );
  });

  it('never hands out permissions.manage through an override', () => {
    assert.throws(
      () => normalizeOverrides([{ permission: 'permissions.manage', effect: 'grant' }]),
      (err: any) => err instanceof PermissionError && err.code === 'SCOPE_NOT_HELD'
    );
  });

  it('hasPermission and assertPermission agree after a revoke', () => {
    const overrides = [{ permission: 'audit.view', effect: 'revoke' }];
    assert.strictEqual(hasPermission('admin', overrides, 'audit.view'), false);
    assert.throws(
      () => assertPermission('admin', overrides, 'audit.view'),
      (err: any) => err instanceof PermissionError && err.status === 403
    );
  });

  it('turns a null input into an empty override list', () => {
    assert.deepStrictEqual(normalizeOverrides(null), []);
    assert.deepStrictEqual(normalizeOverrides(undefined), []);
  });
});

describe('grant authority', () => {
  it('lets an admin hand out a scope the admin holds', () => {
    assert.strictEqual(canGrant('admin', [], 'users.manage'), true);
  });

  it('blocks a branch admin from granting a scope outside their set', () => {
    assert.strictEqual(canGrant('branch_admin', [], 'finance.view'), false);
    assert.strictEqual(canGrant('branch_admin', [], 'orders.manage'), true);
  });

  it('blocks everyone from granting permissions.manage', () => {
    assert.strictEqual(canGrant('admin', [], 'permissions.manage'), false);
  });

  it('blocks a scope the actor had revoked from being granted onwards', () => {
    const actorOverrides = [{ permission: 'users.manage', effect: 'revoke' }];
    assert.strictEqual(canGrant('admin', actorOverrides, 'users.manage'), false);
  });
});

describe('permission diff and update statement', () => {
  it('splits added, removed and unchanged scopes in catalog order', () => {
    const before = effectivePermissions('branch_admin');
    const after = effectivePermissions('branch_admin', [
      { permission: 'finance.view', effect: 'grant' },
      { permission: 'chat.manage', effect: 'revoke' },
    ]);
    const diff = diffPermissions(before, after);

    assert.deepStrictEqual(diff.added, ['finance.view']);
    assert.deepStrictEqual(diff.removed, ['chat.manage']);
    assert.ok(diff.unchanged.includes('inventory.manage'));
  });

  it('emits one statement per changed permission and null for a dropped row', () => {
    const changes = overridesForUpdate(
      [{ permission: 'users.view', effect: 'revoke' }],
      [{ permission: 'finance.view', effect: 'grant' }]
    );

    assert.deepStrictEqual(changes, [
      { permission: 'users.view', effect: null },
      { permission: 'finance.view', effect: 'grant' },
    ]);
  });
});

describe('requirePermission middleware', () => {
  const probe = new Hono();
  probe.get('/dashboard', authMiddleware, requirePermission('dashboard.view'), (c) => c.json({ ok: true }));
  probe.get('/finance', authMiddleware, requirePermission('finance.view'), (c) => c.json({ ok: true }));

  it('rejects a request without a token', async () => {
    const res = await probe.request('/dashboard');
    assert.strictEqual(res.status, 401);
  });

  it('allows a branch admin through a default scope', async () => {
    const res = await probe.request('/dashboard', {
      headers: bearer('mock-branch-admin-token-branch-jogja'),
    });
    assert.strictEqual(res.status, 200);
  });

  it('blocks a branch admin from a scope outside the default set', async () => {
    const res = await probe.request('/finance', {
      headers: bearer('mock-branch-admin-token-branch-jogja'),
    });
    assert.strictEqual(res.status, 403);
    const body = (await res.json()) as any;
    assert.strictEqual(body.error.code, 'PERMISSION_DENIED');
    assert.strictEqual(body.error.permission, 'finance.view');
  });
});

describe('permission endpoints', () => {
  it('requires authentication', async () => {
    const res = await request('/api/v1/admin/permissions');
    assert.strictEqual(res.status, 401);
  });

  it('rejects a customer token', async () => {
    const res = await request('/api/v1/admin/permissions', {
      headers: bearer('mock-customer-token-customer-uuid-001'),
    });
    assert.strictEqual(res.status, 403);
  });

  it('returns the catalog and the caller scopes for an admin', async () => {
    const res = await request('/api/v1/admin/permissions', {
      headers: bearer('mock-admin-token'),
    });
    assert.strictEqual(res.status, 200);

    const body = (await res.json()) as any;
    assert.strictEqual(body.data.catalog.length, ADMIN_PERMISSIONS.length);
    assert.strictEqual(body.data.me.role, 'admin');
    assert.deepStrictEqual(body.data.me.effective, [...ADMIN_PERMISSIONS]);
    assert.ok(body.data.roles.branch_admin.includes('inventory.manage'));
    assert.ok(body.data.roles.customer.length === 0);
  });

  it('refuses a self permission change before touching the database', async () => {
    const res = await request('/api/v1/admin/users/admin-uuid-001/permissions', {
      method: 'PUT',
      headers: { ...bearer('mock-admin-token'), 'Content-Type': 'application/json' },
      body: JSON.stringify({ overrides: [] }),
    });

    assert.strictEqual(res.status, 409);
    const body = (await res.json()) as any;
    assert.strictEqual(body.error.code, 'SELF_PERMISSION_CHANGE');
  });

  it('rejects a malformed override payload', async () => {
    const res = await request('/api/v1/admin/users/other-admin-id/permissions', {
      method: 'PUT',
      headers: { ...bearer('mock-admin-token'), 'Content-Type': 'application/json' },
      body: JSON.stringify({ overrides: 'all' }),
    });

    assert.strictEqual(res.status, 400);
    const body = (await res.json()) as any;
    assert.strictEqual(body.error.code, 'VALIDATION_ERROR');
  });

  it('rejects an unknown permission before the target lookup', async () => {
    const res = await request('/api/v1/admin/users/other-admin-id/permissions', {
      method: 'PUT',
      headers: { ...bearer('mock-admin-token'), 'Content-Type': 'application/json' },
      body: JSON.stringify({ overrides: [{ permission: 'root.everything', effect: 'grant' }] }),
    });

    assert.strictEqual(res.status, 400);
    const body = (await res.json()) as any;
    assert.strictEqual(body.error.code, 'UNKNOWN_PERMISSION');
  });
});
