import { Hono } from 'hono';
import { db } from '../db/index.js';
import { orders } from '../db/schema.js';
import { eq, desc, and, lt, or } from 'drizzle-orm';
import { orderSchema } from '../validators/schemas.js';
import { authMiddleware, adminOnlyMiddleware } from '../middleware/auth.js';
import { OrderSourceError } from '../services/branch/orderSourceService.js';
import { createOrderWithItems } from '../services/order/orderCreateService.js';
import { realtimeHub } from '../services/realtime/realtimeService.js';
import {
  PaginationError,
  buildCursorPage,
  clampPageSize,
  decodeCursor,
  parseFields,
} from '../utils/pagination.js';

export const orderRoutes = new Hono();

// Customer: Create order (Checkout). BR-010 moved the body into a shared service so the new
// POST /api/v1/checkout cannot drift from this route.
orderRoutes.post('/', authMiddleware, async (c) => {
  try {
    const user = c.get('user') as { id: string; role: string; email: string };
    const body = await c.req.json();
    const parsed = orderSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ success: false, error: parsed.error.format() }, 400);
    }

    const created = await createOrderWithItems({
      customerId: user.id,
      items: parsed.data.items,
      shippingAddress: parsed.data.shippingAddress,
    });

    return c.json({
      success: true,
      data: {
        orderId: created.orderId,
        orderNumber: created.orderNumber,
        totalAmount: created.totalAmount,
        status: created.status,
        fulfillmentSource: created.fulfillmentSource,
        shipments: created.shipments,
      },
    }, 201);
  } catch (err: any) {
    if (err instanceof OrderSourceError) {
      return c.json({ success: false, error: { code: err.code, message: err.message } }, err.status as any);
    }
    return c.json({ success: false, error: err.message }, 500);
  }
});

// Customer: Get own orders, newest first, cursor paginated for mobile.
orderRoutes.get('/my-orders', authMiddleware, async (c) => {
  try {
    const user = c.get('user') as { id: string; role: string; email: string };
    const limit = clampPageSize(c.req.query('limit'));
    const fields = parseFields(c.req.query('fields'));
    const cursor = decodeCursor(c.req.query('cursor'));

    const conditions: any[] = [eq(orders.customerId, user.id)];
    if (cursor) {
      const at = new Date(cursor.createdAt);
      conditions.push(
        or(lt(orders.createdAt, at), and(eq(orders.createdAt, at), lt(orders.id, cursor.id as any)))
      );
    }

    const rows = await db
      .select()
      .from(orders)
      .where(and(...conditions))
      .orderBy(desc(orders.createdAt), desc(orders.id))
      .limit(limit + 1);

    const page = buildCursorPage(rows as any[], limit, { fields });
    c.header('Cache-Control', 'private, no-store');
    return c.json({
      success: true,
      data: page.items,
      page: { nextCursor: page.nextCursor, hasMore: page.hasMore, limit: page.limit },
    });
  } catch (err: any) {
    if (err instanceof PaginationError) {
      return c.json({ success: false, error: { code: err.code, message: err.message } }, 400);
    }
    return c.json({ success: false, error: err.message }, 500);
  }
});

// Admin: Get all orders, cursor paginated instead of loading the whole table.
orderRoutes.get('/admin/all', authMiddleware, adminOnlyMiddleware, async (c) => {
  try {
    const limit = clampPageSize(c.req.query('limit'));
    const fields = parseFields(c.req.query('fields'));
    const cursor = decodeCursor(c.req.query('cursor'));

    const conditions: any[] = [];
    if (cursor) {
      const at = new Date(cursor.createdAt);
      conditions.push(
        or(lt(orders.createdAt, at), and(eq(orders.createdAt, at), lt(orders.id, cursor.id as any)))
      );
    }

    const rows = await db
      .select()
      .from(orders)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(orders.createdAt), desc(orders.id))
      .limit(limit + 1);
    const page = buildCursorPage(rows as any[], limit, { fields });
    c.header('Cache-Control', 'private, no-store');
    return c.json({
      success: true,
      data: page.items,
      page: { nextCursor: page.nextCursor, hasMore: page.hasMore, limit: page.limit },
    });
  } catch (err: any) {
    if (err instanceof PaginationError) {
      return c.json({ success: false, error: { code: err.code, message: err.message } }, 400);
    }
    return c.json({ success: false, error: err.message }, 500);
  }
});

// Admin: Update order status (e.g. shipping / delivered)
orderRoutes.patch('/admin/:id/status', authMiddleware, adminOnlyMiddleware, async (c) => {
  try {
    const id = c.req.param('id');
    const { status, shippingDetails } = await c.req.json();

    const [updated] = await db.update(orders).set({
      status,
      shippingDetails: shippingDetails || undefined,
      updatedAt: new Date(),
    }).where(eq(orders.id, id as any)).returning();

    if (!updated) {
      return c.json({ success: false, error: 'Order not found' }, 404);
    }

    realtimeHub.broadcastOrderStatus(updated.id, status, shippingDetails?.trackingNumber ?? shippingDetails?.awb);

    return c.json({ success: true, data: updated });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500);
  }
});
