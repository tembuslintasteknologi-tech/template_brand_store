import { Hono } from 'hono';
import { db } from '../db/index.js';
import { orders, orderItems, products } from '../db/schema.js';
import { eq, desc } from 'drizzle-orm';
import { orderSchema } from '../validators/schemas.js';
import { authMiddleware, adminOnlyMiddleware } from '../middleware/auth.js';

export const orderRoutes = new Hono();

// Customer: Create order (Checkout)
orderRoutes.post('/', authMiddleware, async (c) => {
  try {
    const user = c.get('user') as { id: string; role: string; email: string };
    const body = await c.req.json();
    const parsed = orderSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ success: false, error: parsed.error.format() }, 400);
    }

    const { items, shippingAddress } = parsed.data;

    let totalAmount = 0;
    const orderItemsData = [];

    for (const item of items) {
      const [product] = await db.select().from(products).where(eq(products.id, item.productId)).limit(1);
      if (!product) {
        return c.json({ success: false, error: `Product not found: ${item.productId}` }, 400);
      }
      if (product.stock < item.quantity) {
        return c.json({ success: false, error: `Insufficient stock for product: ${product.title}` }, 400);
      }

      const unitPrice = parseFloat(product.basePrice);
      const totalPrice = unitPrice * item.quantity;
      totalAmount += totalPrice;

      orderItemsData.push({
        productId: product.id,
        quantity: item.quantity,
        unitPrice: unitPrice.toString(),
        totalPrice: totalPrice.toString(),
        productSnapshot: { title: product.title, sku: product.sku },
      });
    }

    const orderNumber = `ORD-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    // Transaction to create order & items, reduce stock
    const [newOrder] = await db.insert(orders).values({
      orderNumber,
      customerId: user.id,
      totalAmount: totalAmount.toString(),
      shippingAddress,
      status: 'pending',
    }).returning();

    for (const itemData of orderItemsData) {
      await db.insert(orderItems).values({
        orderId: newOrder.id,
        ...itemData,
      });
    }

    return c.json({ success: true, data: { orderId: newOrder.id, orderNumber, totalAmount, status: 'pending' } }, 201);
  } catch (err: any) {
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
