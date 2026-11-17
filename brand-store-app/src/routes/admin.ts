import { Hono } from 'hono';
import { db } from '../db/index.js';
import { orders, products, users } from '../db/schema.js';
import { desc, eq } from 'drizzle-orm';
import { authMiddleware, adminOnlyMiddleware, requirePermission } from '../middleware/auth.js';
import { buildChartSeries } from '../services/admin/dashboard.js';
import { buildAdminAlerts } from '../services/admin/alerts.js';
import { buildExport, unsupportedFormatError, ExportColumn, ExportFormat, ExportType } from '../services/admin/reports.js';
import { listAdminActions, recordAdminAction } from '../services/admin/auditLog.js';
import {
  AdminUserError,
  countAdmins,
  getCustomerDetail,
  listCustomers,
  setCustomerStatus,
  setUserRole,
} from '../services/admin/users.js';
import {
  ADMIN_PERMISSIONS,
  PERMISSION_DESCRIPTIONS,
  ROLE_PERMISSION_DEFAULTS,
  PermissionError,
  canGrant,
  diffPermissions,
  effectivePermissions,
  hasPermission,
  normalizeOverrides,
} from '../services/auth/permissions.js';
import {
  getAdminPermissionState,
  loadPermissionOverrides,
  replaceUserOverrides,
} from '../services/auth/permissionRepository.js';

export const adminRoutes = new Hono();

adminRoutes.use('*', authMiddleware, adminOnlyMiddleware);

function actorOf(c: any): { id: string; role: string; email: string } {
  return c.get('user') as { id: string; role: string; email: string };
}

// GET /api/v1/admin/dashboard/charts - daily revenue and order series (ADM-003)
adminRoutes.get('/dashboard/charts', requirePermission('dashboard.view'), async (c) => {
  try {
    const days = Number(c.req.query('days') ?? 7);
    const series = await buildChartSeries(Number.isFinite(days) ? days : 7);
    return c.json({ success: true, data: series });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500);
  }
});

// GET /api/v1/admin/alerts - operational alerts for the admin feed (NTF-008)
adminRoutes.get('/alerts', requirePermission('dashboard.view'), async (c) => {
  try {
    const threshold = Number(c.req.query('lowStockThreshold') ?? 5);
    const alerts = await buildAdminAlerts({
      lowStockThreshold: Number.isFinite(threshold) ? threshold : 5,
      newOrderWindowHours: Number(c.req.query('windowHours') ?? 24),
      limit: Number(c.req.query('limit') ?? 20),
    });
    return c.json({ success: true, data: { alerts, count: alerts.length } });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500);
  }
});

