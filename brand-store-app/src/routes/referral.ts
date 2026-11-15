import { Hono } from 'hono';
import { z } from 'zod';
import { authMiddleware, adminOnlyMiddleware } from '../middleware/auth.js';
import { featureGate } from '../middleware/featureGate.js';
import { fail, ok, serverError } from '../utils/response.js';
import { putSetting } from '../services/config/settings.js';
import { ReferralError } from '../services/referral/referralService.js';
import {
  cancelReferral,
  claimReferral,
  getReferralBaseUrl,
  getReferralDashboard,
  getReferralForAdmin,
  getReferralForReferee,
  getReferralProgram,
  listReferralsForAdmin,
  qualifyReferral,
} from '../services/referral/referralRepository.js';

function referralFail(c: any, err: unknown) {
  if (err instanceof ReferralError) {
    const status = err.status as 400 | 403 | 404 | 409 | 500;
    return c.json(
      {
        success: false,
        error: { code: err.code, message: err.message },
        requestId: c.get('requestId') ?? null,
      },
      status
    );
  }
  return serverError(c, err);
}

const claimSchema = z.object({
  // A code or a pasted share link. The service normalises both.
  code: z.string().min(4).max(300),
});

const qualifySchema = z.object({
  orderId: z.string().uuid(),
  note: z.string().max(300).optional(),
});

const cancelSchema = z.object({
  note: z.string().max(300).optional(),
});

const programSchema = z.object({
  referrerPoints: z.number().int().nonnegative(),
  refereePoints: z.number().int().nonnegative(),
  maxReferralsPerUser: z.number().int().nonnegative().nullable(),
});

/** Customer referral endpoints (RFR-001, RFR-002, RFR-005). */
export const referralRoutes = new Hono();
referralRoutes.use('*', featureGate('referral'));

// GET /api/v1/referrals/program
referralRoutes.get('/program', async (c) => {
  try {
    return ok(c, await getReferralProgram());
  } catch (err) {
    return referralFail(c, err);
  }
});

// GET /api/v1/referrals/me
referralRoutes.get('/me', authMiddleware, async (c) => {
  try {
    const user = c.get('user') as { id: string };
    return ok(c, await getReferralDashboard(user.id));
  } catch (err) {
    return referralFail(c, err);
  }
});

// GET /api/v1/referrals
referralRoutes.get('/', authMiddleware, async (c) => {
  try {
    const user = c.get('user') as { id: string };
    const dashboard = await getReferralDashboard(user.id);
    return ok(c, dashboard.referrals);
  } catch (err) {
    return referralFail(c, err);
  }
});

// GET /api/v1/referrals/inbound, the referral where the caller is the invited side.
referralRoutes.get('/inbound', authMiddleware, async (c) => {
  try {
    const user = c.get('user') as { id: string };
    return ok(c, await getReferralForReferee(user.id));
  } catch (err) {
    return referralFail(c, err);
  }
});

// POST /api/v1/referrals/claim
referralRoutes.post('/claim', authMiddleware, async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const parsed = claimSchema.safeParse(body);
    if (!parsed.success) {
      return fail(c, 'VALIDATION_ERROR', 'Payload klaim referral tidak valid', 400, parsed.error.issues);
    }
    const user = c.get('user') as { id: string };
    return ok(c, await claimReferral({ refereeId: user.id, codeOrLink: parsed.data.code }), 201);
  } catch (err) {
    return referralFail(c, err);
  }
});

/** Admin referral endpoints: listing, verification, cancellation, program config. */
export const referralAdminRoutes = new Hono();
referralAdminRoutes.use('*', featureGate('referral'));
referralAdminRoutes.use('*', authMiddleware, adminOnlyMiddleware);

// GET /api/v1/admin/referrals?status=pending&limit=50
referralAdminRoutes.get('/referrals', async (c) => {
  try {
    return ok(
      c,
      await listReferralsForAdmin({
        status: c.req.query('status') ?? null,
        limit: Number(c.req.query('limit') ?? 50),
      })
    );
  } catch (err) {
    return referralFail(c, err);
  }
});

// GET /api/v1/admin/referrals/program
referralAdminRoutes.get('/referrals/program', async (c) => {
  try {
    return ok(c, {
      program: await getReferralProgram(),
      baseUrl: await getReferralBaseUrl(),
    });
  } catch (err) {
    return referralFail(c, err);
  }
});

// PUT /api/v1/admin/referrals/program
referralAdminRoutes.put('/referrals/program', async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const parsed = programSchema.safeParse(body);
    if (!parsed.success) {
      return fail(c, 'VALIDATION_ERROR', 'Konfigurasi referral tidak valid', 400, parsed.error.issues);
    }
    const actor = c.get('user') as { id: string };
    return ok(c, await putSetting(actor.id, 'referral.program', parsed.data));
  } catch (err) {
    return referralFail(c, err);
  }
});

// GET /api/v1/admin/referrals/:id
referralAdminRoutes.get('/referrals/:id', async (c) => {
  try {
    return ok(c, await getReferralForAdmin(c.req.param('id') as string));
  } catch (err) {
    return referralFail(c, err);
  }
});

// POST /api/v1/admin/referrals/:id/qualify
referralAdminRoutes.post('/referrals/:id/qualify', async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const parsed = qualifySchema.safeParse(body);
    if (!parsed.success) {
      return fail(c, 'VALIDATION_ERROR', 'Payload verifikasi referral tidak valid', 400, parsed.error.issues);
    }
    return ok(
      c,
      await qualifyReferral({
        referralId: c.req.param('id') as string,
        qualifyingOrderId: parsed.data.orderId,
        note: parsed.data.note ?? null,
      })
    );
  } catch (err) {
    return referralFail(c, err);
  }
});

// POST /api/v1/admin/referrals/:id/cancel
referralAdminRoutes.post('/referrals/:id/cancel', async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const parsed = cancelSchema.safeParse(body);
    if (!parsed.success) {
      return fail(c, 'VALIDATION_ERROR', 'Payload pembatalan referral tidak valid', 400, parsed.error.issues);
    }
    return ok(
      c,
      await cancelReferral({
        referralId: c.req.param('id') as string,
        note: parsed.data.note ?? null,
      })
    );
  } catch (err) {
    return referralFail(c, err);
  }
});
