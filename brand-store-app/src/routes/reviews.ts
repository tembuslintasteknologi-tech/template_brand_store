import { Hono } from 'hono';
import { authMiddleware, adminOnlyMiddleware } from '../middleware/auth.js';
import {
  ReviewError,
  createReview,
  listProductReviews,
  listReviewReports,
  listReviewsForModeration,
  markReviewHelpful,
  replyToReview,
  reportReview,
  resolveReviewReport,
  setReviewVisibility,
} from '../services/reviews/reviewService.js';

function fail(c: any, err: any) {
  const status = err instanceof ReviewError ? err.status : err?.name === 'ZodError' ? 400 : 500;
  return c.json({ success: false, error: err?.message ?? 'failed' }, status as any);
}

function userIdOf(c: any): string {
  return (c.get('user') as { id: string }).id;
}

export const reviewPublicRoutes = new Hono();

// GET /api/v1/products/:productId/reviews - visible reviews + rating summary
reviewPublicRoutes.get('/products/:productId/reviews', async (c) => {
  try {
    const data = await listProductReviews(c.req.param('productId') as string, {
      sort: c.req.query('sort'),
      limit: Number(c.req.query('limit') ?? 20),
    });
    return c.json({ success: true, data });
  } catch (err: any) {
    return fail(c, err);
  }
});

// POST /api/v1/products/:productId/reviews - write review (verified purchase only)
reviewPublicRoutes.post('/products/:productId/reviews', authMiddleware, async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const row = await createReview(userIdOf(c), { ...body, productId: c.req.param('productId') });
    return c.json({ success: true, data: row }, 201);
  } catch (err: any) {
    return fail(c, err);
  }
});

// POST /api/v1/reviews/:id/helpful - mark a review helpful (idempotent)
reviewPublicRoutes.post('/reviews/:id/helpful', authMiddleware, async (c) => {
  try {
    const data = await markReviewHelpful(userIdOf(c), c.req.param('id') as string);
    return c.json({ success: true, data });
  } catch (err: any) {
    return fail(c, err);
  }
});

// POST /api/v1/reviews/:id/report - report an abusive review
reviewPublicRoutes.post('/reviews/:id/report', authMiddleware, async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const row = await reportReview(userIdOf(c), c.req.param('id') as string, body);
    return c.json({ success: true, data: row }, 201);
  } catch (err: any) {
    return fail(c, err);
  }
});

export const reviewAdminRoutes = new Hono();
reviewAdminRoutes.use('*', authMiddleware, adminOnlyMiddleware);

// GET /api/v1/admin/reviews - moderation queue
reviewAdminRoutes.get('/reviews', async (c) => {
  try {
    const rows = await listReviewsForModeration({
      status: c.req.query('status'),
      limit: Number(c.req.query('limit') ?? 50),
    });
    return c.json({ success: true, data: { reviews: rows, count: rows.length } });
  } catch (err: any) {
    return fail(c, err);
  }
});

// PATCH /api/v1/admin/reviews/:id/visibility - hide or unhide
reviewAdminRoutes.patch('/reviews/:id/visibility', async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const row = await setReviewVisibility(userIdOf(c), c.req.param('id') as string, body);
    return c.json({ success: true, data: row });
  } catch (err: any) {
    return fail(c, err);
  }
});

// POST /api/v1/admin/reviews/:id/reply - public admin reply
reviewAdminRoutes.post('/reviews/:id/reply', async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const row = await replyToReview(userIdOf(c), c.req.param('id') as string, body);
    return c.json({ success: true, data: row });
  } catch (err: any) {
    return fail(c, err);
  }
});

// GET /api/v1/admin/review-reports - pending abuse reports
reviewAdminRoutes.get('/review-reports', async (c) => {
  try {
    const rows = await listReviewReports({ status: c.req.query('status'), limit: Number(c.req.query('limit') ?? 50) });
    return c.json({ success: true, data: { reports: rows, count: rows.length } });
  } catch (err: any) {
    return fail(c, err);
  }
});

// POST /api/v1/admin/review-reports/:id/resolve - close a report, optionally hide the review
reviewAdminRoutes.post('/review-reports/:id/resolve', async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const row = await resolveReviewReport(userIdOf(c), c.req.param('id') as string, body);
    return c.json({ success: true, data: row });
  } catch (err: any) {
    return fail(c, err);
  }
});