// GET /api/v1/admin/reports/export - CSV or JSON report download (ADM-004)
adminRoutes.get('/reports/export', requirePermission('reports.export'), async (c) => {
  const type = String(c.req.query('type') ?? 'orders') as ExportType;
  const format = String(c.req.query('format') ?? 'csv') as ExportFormat;

  if (!['orders', 'customers', 'products'].includes(type)) {
    return c.json({ success: false, error: 'type must be orders, customers, or products' }, 400);
  }
  if (!['csv', 'json'].includes(format)) {
    return c.json({ success: false, error: unsupportedFormatError(format) }, 400);
  }

  try {
    if (type === 'orders') {
      const rows = await db.select().from(orders).orderBy(desc(orders.createdAt));
      const columns: ExportColumn<any>[] = [
        { key: 'orderNumber', header: 'order_number' },
        { key: 'customerId', header: 'customer_id' },
        { key: 'status', header: 'status' },
        { key: 'totalAmount', header: 'total_amount' },
        { key: 'shippingAmount', header: 'shipping_amount' },
        { key: 'discountAmount', header: 'discount_amount' },
        { key: 'createdAt', header: 'created_at' },
      ];
      const result = buildExport(type, format, rows as any[], columns);
      await recordAdminAction({
        actorId: actorOf(c).id,
        action: 'report.export',
        targetType: 'report',
        targetId: `${type}.${format}`,
        metadata: { rowCount: rows.length },
      });
      return new Response(result.body, {
        headers: {
          'content-type': result.contentType,
          'content-disposition': `attachment; filename="${result.filename}"`,
        },
      });
    }

    if (type === 'customers') {
      const rows = await db
        .select({
          id: users.id,
          email: users.email,
          fullName: users.fullName,
          phone: users.phone,
          role: users.role,
          status: users.status,
          createdAt: users.createdAt,
        })
        .from(users)
        .where(eq(users.role, 'customer'))
        .orderBy(desc(users.createdAt));
      const columns: ExportColumn<any>[] = [
        { key: 'id', header: 'id' },
        { key: 'email', header: 'email' },
        { key: 'fullName', header: 'full_name' },
        { key: 'phone', header: 'phone' },
        { key: 'status', header: 'status' },
        { key: 'createdAt', header: 'created_at' },
      ];
      const result = buildExport(type, format, rows as any[], columns);
      await recordAdminAction({
        actorId: actorOf(c).id,
        action: 'report.export',
        targetType: 'report',
        targetId: `${type}.${format}`,
        metadata: { rowCount: rows.length },
      });
      return new Response(result.body, {
        headers: {
          'content-type': result.contentType,
          'content-disposition': `attachment; filename="${result.filename}"`,
        },
      });
    }

    const rows = await db.select().from(products).orderBy(desc(products.createdAt));
    const columns: ExportColumn<any>[] = [
      { key: 'id', header: 'id' },
      { key: 'title', header: 'title' },
      { key: 'sku', header: 'sku' },
      { key: 'basePrice', header: 'base_price' },
      { key: 'stock', header: 'stock' },
      { key: 'status', header: 'status' },
      { key: 'createdAt', header: 'created_at' },
    ];
    const result = buildExport(type, format, rows as any[], columns);
    await recordAdminAction({
      actorId: actorOf(c).id,
      action: 'report.export',
      targetType: 'report',
      targetId: `${type}.${format}`,
      metadata: { rowCount: rows.length },
    });
    return new Response(result.body, {
      headers: {
        'content-type': result.contentType,
        'content-disposition': `attachment; filename="${result.filename}"`,
      },
    });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500);
  }
});

// GET /api/v1/admin/customers - customer list (USM-001)
adminRoutes.get('/customers', requirePermission('users.view'), async (c) => {
  try {
    const limit = Number(c.req.query('limit') ?? 20);
    const offset = Number(c.req.query('offset') ?? 0);
    const result = await listCustomers({
      limit: Number.isFinite(limit) ? limit : 20,
      offset: Number.isFinite(offset) ? offset : 0,
      search: c.req.query('search'),
    });
    return c.json({ success: true, data: result });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500);
  }
});

// GET /api/v1/admin/customers/:id - customer detail (USM-002)
adminRoutes.get('/customers/:id', requirePermission('users.view'), async (c) => {
  try {
    const data = await getCustomerDetail(c.req.param('id') as string);
    return c.json({ success: true, data });
  } catch (err: any) {
    const status = err instanceof AdminUserError ? err.status : 500;
    return c.json({ success: false, error: err.message }, status as any);
  }
});

// POST /api/v1/admin/customers/:id/status - activate or suspend (USM-003)
adminRoutes.post('/customers/:id/status', requirePermission('users.manage'), async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const status = String(body?.status ?? '');
  try {
    const updated = await setCustomerStatus(actorOf(c).id, c.req.param('id') as string, status as any);
    return c.json({ success: true, data: updated });
  } catch (err: any) {
    const statusCode = err instanceof AdminUserError ? err.status : 500;
    return c.json({ success: false, error: err.message }, statusCode as any);
  }
});

// POST /api/v1/admin/users/:id/role - promote or demote admin (USM-004)
adminRoutes.post('/users/:id/role', requirePermission('users.manage'), async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const role = String(body?.role ?? '');
  try {
    const updated = await setUserRole(actorOf(c).id, c.req.param('id') as string, role as any);
    return c.json({ success: true, data: updated });
  } catch (err: any) {
    const statusCode = err instanceof AdminUserError ? err.status : 500;
    return c.json({ success: false, error: err.message }, statusCode as any);
  }
});

