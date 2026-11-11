import { Hono } from 'hono';
import { db } from '../db/index.js';
import { orders, products, users } from '../db/schema.js';
import { desc, eq } from 'drizzle-orm';
import { authMiddleware, adminOnlyMiddleware } from '../middleware/auth.js';
import { buildChartSeries } from '../services/admin/dashboard.js';
import { buildAdminAlerts } from '../services/admin/alerts.js';
import { buildExport, unsupportedFormatError, ExportColumn, ExportFormat, ExportType } from '../services/admin/reports.js';
import { listAdminActions, recordAdminAction } from '../services/admin/auditLog.js';
import {
  AdminUserError,
  getCustomerDetail,
  listCustomers,
  setCustomerStatus,
  setUserRole,
} from '../services/admin/users.js';

export const adminRoutes = new Hono();

adminRoutes.use('*', authMiddleware, adminOnlyMiddleware);

function actorOf(c: any): { id: string; role: string; email: string } {
  return c.get('user') as { id: string; role: string; email: string };
}

// GET /api/v1/admin/dashboard/charts - daily revenue and order series (ADM-003)
adminRoutes.get('/dashboard/charts', async (c) => {
  try {
    const days = Number(c.req.query('days') ?? 7);
    const series = await buildChartSeries(Number.isFinite(days) ? days : 7);
    return c.json({ success: true, data: series });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500);
  }
});

// GET /api/v1/admin/alerts - operational alerts for the admin feed (NTF-008)
adminRoutes.get('/alerts', async (c) => {
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
adminRoutes.get('/reports/export', async (c) => {
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
adminRoutes.get('/customers', async (c) => {
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
adminRoutes.get('/customers/:id', async (c) => {
  try {
    const data = await getCustomerDetail(c.req.param('id') as string);
    return c.json({ success: true, data });
  } catch (err: any) {
    const status = err instanceof AdminUserError ? err.status : 500;
    return c.json({ success: false, error: err.message }, status as any);
  }
});

// POST /api/v1/admin/customers/:id/status - activate or suspend (USM-003)
adminRoutes.post('/customers/:id/status', async (c) => {
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
adminRoutes.post('/users/:id/role', async (c) => {
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

// GET /api/v1/admin/logs - admin audit trail
adminRoutes.get('/logs', async (c) => {
  try {
    const limit = Number(c.req.query('limit') ?? 50);
    const action = c.req.query('action');
    const logs = await listAdminActions(Number.isFinite(limit) ? limit : 50, action);
    return c.json({ success: true, data: { logs, count: logs.length } });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500);
  }
});
