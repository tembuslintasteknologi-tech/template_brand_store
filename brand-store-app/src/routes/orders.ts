import { Hono } from 'hono';
import { db } from '../db/index.js';
import { orders } from '../db/schema.js';
import { eq, desc } from 'drizzle-orm';
import { orderSchema } from '../validators/schemas.js';
import { authMiddleware, adminOnlyMiddleware } from '../middleware/auth.js';
import { OrderSourceError } from '../services/branch/orderSourceService.js';
import { createOrderWithItems } from '../services/order/orderCreateService.js';

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

// Customer: Get own orders
orderRoutes.get('/my-orders', authMiddleware, async (c) => {
  try {
    const user = c.get('user') as { id: string; role: string; email: string };
    const userOrders = await db.select().from(orders).where(eq(orders.customerId, user.id)).orderBy(desc(orders.createdAt));
    return c.json({ success: true, data: userOrders });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500);
  }
});

// Admin: Get all orders
orderRoutes.get('/admin/all', authMiddleware, adminOnlyMiddleware, async (c) => {
  try {
    const allOrders = await db.select().from(orders).orderBy(desc(orders.createdAt));
    return c.json({ success: true, data: allOrders });
  } catch (err: any) {
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

    return c.json({ success: true, data: updated });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500);
  }
});