// GET /api/v1/admin/permissions - catalog plus the caller's effective scopes (AUT-013)
adminRoutes.get('/permissions', async (c) => {
  try {
    const actor = actorOf(c);
    const overrides = await loadPermissionOverrides(actor.id);
    return c.json({
      success: true,
      data: {
        catalog: ADMIN_PERMISSIONS.map((permission) => ({
          permission,
          description: PERMISSION_DESCRIPTIONS[permission],
        })),
        roles: ROLE_PERMISSION_DEFAULTS,
        me: {
          role: actor.role,
          overrides,
          effective: effectivePermissions(actor.role, overrides),
        },
      },
    });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500);
  }
});

// GET /api/v1/admin/users/:id/permissions - scopes for one admin or staff account (AUT-013)
adminRoutes.get('/users/:id/permissions', async (c) => {
  const actor = actorOf(c);
  const targetId = c.req.param('id') as string;

  try {
    if (targetId !== actor.id) {
      const actorOverrides = await loadPermissionOverrides(actor.id);
      if (!hasPermission(actor.role, actorOverrides, 'permissions.manage')) {
        return c.json(
          {
            success: false,
            error: { code: 'PERMISSION_DENIED', message: 'Forbidden: scope permissions.manage required' },
          },
          403
        );
      }
    }

    const state = await getAdminPermissionState(targetId);
    return c.json({ success: true, data: state });
  } catch (err: any) {
    const status = err instanceof PermissionError ? err.status : 500;
    return c.json({ success: false, error: err.message }, status as any);
  }
});

// PUT /api/v1/admin/users/:id/permissions - replace the override list for one account (AUT-013)
adminRoutes.put('/users/:id/permissions', requirePermission('permissions.manage'), async (c) => {
  const actor = actorOf(c);
  const targetId = c.req.param('id') as string;
  const body = await c.req.json().catch(() => null);

  if (!body || !Array.isArray(body.overrides)) {
    return c.json(
      { success: false, error: { code: 'VALIDATION_ERROR', message: 'overrides must be an array' } },
      400
    );
  }

  if (targetId === actor.id) {
    return c.json(
      {
        success: false,
        error: {
          code: 'SELF_PERMISSION_CHANGE',
          message: 'Admin tidak boleh mengubah scope akunnya sendiri',
        },
      },
      409
    );
  }

  try {
    const desired = normalizeOverrides(body.overrides);
    const actorOverrides = await loadPermissionOverrides(actor.id);

    for (const row of desired) {
      if (row.effect !== 'grant') continue;
      if (!canGrant(actor.role, actorOverrides, row.permission)) {
        throw new PermissionError(
          `Tidak boleh memberikan scope yang tidak dimiliki: ${row.permission}`,
          'SCOPE_NOT_HELD',
          403
        );
      }
    }

    const before = await getAdminPermissionState(targetId);
    const nextEffective = effectivePermissions(before.role, desired);
    const losesManageScope =
      before.effective.includes('permissions.manage') && !nextEffective.includes('permissions.manage');

    if (losesManageScope && before.role === 'admin') {
      const admins = await countAdmins();
      if (admins <= 1) {
        throw new PermissionError(
          'Admin terakhir harus tetap memegang permissions.manage',
          'SCOPE_NOT_HELD',
          409
        );
      }
    }

    const after = await replaceUserOverrides({
      userId: targetId,
      overrides: desired,
      actorId: actor.id,
    });
    const diff = diffPermissions(before.effective, after.effective);

    await recordAdminAction({
      actorId: actor.id,
      action: 'user.permissions_update',
      targetType: 'user',
      targetId,
      metadata: { added: diff.added, removed: diff.removed },
    });

    return c.json({ success: true, data: { ...after, diff } });
  } catch (err: any) {
    const status = err instanceof PermissionError ? err.status : err instanceof AdminUserError ? err.status : 500;
    const code = err instanceof PermissionError ? err.code : 'INTERNAL_ERROR';
    return c.json({ success: false, error: { code, message: err.message } }, status as any);
  }
});

// GET /api/v1/admin/logs - admin audit trail
adminRoutes.get('/logs', requirePermission('audit.view'), async (c) => {
  try {
    const limit = Number(c.req.query('limit') ?? 50);
    const action = c.req.query('action');
    const logs = await listAdminActions(Number.isFinite(limit) ? limit : 50, action);
    return c.json({ success: true, data: { logs, count: logs.length } });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500);
  }
});
