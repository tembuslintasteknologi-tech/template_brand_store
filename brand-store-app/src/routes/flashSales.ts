import { Hono } from 'hono';
import { z } from 'zod';
import { authMiddleware, adminOnlyMiddleware } from '../middleware/auth.js';
import { featureGate } from '../middleware/featureGate.js';
import { fail, ok, serverError } from '../utils/response.js';
import { FlashSaleError } from '../services/promo/flashSaleService.js';
import {
  addFlashSaleItem,
  createFlashSale,
  deleteFlashSale,
  getFlashSaleView,
  listAdminFlashSaleViews,
  listPublicFlashSaleViews,
  recordFlashSalePurchase,
  removeFlashSaleItem,
  updateFlashSale,
  updateFlashSaleItem,
} from '../services/promo/flashSaleRepository.js';

function flashSaleFail(c: any, err: unknown) {
  if (err instanceof FlashSaleError) {
    const status = err.status as 400 | 403 | 404 | 409;
    return c.json(
      { success: false, error: { code: err.code, message: err.message }, requestId: c.get('requestId') ?? null },
      status
    );
  }
  return serverError(c, err);
}

const itemSchema = z.object({
  productId: z.string().uuid(),
  variantId: z.string().uuid().nullable().optional(),
  discountType: z.enum(['percentage', 'fixed']),
  discountValue: z.number().positive(),
  stock: z.number().int().nonnegative(),
  perUserLimit: z.number().int().positive().nullable().optional(),
});

const createSaleSchema = z.object({
  title: z.string().min(3).max(150),
  startAt: z.string(),
  endAt: z.string(),
  isActive: z.boolean().optional(),
  items: z.array(itemSchema).optional(),
});

const updateSaleSchema = z.object({
  title: z.string().min(3).max(150).optional(),
  startAt: z.string().optional(),
  endAt: z.string().optional(),
  isActive: z.boolean().optional(),
});

const updateItemSchema = z.object({
  discountType: z.enum(['percentage', 'fixed']).optional(),
  discountValue: z.number().positive().optional(),
  stock: z.number().int().nonnegative().optional(),
  perUserLimit: z.number().int().positive().nullable().optional(),
});

const purchaseSchema = z.object({
  quantity: z.number().int().positive(),
  orderId: z.string().uuid().nullable().optional(),
});

/** Public flash sale storefront (FLS-004, FLS-005). */
export const flashSaleRoutes = new Hono();
flashSaleRoutes.use('*', featureGate('flash_sale'));

// GET /api/v1/flash-sales
flashSaleRoutes.get('/', async (c) => {
  try {
    return ok(c, await listPublicFlashSaleViews());
  } catch (err) {
    return flashSaleFail(c, err);
  }
});

// GET /api/v1/flash-sales/:id
flashSaleRoutes.get('/:id', async (c) => {
  try {
    return ok(c, await getFlashSaleView(c.req.param('id') as string));
  } catch (err) {
    return flashSaleFail(c, err);
  }
});

// POST /api/v1/flash-sales/:id/items/:itemId/purchase
// Allocates flash stock for the signed-in customer and writes the per-user ledger (FLS-002, FLS-006).
flashSaleRoutes.post('/:id/items/:itemId/purchase', authMiddleware, async (c) => {
  try {
    const saleId = c.req.param('id') as string;
    const itemId = c.req.param('itemId') as string;
    const body = await c.req.json().catch(() => ({}));
    const parsed = purchaseSchema.safeParse(body);
    if (!parsed.success) {
      return fail(c, 'VALIDATION_ERROR', 'Payload pembelian tidak valid', 400, parsed.error.issues);
    }

    // Confirms the item belongs to the sale before writing, so a mismatched URL cannot buy
    // an item from a different sale.
    const sale = await getFlashSaleView(saleId);
    if (!sale.items.some((item) => item.id === itemId)) {
      return fail(c, 'NOT_FOUND', 'Item tidak termasuk flash sale tersebut', 404);
    }

    const user = c.get('user') as { id: string };
    const result = await recordFlashSalePurchase({
      flashSaleItemId: itemId,
      userId: user.id,
      quantity: parsed.data.quantity,
      orderId: parsed.data.orderId ?? null,
    });

    return ok(c, result, 201);
  } catch (err) {
    return flashSaleFail(c, err);
  }
});

