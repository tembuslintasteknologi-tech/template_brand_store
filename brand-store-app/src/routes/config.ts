import { Hono } from 'hono';
import { authMiddleware, adminOnlyMiddleware } from '../middleware/auth.js';
import {
  ConfigError,
  getMaintenanceMode,
  getBrandProfile,
  getFeatureFlags,
  getSettingRow,
  getSiteConfig,
  listSettings,
  putBrandProfile,
  putFeatureFlags,
  putSetting,
} from '../services/config/settings.js';
import {
  createStoreLocation,
  deleteStoreLocation,
  listStoreLocations,
  setDefaultStoreLocation,
  updateStoreLocation,
} from '../services/config/storeLocations.js';

export const configAdminRoutes = new Hono();
configAdminRoutes.use('*', authMiddleware, adminOnlyMiddleware);

function actorId(c: any): string {
  return (c.get('user') as { id: string }).id;
}

function fail(c: any, err: any) {
  const status = err instanceof ConfigError ? err.status : 500;
  return c.json({ success: false, error: err?.message ?? 'failed' }, status as any);
}

// GET /api/v1/admin/settings - list every setting (CFG-001)
configAdminRoutes.get('/settings', async (c) => {
  try {
    const rows = await listSettings();
    return c.json({ success: true, data: { settings: rows, count: rows.length } });
  } catch (err: any) {
    return fail(c, err);
  }
});

// GET /api/v1/admin/settings/:key - read one setting by key (CFG-001)
configAdminRoutes.get('/settings/:key', async (c) => {
  try {
    const row = await getSettingRow(c.req.param('key') as string);
    return c.json({ success: true, data: row });
  } catch (err: any) {
    return fail(c, err);
  }
});

// PUT /api/v1/admin/settings/:key - create or update one setting (CFG-001)
configAdminRoutes.put('/settings/:key', async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const value = body && typeof body === 'object' && 'value' in body ? (body as any).value : body;
    const row = await putSetting(actorId(c), c.req.param('key') as string, value);
    return c.json({ success: true, data: row });
  } catch (err: any) {
    return fail(c, err);
  }
});

// GET /api/v1/admin/brand-profile - brand identity (CFG-009)
configAdminRoutes.get('/brand-profile', async (c) => {
  try {
    return c.json({ success: true, data: await getBrandProfile() });
  } catch (err: any) {
    return fail(c, err);
  }
});

// PUT /api/v1/admin/brand-profile - update brand identity (CFG-009)
configAdminRoutes.put('/brand-profile', async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const row = await putBrandProfile(actorId(c), body);
    return c.json({ success: true, data: row.value });
  } catch (err: any) {
    return fail(c, err);
  }
});

// GET /api/v1/admin/feature-flags - current flags (CFG-006)
configAdminRoutes.get('/feature-flags', async (c) => {
  try {
    return c.json({ success: true, data: await getFeatureFlags() });
  } catch (err: any) {
    return fail(c, err);
  }
});

// PUT /api/v1/admin/feature-flags - replace flags (CFG-006)
configAdminRoutes.put('/feature-flags', async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const row = await putFeatureFlags(actorId(c), body);
    return c.json({ success: true, data: row.value });
  } catch (err: any) {
    return fail(c, err);
  }
});

// GET /api/v1/admin/store-locations - list locations (CFG-011)
configAdminRoutes.get('/store-locations', async (c) => {
  try {
    const rows = await listStoreLocations();
    return c.json({ success: true, data: { locations: rows, count: rows.length } });
  } catch (err: any) {
    return fail(c, err);
  }
});

// POST /api/v1/admin/store-locations - create location (CFG-011)
configAdminRoutes.post('/store-locations', async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const row = await createStoreLocation(actorId(c), body);
    return c.json({ success: true, data: row }, 201);
  } catch (err: any) {
    return fail(c, err);
  }
});

// PATCH /api/v1/admin/store-locations/:id - update location (CFG-011)
configAdminRoutes.patch('/store-locations/:id', async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const row = await updateStoreLocation(actorId(c), c.req.param('id') as string, body);
    return c.json({ success: true, data: row });
  } catch (err: any) {
    return fail(c, err);
  }
});

// DELETE /api/v1/admin/store-locations/:id - delete location (CFG-011)
configAdminRoutes.delete('/store-locations/:id', async (c) => {
  try {
    const row = await deleteStoreLocation(actorId(c), c.req.param('id') as string);
    return c.json({ success: true, data: row });
  } catch (err: any) {
    return fail(c, err);
  }
});

// POST /api/v1/admin/store-locations/:id/default - set default location (CFG-011)
configAdminRoutes.post('/store-locations/:id/default', async (c) => {
  try {
    const row = await setDefaultStoreLocation(actorId(c), c.req.param('id') as string);
    return c.json({ success: true, data: row });
  } catch (err: any) {
    return fail(c, err);
  }
});

// GET /api/v1/admin/maintenance - maintenance mode state (CFG-007)
configAdminRoutes.get('/maintenance', async (c) => {
  try {
    return c.json({ success: true, data: await getMaintenanceMode() });
  } catch (err: any) {
    return fail(c, err);
  }
});

// PUT /api/v1/admin/maintenance - toggle maintenance mode (CFG-007)
configAdminRoutes.put('/maintenance', async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const row = await putSetting(actorId(c), 'maintenance.mode', body);
    return c.json({ success: true, data: row.value });
  } catch (err: any) {
    return fail(c, err);
  }
});

// GET /api/v1/admin/site-config - resolved runtime config for the admin UI
configAdminRoutes.get('/site-config', async (c) => {
  try {
    return c.json({ success: true, data: await getSiteConfig() });
  } catch (err: any) {
    return fail(c, err);
  }
});

export const configPublicRoutes = new Hono();

// GET /api/v1/site-config - public brand and runtime config for the storefront
configPublicRoutes.get('/site-config', async (c) => {
  try {
    return c.json({ success: true, data: await getSiteConfig() });
  } catch (err: any) {
    return c.json({ success: false, error: err?.message ?? 'failed' }, 500);
  }
});

// GET /api/v1/store/config - public storefront config alias (CFG-012)
configPublicRoutes.get('/store/config', async (c) => {
  try {
    return c.json({ success: true, data: await getSiteConfig() });
  } catch (err: any) {
    return c.json({ success: false, error: err?.message ?? 'failed' }, 500);
  }
});

// GET /api/v1/features - enabled feature flags only
configPublicRoutes.get('/features', async (c) => {
  try {
    const flags = await getFeatureFlags();
    const enabled = Object.entries(flags)
      .filter(([, on]) => on === true)
      .map(([flag]) => flag);
    return c.json({ success: true, data: { enabled, all: flags } });
  } catch (err: any) {
    return c.json({ success: false, error: err?.message ?? 'failed' }, 500);
  }
});
