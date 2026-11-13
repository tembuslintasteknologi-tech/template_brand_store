import { Hono } from 'hono';
import { authMiddleware, adminOnlyMiddleware, requireBranchScope } from '../middleware/auth.js';
import { ConfigError } from '../services/config/settings.js';
import {
  createStoreLocation,
  deleteStoreLocation,
  getStoreLocation,
  listStoreLocations,
  setStoreLocationCoordinates,
  updateStoreLocation,
} from '../services/config/storeLocations.js';
import {
  adjustBranchStock,
  listBranchInventory,
  listBranchInventoryLogs,
} from '../services/branch/branchInventoryService.js';
import { BranchStockError } from '../services/branch/branchStockService.js';
import { BranchValidationError } from '../services/branch/branchValidation.js';
import {
  BranchDashboardError,
  branchDashboardReport,
} from '../services/branch/branchDashboard.js';
import { BranchAnalyticsError } from '../services/admin/branchAnalytics.js';

function actorId(c: any): string {
  return (c.get('user') as { id: string }).id;
}

function fail(c: any, err: any) {
  if (err instanceof BranchValidationError) {
    return c.json({ success: false, error: { code: err.code, message: err.message } }, err.status);
  }
  if (err instanceof ConfigError) {
    return c.json({ success: false, error: err.message }, err.status as any);
  }
  if (err instanceof BranchStockError) {
    const status = err.code === 'BRANCH_STOCK_NOT_FOUND' ? 404 : err.code === 'INSUFFICIENT_STOCK' ? 409 : 400;
    return c.json({ success: false, error: { code: err.code, message: err.message } }, status as any);
  }
  return c.json({ success: false, error: err?.message ?? 'failed' }, 500);
}

/** Admin (pusat) branch master data. BR-005. */
export const adminBranchRoutes = new Hono();
adminBranchRoutes.use('*', authMiddleware, adminOnlyMiddleware);

// GET /api/v1/admin/branches
adminBranchRoutes.get('/branches', async (c) => {
  try {
    const rows = await listStoreLocations();
    return c.json({ success: true, data: rows });
  } catch (err: any) {
    return fail(c, err);
  }
});

// POST /api/v1/admin/branches
adminBranchRoutes.post('/branches', async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const row = await createStoreLocation(actorId(c), body);
    return c.json({ success: true, data: row }, 201);
  } catch (err: any) {
    return fail(c, err);
  }
});

// GET /api/v1/admin/branches/:id
adminBranchRoutes.get('/branches/:id', async (c) => {
  try {
    const row = await getStoreLocation(c.req.param('id') as string);
    if (!row) {
      return c.json({ success: false, error: 'Lokasi toko tidak ditemukan' }, 404);
    }
    return c.json({ success: true, data: row });
  } catch (err: any) {
    return fail(c, err);
  }
});

// PATCH /api/v1/admin/branches/:id
adminBranchRoutes.patch('/branches/:id', async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const row = await updateStoreLocation(actorId(c), c.req.param('id') as string, body);
    return c.json({ success: true, data: row });
  } catch (err: any) {
    return fail(c, err);
  }
});

// DELETE /api/v1/admin/branches/:id
adminBranchRoutes.delete('/branches/:id', async (c) => {
  try {
    const row = await deleteStoreLocation(actorId(c), c.req.param('id') as string);
    return c.json({ success: true, data: row });
  } catch (err: any) {
    return fail(c, err);
  }
});

// POST /api/v1/admin/branches/:id/location - "gunakan lokasi saat ini" from the admin UI
adminBranchRoutes.post('/branches/:id/location', async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const row = await setStoreLocationCoordinates(actorId(c), c.req.param('id') as string, body);
    return c.json({ success: true, data: row });
  } catch (err: any) {
    return fail(c, err);
  }
});

/** Branch scoped stock endpoints. BR-006. */
export const branchRoutes = new Hono();
branchRoutes.use('*', authMiddleware, requireBranchScope());

function scopedBranchId(c: any): string | null {
  const scope = c.get('branchScope') as { branchId: string | null } | undefined;
  return scope?.branchId ?? null;
}

// GET /api/v1/branch/dashboard - branch scoped KPI dashboard (BR-013)
branchRoutes.get('/dashboard', async (c) => {
  try {
    const branchId = scopedBranchId(c);
    if (!branchId) {
      return c.json(
        { success: false, error: { code: 'BRANCH_REQUIRED', message: 'Pilih cabang lewat header X-Branch-Id' } },
        400
      );
    }

    const { from, to } = c.req.query();
    const report = await branchDashboardReport(branchId, from, to);
    return c.json({ success: true, data: { reportType: 'branch_dashboard', ...report } });
  } catch (err: any) {
    if (err instanceof BranchDashboardError) {
      return c.json(
        { success: false, error: { code: err.code, message: err.message } },
        err.status as any
      );
    }
    if (err instanceof BranchAnalyticsError) {
      return c.json(
        { success: false, error: { code: err.code, message: err.message } },
        err.status as any
      );
    }
    return fail(c, err);
  }
});

// GET /api/v1/branch/inventory
branchRoutes.get('/inventory', async (c) => {
  try {
    const branchId = scopedBranchId(c);
    if (!branchId) {
      return c.json(
        { success: false, error: { code: 'BRANCH_REQUIRED', message: 'Pilih cabang lewat header X-Branch-Id' } },
        400
      );
    }
    const rows = await listBranchInventory(branchId);
    return c.json({ success: true, data: rows });
  } catch (err: any) {
    return fail(c, err);
  }
});

// GET /api/v1/branch/inventory/logs
branchRoutes.get('/inventory/logs', async (c) => {
  try {
    const branchId = scopedBranchId(c);
    if (!branchId) {
      return c.json(
        { success: false, error: { code: 'BRANCH_REQUIRED', message: 'Pilih cabang lewat header X-Branch-Id' } },
        400
      );
    }
    const limit = Number(c.req.query('limit') ?? 100);
    const rows = await listBranchInventoryLogs(branchId, limit);
    return c.json({ success: true, data: rows });
  } catch (err: any) {
    return fail(c, err);
  }
});

// PATCH /api/v1/branch/inventory/:variantId
branchRoutes.patch('/inventory/:variantId', async (c) => {
  try {
    const branchId = scopedBranchId(c);
    if (!branchId) {
      return c.json(
        { success: false, error: { code: 'BRANCH_REQUIRED', message: 'Pilih cabang lewat header X-Branch-Id' } },
        400
      );
    }
    const body = await c.req.json().catch(() => ({}));
    const reason = typeof body?.reason === 'string' ? body.reason : '';
    if (!reason.trim()) {
      return c.json(
        { success: false, error: { code: 'REASON_REQUIRED', message: 'Alasan penyesuaian stok wajib diisi' } },
        400
      );
    }
    const result = await adjustBranchStock({
      branchId,
      variantId: c.req.param('variantId') as string,
      quantityChange: Number(body?.quantityChange),
      reason,
      performedBy: actorId(c),
      referenceId: typeof body?.referenceId === 'string' ? body.referenceId : undefined,
    });
    return c.json({ success: true, data: result });
  } catch (err: any) {
    return fail(c, err);
  }
});
