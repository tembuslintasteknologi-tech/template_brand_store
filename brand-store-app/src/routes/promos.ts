import { Hono } from 'hono';
import { db } from '../db/index.js';
import { promos } from '../db/promosSchema.js';
import { authMiddleware, adminOnlyMiddleware } from '../middleware/auth.js';
import { eq, desc } from 'drizzle-orm';
import { z } from 'zod';
import { featureGate } from '../middleware/featureGate.js';
import { ok, fail } from '../utils/response.js';
import { evaluatePromo, type PromoRule } from '../services/promoEngine.js';

export const promoRoutes = new Hono();

// CFG-006: the promos module is gated by the `promos` feature flag.
promoRoutes.use('*', featureGate('promos'));

const promoSchema = z.object({
  code: z.string().min(3),
  discountType: z.enum(['percentage', 'fixed']),
  discountValue: z.number().positive(),
  minOrderAmount: z.number().optional().default(0),
  maxDiscount: z.number().optional(),
  usageLimit: z.number().optional(),
  startDate: z.string(),
  endDate: z.string(),
});

// GET /api/promos - Admin or customer list active promos
promoRoutes.get('/', async (c) => {
  try {
    const list = await db.select().from(promos).orderBy(desc(promos.createdAt));
    return c.json({ success: true, data: list });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500);
  }
});

// POST /api/promos - Admin create promo
promoRoutes.post('/', authMiddleware, adminOnlyMiddleware, async (c) => {
  try {
    const body = await c.req.json();
    const parsed = promoSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ success: false, error: parsed.error.format() }, 400);
    }

    const data = parsed.data;
    const [newPromo] = await db.insert(promos).values({
      code: data.code.toUpperCase(),
      discountType: data.discountType,
      discountValue: data.discountValue.toString(),
      minOrderAmount: data.minOrderAmount.toString(),
      maxDiscount: data.maxDiscount ? data.maxDiscount.toString() : null,
      usageLimit: data.usageLimit || null,
      startDate: new Date(data.startDate),
      endDate: new Date(data.endDate),
      isActive: true,
    }).returning();

    return c.json({ success: true, data: newPromo }, 201);
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500);
  }
});

const validatePromoSchema = z.object({
  code: z.string().trim().min(1, 'Promo code is required'),
  subtotal: z.number().nonnegative().optional().default(0),
});

// POST /api/promos/validate
promoRoutes.post('/validate', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const parsed = validatePromoSchema.safeParse(body);
  if (!parsed.success) {
    return fail(c, 'VALIDATION_ERROR', 'Validation failed', 400, parsed.error.issues);
  }

  const { code, subtotal } = parsed.data;
  try {
    const [promo] = await db
      .select()
      .from(promos)
      .where(eq(promos.code, code.toUpperCase()))
      .limit(1);

    if (!promo) {
      return fail(c, 'NOT_FOUND', 'Promo code not found', 404);
    }

    const rule: PromoRule = {
      code: promo.code,
      discountType: promo.discountType as any,
      discountValue: Number(promo.discountValue),
      minOrderAmount: promo.minOrderAmount ? Number(promo.minOrderAmount) : null,
      maxDiscount: promo.maxDiscount ? Number(promo.maxDiscount) : null,
      startDate: promo.startDate,
      endDate: promo.endDate,
      isActive: promo.isActive,
      usageLimit: promo.usageLimit,
      usageCount: promo.usageCount,
    };

    const evalResult = evaluatePromo(rule, subtotal);
    if (!evalResult.valid) {
      return fail(c, 'VALIDATION_ERROR', `Promo cannot be applied: ${evalResult.reason}`, 400, {
        reason: evalResult.reason,
      });
    }

    return ok(c, {
      valid: true,
      code: rule.code,
      discountAmount: evalResult.discountAmount,
      discountType: rule.discountType,
      discountValue: rule.discountValue,
    });
  } catch (err: any) {
    return fail(c, 'INTERNAL_ERROR', err.message, 500);
  }
});

