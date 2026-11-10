import { Hono } from 'hono';
import { db } from '../db/index.js';
import { promos } from '../db/promosSchema.js';
import { authMiddleware, adminOnlyMiddleware } from '../middleware/auth.js';
import { eq, desc } from 'drizzle-orm';
import { z } from 'zod';

export const promoRoutes = new Hono();

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