/** Admin flash sale CRUD (FLS-001). */
export const flashSaleAdminRoutes = new Hono();
flashSaleAdminRoutes.use('*', featureGate('flash_sale'));
flashSaleAdminRoutes.use('*', authMiddleware, adminOnlyMiddleware);

// GET /api/v1/admin/flash-sales
flashSaleAdminRoutes.get('/flash-sales', async (c) => {
  try {
    return ok(c, await listAdminFlashSaleViews());
  } catch (err) {
    return flashSaleFail(c, err);
  }
});

// POST /api/v1/admin/flash-sales
flashSaleAdminRoutes.post('/flash-sales', async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const parsed = createSaleSchema.safeParse(body);
    if (!parsed.success) {
      return fail(c, 'VALIDATION_ERROR', 'Payload flash sale tidak valid', 400, parsed.error.issues);
    }
    return ok(c, await createFlashSale(parsed.data), 201);
  } catch (err) {
    return flashSaleFail(c, err);
  }
});

// GET /api/v1/admin/flash-sales/:id
flashSaleAdminRoutes.get('/flash-sales/:id', async (c) => {
  try {
    return ok(c, await getFlashSaleView(c.req.param('id') as string));
  } catch (err) {
    return flashSaleFail(c, err);
  }
});

// PATCH /api/v1/admin/flash-sales/:id
flashSaleAdminRoutes.patch('/flash-sales/:id', async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const parsed = updateSaleSchema.safeParse(body);
    if (!parsed.success) {
      return fail(c, 'VALIDATION_ERROR', 'Payload flash sale tidak valid', 400, parsed.error.issues);
    }
    return ok(c, await updateFlashSale(c.req.param('id') as string, parsed.data));
  } catch (err) {
    return flashSaleFail(c, err);
  }
});

// DELETE /api/v1/admin/flash-sales/:id
flashSaleAdminRoutes.delete('/flash-sales/:id', async (c) => {
  try {
    await deleteFlashSale(c.req.param('id') as string);
    return ok(c, { deleted: true });
  } catch (err) {
    return flashSaleFail(c, err);
  }
});

// POST /api/v1/admin/flash-sales/:id/items
flashSaleAdminRoutes.post('/flash-sales/:id/items', async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const parsed = itemSchema.safeParse(body);
    if (!parsed.success) {
      return fail(c, 'VALIDATION_ERROR', 'Payload item flash sale tidak valid', 400, parsed.error.issues);
    }
    return ok(c, await addFlashSaleItem(c.req.param('id') as string, parsed.data), 201);
  } catch (err) {
    return flashSaleFail(c, err);
  }
});

// PATCH /api/v1/admin/flash-sales/:id/items/:itemId
flashSaleAdminRoutes.patch('/flash-sales/:id/items/:itemId', async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const parsed = updateItemSchema.safeParse(body);
    if (!parsed.success) {
      return fail(c, 'VALIDATION_ERROR', 'Payload item flash sale tidak valid', 400, parsed.error.issues);
    }
    return ok(
      c,
      await updateFlashSaleItem(
        c.req.param('id') as string,
        c.req.param('itemId') as string,
        parsed.data
      )
    );
  } catch (err) {
    return flashSaleFail(c, err);
  }
});

// DELETE /api/v1/admin/flash-sales/:id/items/:itemId
flashSaleAdminRoutes.delete('/flash-sales/:id/items/:itemId', async (c) => {
  try {
    return ok(
      c,
      await removeFlashSaleItem(
        c.req.param('id') as string,
        c.req.param('itemId') as string
      )
    );
  } catch (err) {
    return flashSaleFail(c, err);
  }
});
