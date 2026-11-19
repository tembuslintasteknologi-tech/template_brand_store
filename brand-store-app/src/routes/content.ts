import { Hono } from 'hono';
import { authMiddleware, adminOnlyMiddleware, verifyJwt } from '../middleware/auth.js';
import {
  ContentError,
  createBanner,
  deleteBanner,
  getBannerAnalytics,
  listAllBanners,
  listPublicBanners,
  recordBannerEvent,
  resolveViewerAudience,
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
import {
  applyExperimentWinner,
  createBannerVariant,
  deleteBannerVariant,
  getBannerExperiment,
  getBannerExperimentReport,
  listBannerVariants,
  resolvePublicBannerVariant,
  setBannerExperiment,
  updateBannerVariant,
} from '../services/content/bannerExperimentService.js';

export const contentPublicRoutes = new Hono();

/**
 * Reads the bearer token if present. A bad token is treated as anonymous rather than a 401,
 * because browsing banners must never fail just because a stale token is still in storage.
 */
function optionalViewer(c: any): { userId: string | null; audience: 'guest' | 'customer' } {
  const header = c.req.header('authorization') ?? c.req.header('Authorization');
  if (header && header.toLowerCase().startsWith('bearer ')) {
    try {
      const decoded: any = verifyJwt(header.slice(7).trim());
      if (decoded?.sub || decoded?.id) {
        return { userId: String(decoded.sub ?? decoded.id), audience: 'customer' };
      }
    } catch {
      // fall through to guest
    }
  }
  return { userId: null, audience: resolveViewerAudience(false) };
}

// GET /api/v1/banners - live banners for the caller's segment, optionally filtered by placement
contentPublicRoutes.get('/banners', async (c) => {
  try {
    const placement = c.req.query('placement');
    const viewer = optionalViewer(c);
    const rows = await listPublicBanners(placement, new Date(), viewer.audience);
    c.header('Cache-Control', 'private, max-age=30');
    c.header('Vary', 'Authorization, Accept-Encoding');
    return c.json({
      success: true,
      data: { banners: rows, count: rows.length, audience: viewer.audience },
    });
  } catch (err: any) {
    console.error('[banners-public]', err?.message);
    return c.json({ success: false, error: 'failed' }, 500);
  }
});

// POST /api/v1/banners/:id/events - record a view or a click (CMS-004)
contentPublicRoutes.post('/banners/:id/events', async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const viewer = optionalViewer(c);
    const row = await recordBannerEvent(c.req.param('id') as string, body, viewer);
    return c.json({ success: true, data: row }, 201);
  } catch (err: any) {
    if (err instanceof ContentError) {
      return c.json({ success: false, error: err.message }, err.status as any);
    }
    console.error('[banner-event]', err?.message);
    return c.json({ success: false, error: 'failed' }, 500);
  }
});

// GET /api/v1/banners/:id/variant - assigned A/B creative for this session (CMS-005)
contentPublicRoutes.get('/banners/:id/variant', async (c) => {
  try {
    const sessionId = c.req.query('sessionId') ?? null;
    const result = await resolvePublicBannerVariant(c.req.param('id') as string, sessionId);
    return c.json({ success: true, data: result });
  } catch (err: any) {
    if (err instanceof ContentError) {
      return c.json({ success: false, error: err.message }, err.status as any);
    }
    console.error('[banner-variant]', err?.message);
    return c.json({ success: false, error: 'failed' }, 500);
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
    if (err instanceof ContentError) {
      return c.json({ success: false, error: err.message }, err.status as any);
    }
    console.error('[page-public]', err?.message);
    return c.json({ success: false, error: 'failed' }, 500);
  }
});

export const contentAdminRoutes = new Hono();
contentAdminRoutes.use('*', authMiddleware, adminOnlyMiddleware);

function actorId(c: any): string {
  return (c.get('user') as { id: string }).id;
}

