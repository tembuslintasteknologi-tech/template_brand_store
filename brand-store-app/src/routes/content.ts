import { Hono } from 'hono';
import { authMiddleware, adminOnlyMiddleware } from '../middleware/auth.js';
import {
  ContentError,
  createBanner,
  deleteBanner,
  listAllBanners,
  listPublicBanners,
  updateBanner,
} from '../services/content/bannerService.js';
import {
  createPage,
  deletePage,
  getPublicPage,
  listAllPages,
  listPublicPages,
  updatePage,
} from '../services/content/pageService.js';

export const contentPublicRoutes = new Hono();

// GET /api/v1/banners - active banners, optionally filtered by placement
contentPublicRoutes.get('/banners', async (c) => {
  try {
    const placement = c.req.query('placement');
    const rows = await listPublicBanners(placement);
    return c.json({ success: true, data: { banners: rows, count: rows.length } });
  } catch (err: any) {
    return c.json({ success: false, error: err?.message ?? 'failed' }, 500);
  }
});

// GET /api/v1/pages - published page index
contentPublicRoutes.get('/pages', async (c) => {
  try {
    const rows = await listPublicPages();
    return c.json({ success: true, data: { pages: rows, count: rows.length } });
  } catch (err: any) {
    return c.json({ success: false, error: err?.message ?? 'failed' }, 500);
  }
});

// GET /api/v1/pages/:slug - published page detail
contentPublicRoutes.get('/pages/:slug', async (c) => {
  try {
    const row = await getPublicPage(c.req.param('slug') as string);
    return c.json({ success: true, data: row });
  } catch (err: any) {
    const status = err instanceof ContentError ? err.status : 500;
    return c.json({ success: false, error: err?.message ?? 'failed' }, status as any);
  }
});

export const contentAdminRoutes = new Hono();
contentAdminRoutes.use('*', authMiddleware, adminOnlyMiddleware);

function actorId(c: any): string {
  return (c.get('user') as { id: string }).id;
}

function fail(c: any, err: any) {
  const status = err instanceof ContentError ? err.status : 500;
  return c.json({ success: false, error: err?.message ?? 'failed' }, status as any);
}

// GET /api/v1/admin/banners - every banner including inactive (CMS-001)
contentAdminRoutes.get('/banners', async (c) => {
  try {
    const rows = await listAllBanners();
    return c.json({ success: true, data: { banners: rows, count: rows.length } });
  } catch (err: any) {
    return fail(c, err);
  }
});

// POST /api/v1/admin/banners - create banner (CMS-001)
contentAdminRoutes.post('/banners', async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const row = await createBanner(actorId(c), body);
    return c.json({ success: true, data: row }, 201);
  } catch (err: any) {
    return fail(c, err);
  }
});

// PATCH /api/v1/admin/banners/:id - update banner (CMS-002)
contentAdminRoutes.patch('/banners/:id', async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const row = await updateBanner(actorId(c), c.req.param('id') as string, body);
    return c.json({ success: true, data: row });
  } catch (err: any) {
    return fail(c, err);
  }
});

// DELETE /api/v1/admin/banners/:id - delete banner (CMS-002)
contentAdminRoutes.delete('/banners/:id', async (c) => {
  try {
    const row = await deleteBanner(actorId(c), c.req.param('id') as string);
    return c.json({ success: true, data: row });
  } catch (err: any) {
    return fail(c, err);
  }
});

// GET /api/v1/admin/pages - every page including drafts (PGE-001)
contentAdminRoutes.get('/pages', async (c) => {
  try {
    const rows = await listAllPages();
    return c.json({ success: true, data: { pages: rows, count: rows.length } });
  } catch (err: any) {
    return fail(c, err);
  }
});

// POST /api/v1/admin/pages - create page (PGE-001)
contentAdminRoutes.post('/pages', async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const row = await createPage(actorId(c), body);
    return c.json({ success: true, data: row }, 201);
  } catch (err: any) {
    return fail(c, err);
  }
});

// PATCH /api/v1/admin/pages/:slug - update page, including publish toggle (PGE-002)
contentAdminRoutes.patch('/pages/:slug', async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const row = await updatePage(actorId(c), c.req.param('slug') as string, body);
    return c.json({ success: true, data: row });
  } catch (err: any) {
    return fail(c, err);
  }
});

// DELETE /api/v1/admin/pages/:slug - delete page (PGE-002)
contentAdminRoutes.delete('/pages/:slug', async (c) => {
  try {
    const row = await deletePage(actorId(c), c.req.param('slug') as string);
    return c.json({ success: true, data: row });
  } catch (err: any) {
    return fail(c, err);
  }
});
