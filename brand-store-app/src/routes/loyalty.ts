import { Hono } from 'hono';
import { z } from 'zod';
import { authMiddleware, adminOnlyMiddleware } from '../middleware/auth.js';
import { featureGate } from '../middleware/featureGate.js';
import { fail, ok, serverError } from '../utils/response.js';
import { putSetting } from '../services/config/settings.js';
import { LoyaltyError } from '../services/loyalty/loyaltyService.js';
import {
  adjustPoints,
  earnPoints,
  getLoyaltyAccountForAdmin,
  getLoyaltyProgram,
  getLoyaltySummary,
  getLoyaltyTransactions,
  listLoyaltyAccounts,
  redeemPoints,
} from '../services/loyalty/loyaltyRepository.js';

function loyaltyFail(c: any, err: unknown) {
  if (err instanceof LoyaltyError) {
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

const redeemSchema = z.object({
  points: z.number().int().positive(),
  orderId: z.string().uuid().nullable().optional(),
  note: z.string().max(300).optional(),
});

const earnSchema = z
  .object({
    source: z.enum(['purchase', 'review', 'referral']),
    referenceId: z.string().min(1).max(100).optional(),
    orderTotal: z.number().nonnegative().optional(),
    note: z.string().max(300).optional(),
  })
  .refine((body) => body.source !== 'purchase' || typeof body.orderTotal === 'number', {
    message: 'orderTotal wajib diisi untuk sumber purchase',
    path: ['orderTotal'],
  });

const adjustSchema = z.object({
  points: z.number().int().refine((value) => value !== 0, 'delta tidak boleh nol'),
  note: z.string().min(3).max(300),
});

const programSchema = z.object({
  tiers: z
    .array(
      z.object({
        tier: z.enum(['bronze', 'silver', 'gold', 'platinum']),
        minLifetimePoints: z.number().int().nonnegative(),
        discountPercent: z.number().min(0).max(100),
        freeShippingMinAmount: z.number().nonnegative().nullable(),
      })
    )
    .length(4),
  earn: z.object({
    rupiahPerPoint: z.number().int().positive(),
    reviewPoints: z.number().int().nonnegative(),
    referralPoints: z.number().int().nonnegative(),
  }),
  redeem: z.object({
    currencyPerPoint: z.number().int().positive(),
    minPoints: z.number().int().nonnegative(),
  }),
});

/** Customer loyalty endpoints (LTY-001, LTY-002, LTY-003, LTY-004). */
export const loyaltyRoutes = new Hono();
loyaltyRoutes.use('*', featureGate('loyalty'));

// GET /api/v1/loyalty/program
loyaltyRoutes.get('/program', async (c) => {
  try {
    return ok(c, await getLoyaltyProgram());
  } catch (err) {
    return loyaltyFail(c, err);
  }
});

// GET /api/v1/loyalty
loyaltyRoutes.get('/', authMiddleware, async (c) => {
  try {
    const user = c.get('user') as { id: string };
    return ok(c, await getLoyaltySummary(user.id));
  } catch (err) {
    return loyaltyFail(c, err);
  }
});

// GET /api/v1/loyalty/transactions?limit=50
loyaltyRoutes.get('/transactions', authMiddleware, async (c) => {
  try {
    const user = c.get('user') as { id: string };
    const limit = Number(c.req.query('limit') ?? 50);
    return ok(c, await getLoyaltyTransactions(user.id, limit));
  } catch (err) {
    return loyaltyFail(c, err);
  }
});

// POST /api/v1/loyalty/redeem
loyaltyRoutes.post('/redeem', authMiddleware, async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const parsed = redeemSchema.safeParse(body);
    if (!parsed.success) {
      return fail(c, 'VALIDATION_ERROR', 'Payload penukaran poin tidak valid', 400, parsed.error.issues);
    }
    const user = c.get('user') as { id: string };
    return ok(
      c,
      await redeemPoints({
        userId: user.id,
        points: parsed.data.points,
        orderId: parsed.data.orderId ?? null,
        note: parsed.data.note ?? null,
      })
    );
  } catch (err) {
    return loyaltyFail(c, err);
  }
});

/** Admin loyalty endpoints: listing, manual earn, correction, program config. */
export const loyaltyAdminRoutes = new Hono();
loyaltyAdminRoutes.use('*', featureGate('loyalty'));
loyaltyAdminRoutes.use('*', authMiddleware, adminOnlyMiddleware);

// GET /api/v1/admin/loyalty/accounts?tier=gold&limit=50
loyaltyAdminRoutes.get('/loyalty/accounts', async (c) => {
  try {
    return ok(
      c,
      await listLoyaltyAccounts({
        tier: c.req.query('tier') ?? null,
        limit: Number(c.req.query('limit') ?? 50),
      })
    );
  } catch (err) {
    return loyaltyFail(c, err);
  }
});

// GET /api/v1/admin/loyalty/accounts/:userId
loyaltyAdminRoutes.get('/loyalty/accounts/:userId', async (c) => {
  try {
    return ok(c, await getLoyaltyAccountForAdmin(c.req.param('userId') as string));
  } catch (err) {
    return loyaltyFail(c, err);
  }
});

// POST /api/v1/admin/loyalty/accounts/:userId/earn
loyaltyAdminRoutes.post('/loyalty/accounts/:userId/earn', async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const parsed = earnSchema.safeParse(body);
    if (!parsed.success) {
      return fail(c, 'VALIDATION_ERROR', 'Payload earn tidak valid', 400, parsed.error.issues);
    }
    return ok(
      c,
      await earnPoints({
        userId: c.req.param('userId') as string,
        source: parsed.data.source,
        referenceId: parsed.data.referenceId ?? null,
        orderTotal: parsed.data.orderTotal ?? null,
        note: parsed.data.note ?? null,
      }),
      201
    );
  } catch (err) {
    return loyaltyFail(c, err);
  }
});

// POST /api/v1/admin/loyalty/accounts/:userId/adjust
loyaltyAdminRoutes.post('/loyalty/accounts/:userId/adjust', async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const parsed = adjustSchema.safeParse(body);
    if (!parsed.success) {
      return fail(c, 'VALIDATION_ERROR', 'Payload penyesuaian tidak valid', 400, parsed.error.issues);
    }
    const actor = c.get('user') as { id: string };
    return ok(
      c,
      await adjustPoints({
        userId: c.req.param('userId') as string,
        points: parsed.data.points,
        note: parsed.data.note,
        actorId: actor.id,
      }),
      201
    );
  } catch (err) {
    return loyaltyFail(c, err);
  }
});

// GET /api/v1/admin/loyalty/program
loyaltyAdminRoutes.get('/loyalty/program', async (c) => {
  try {
    return ok(c, await getLoyaltyProgram());
  } catch (err) {
    return loyaltyFail(c, err);
  }
});

// PUT /api/v1/admin/loyalty/program
loyaltyAdminRoutes.put('/loyalty/program', async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const parsed = programSchema.safeParse(body);
    if (!parsed.success) {
      return fail(c, 'VALIDATION_ERROR', 'Konfigurasi loyalty tidak valid', 400, parsed.error.issues);
    }
    const actor = c.get('user') as { id: string };
    return ok(c, await putSetting(actor.id, 'loyalty.program', parsed.data));
  } catch (err) {
    return loyaltyFail(c, err);
  }
});
