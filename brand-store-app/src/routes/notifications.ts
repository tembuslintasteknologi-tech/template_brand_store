import { Hono } from 'hono';
import { authMiddleware, adminOnlyMiddleware } from '../middleware/auth.js';
import {
  NotificationError,
  ensureDefaultTemplates,
  listNotifications,
  listPreferences,
  listTemplates,
  markAllRead,
  markRead,
  putPreferences,
  resolveRecipientId,
  unreadCount,
  upsertTemplate,
} from '../services/notifications/notificationService.js';
import { listDevices, registerDevice, unregisterDevice } from '../services/notifications/pushService.js';

export const notificationRoutes = new Hono();
notificationRoutes.use('*', authMiddleware);

async function recipient(c: any): Promise<string> {
  const user = c.get('user') as { id: string; email?: string };
  return resolveRecipientId(user.id, user.email);
}

function fail(c: any, err: any) {
  const status = err instanceof NotificationError ? err.status : 500;
  return c.json({ success: false, error: err?.message ?? 'failed' }, status as any);
}

// GET /api/v1/notifications - in-app notification feed (NTF-001)
notificationRoutes.get('/', async (c) => {
  try {
    const userId = await recipient(c);
    const limit = Number(c.req.query('limit') ?? 20);
    const unreadOnly = c.req.query('unreadOnly') === 'true';
    const rows = await listNotifications(userId, { limit: Number.isFinite(limit) ? limit : 20, unreadOnly });
    const unread = await unreadCount(userId);
    return c.json({ success: true, data: { notifications: rows, unread, count: rows.length } });
  } catch (err: any) {
    return fail(c, err);
  }
});

// GET /api/v1/notifications/unread-count - badge counter
notificationRoutes.get('/unread-count', async (c) => {
  try {
    const userId = await recipient(c);
    return c.json({ success: true, data: { unread: await unreadCount(userId) } });
  } catch (err: any) {
    return fail(c, err);
  }
});

// GET /api/v1/notifications/preferences - channel preferences (NTF-002)
notificationRoutes.get('/preferences', async (c) => {
  try {
    const userId = await recipient(c);
    return c.json({ success: true, data: { preferences: await listPreferences(userId) } });
  } catch (err: any) {
    return fail(c, err);
  }
});

// PUT /api/v1/notifications/preferences - update channel preferences (NTF-002)
notificationRoutes.put('/preferences', async (c) => {
  try {
    const userId = await recipient(c);
    const body = await c.req.json().catch(() => ({}));
    const input = Array.isArray(body) ? body : body?.preferences;
    const rows = await putPreferences(userId, input);
    return c.json({ success: true, data: { preferences: rows } });
  } catch (err: any) {
    return fail(c, err);
  }
});

// POST /api/v1/notifications/read-all - mark every notification read
notificationRoutes.post('/read-all', async (c) => {
  try {
    const userId = await recipient(c);
    return c.json({ success: true, data: { updated: await markAllRead(userId) } });
  } catch (err: any) {
    return fail(c, err);
  }
});

// POST /api/v1/notifications/:id/read - mark one notification read
notificationRoutes.post('/:id/read', async (c) => {
  try {
    const userId = await recipient(c);
    const row = await markRead(userId, c.req.param('id') as string);
    return c.json({ success: true, data: row });
  } catch (err: any) {
    return fail(c, err);
  }
});

// GET /api/v1/notifications/devices - registered push tokens (NTF-004)
notificationRoutes.get('/devices', async (c) => {
  try {
    const userId = await recipient(c);
    const devices = await listDevices(userId);
    return c.json({ success: true, data: { devices, count: devices.length } });
  } catch (err: any) {
    return fail(c, err);
  }
});

// POST /api/v1/notifications/devices - register FCM/APNs token (NTF-004)
notificationRoutes.post('/devices', async (c) => {
  try {
    const userId = await recipient(c);
    const body = await c.req.json().catch(() => ({}));
    const device = await registerDevice(userId, body);
    return c.json({ success: true, data: device }, 201);
  } catch (err: any) {
    return fail(c, err);
  }
});

// POST /api/v1/notifications/devices/unregister - deactivate a push token
notificationRoutes.post('/devices/unregister', async (c) => {
  try {
    const userId = await recipient(c);
    const body = await c.req.json().catch(() => ({}));
    const token = String(body?.token ?? '');
    if (!token) {
      return c.json({ success: false, error: 'token wajib diisi' }, 400);
    }
    const device = await unregisterDevice(userId, token);
    if (!device) {
      return c.json({ success: false, error: 'Device token tidak ditemukan' }, 404);
    }
    return c.json({ success: true, data: device });
  } catch (err: any) {
    return fail(c, err);
  }
});

export const notificationAdminRoutes = new Hono();
notificationAdminRoutes.use('*', authMiddleware, adminOnlyMiddleware);

function actorId(c: any): string {
  return (c.get('user') as { id: string }).id;
}

// GET /api/v1/admin/notification-templates - template catalog (NTF-003)
notificationAdminRoutes.get('/notification-templates', async (c) => {
  try {
    return c.json({ success: true, data: { templates: await listTemplates() } });
  } catch (err: any) {
    return fail(c, err);
  }
});

// POST /api/v1/admin/notification-templates/seed - ensure default templates
notificationAdminRoutes.post('/notification-templates/seed', async (c) => {
  try {
    const inserted = await ensureDefaultTemplates(actorId(c));
    return c.json({ success: true, data: { inserted } });
  } catch (err: any) {
    return fail(c, err);
  }
});

// PUT /api/v1/admin/notification-templates/:code - create or update template (NTF-003)
notificationAdminRoutes.put('/notification-templates/:code', async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const row = await upsertTemplate(actorId(c), c.req.param('code') as string, body);
    return c.json({ success: true, data: row });
  } catch (err: any) {
    return fail(c, err);
  }
});