function fail(c: any, err: any) {
  if (err instanceof ContentError) {
    return c.json({ success: false, error: err.message }, err.status as any);
  }
  console.error('[content-admin]', err?.message);
  return c.json({ success: false, error: 'failed' }, 500);
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

// GET /api/v1/admin/banners/analytics - per-banner views, clicks, CTR (CMS-004)
contentAdminRoutes.get('/banners/analytics', async (c) => {
  try {
    const parseDate = (raw: string | undefined, label: string) => {
      if (!raw) return undefined;
      const date = new Date(raw);
      if (Number.isNaN(date.getTime())) throw new ContentError(`${label} bukan tanggal valid`);
      return date;
    };
    const from = parseDate(c.req.query('from'), 'from');
    const to = parseDate(c.req.query('to'), 'to');
    if (from && to && from.getTime() > to.getTime()) {
      throw new ContentError('from harus lebih awal dari to');
    }
    const report = await getBannerAnalytics(from, to);
    return c.json({ success: true, data: report });
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

// GET /api/v1/admin/banners/:id/variants - A/B creatives for one banner (CMS-005)
contentAdminRoutes.get('/banners/:id/variants', async (c) => {
  try {
    const rows = await listBannerVariants(c.req.param('id') as string);
    return c.json({ success: true, data: { variants: rows, count: rows.length } });
  } catch (err: any) {
    return fail(c, err);
  }
});

// POST /api/v1/admin/banners/:id/variants - add a creative
contentAdminRoutes.post('/banners/:id/variants', async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const row = await createBannerVariant(actorId(c), c.req.param('id') as string, body);
    return c.json({ success: true, data: row }, 201);
  } catch (err: any) {
    return fail(c, err);
  }
});

// PATCH /api/v1/admin/banners/:id/variants/:variantId - edit weight, creative, control flag
contentAdminRoutes.patch('/banners/:id/variants/:variantId', async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const row = await updateBannerVariant(
      actorId(c),
      c.req.param('id') as string,
      c.req.param('variantId') as string,
      body
    );
    return c.json({ success: true, data: row });
  } catch (err: any) {
    return fail(c, err);
  }
});

// DELETE /api/v1/admin/banners/:id/variants/:variantId
contentAdminRoutes.delete('/banners/:id/variants/:variantId', async (c) => {
  try {
    const row = await deleteBannerVariant(
      actorId(c),
      c.req.param('id') as string,
      c.req.param('variantId') as string
    );
    return c.json({ success: true, data: row });
  } catch (err: any) {
    return fail(c, err);
  }
});

// GET /api/v1/admin/banners/:id/experiment - settings plus split CTR and winner suggestion
contentAdminRoutes.get('/banners/:id/experiment', async (c) => {
  try {
    const parseDate = (raw: string | undefined, label: string) => {
      if (!raw) return undefined;
      const date = new Date(raw);
      if (Number.isNaN(date.getTime())) throw new ContentError(`${label} bukan tanggal valid`);
      return date;
    };
    const report = await getBannerExperimentReport(c.req.param('id') as string, {
      from: parseDate(c.req.query('from'), 'from'),
      to: parseDate(c.req.query('to'), 'to'),
    });
    return c.json({ success: true, data: report });
  } catch (err: any) {
    return fail(c, err);
  }
});

// PUT /api/v1/admin/banners/:id/experiment - create or update the experiment row
contentAdminRoutes.put('/banners/:id/experiment', async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const row = await setBannerExperiment(actorId(c), c.req.param('id') as string, body);
    return c.json({ success: true, data: row });
  } catch (err: any) {
    return fail(c, err);
  }
});

// POST /api/v1/admin/banners/:id/experiment/apply - promote a variant into the banner
contentAdminRoutes.post('/banners/:id/experiment/apply', async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const result = await applyExperimentWinner(
      actorId(c),
      c.req.param('id') as string,
      body?.variantId ? String(body.variantId) : null
    );
    return c.json({ success: true, data: result });
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
