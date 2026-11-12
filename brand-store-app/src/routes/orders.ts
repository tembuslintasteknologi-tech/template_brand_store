import { Hono } from 'hono';
import { db } from '../db/index.js';
import { orders, orderItems, products } from '../db/schema.js';
import { eq, desc } from 'drizzle-orm';
import { orderSchema } from '../validators/schemas.js';
import { authMiddleware, adminOnlyMiddleware } from '../middleware/auth.js';
import { notifyOrderEvent } from '../services/notifications/orderNotifications.js';
import {
  OrderSourceError,
  assertBranchCanFulfill,
  assertFulfillmentMode,
  getBranchSnapshot,
  planBranchShipments,
  resolveFulfillmentSource,
} from '../services/branch/orderSourceService.js';

export const orderRoutes = new Hono();

type OrderItemDraft = {
  productId: string;
  sourceBranchId: string | null;
  fulfillmentMode: string | null;
  quantity: number;
  unitPrice: string;
  totalPrice: string;
  productSnapshot: Record<string, unknown>;
};

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
    const orderItemsData: OrderItemDraft[] = [];

    for (const item of items) {
      const [product] = await db.select().from(products).where(eq(products.id, item.productId)).limit(1);
      if (!product) {
        return c.json({ success: false, error: `Product not found: ${item.productId}` }, 400);
      }

      // BR-009: an item with a branch is checked against that branch's stock, which is the
      // real source of truth. Items without one fall back to the legacy pusat pool check.
      let sourceBranchId: string | null = null;
      let fulfillmentMode: string | null = null;
      let branchSnapshot: Awaited<ReturnType<typeof getBranchSnapshot>> = null;

      if (item.branchId) {
        fulfillmentMode = assertFulfillmentMode(item.fulfillmentMode);
        await assertBranchCanFulfill({
          branchId: item.branchId,
          productId: product.id,
          quantity: item.quantity,
        });
        sourceBranchId = item.branchId;
        branchSnapshot = await getBranchSnapshot(item.branchId);
      } else if (product.stock < item.quantity) {
        return c.json({ success: false, error: `Insufficient stock for product: ${product.title}` }, 400);
      }

      const unitPrice = parseFloat(product.basePrice);
      const totalPrice = unitPrice * item.quantity;
      totalAmount += totalPrice;

      orderItemsData.push({
        productId: product.id,
        sourceBranchId,
        fulfillmentMode,
        quantity: item.quantity,
        unitPrice: unitPrice.toString(),
        totalPrice: totalPrice.toString(),
        productSnapshot: branchSnapshot
          ? { title: product.title, sku: product.sku, branch: branchSnapshot }
          : { title: product.title, sku: product.sku },
      });
    }

    const fulfillmentSource = resolveFulfillmentSource(
      orderItemsData.map((item) => ({ branchId: item.sourceBranchId }))
    );
    const shipmentPlan = planBranchShipments(
      orderItemsData.map((item) => ({
        branchId: item.sourceBranchId,
        productId: item.productId,
        quantity: item.quantity,
        fulfillmentMode: item.fulfillmentMode,
      }))
    );

    const orderNumber = `ORD-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    // Transaction to create order & items, reduce stock
    const [newOrder] = await db.insert(orders).values({
      orderNumber,
      customerId: user.id,
      fulfillmentSource,
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

    // fire-and-forget notification (NTF-001, NTF-003)
    notifyOrderEvent(user.id, 'created', { orderNumber, totalAmount: totalAmount.toString() }).catch(() => {});

    return c.json({
      success: true,
      data: {
        orderId: newOrder.id,
        orderNumber,
        totalAmount,
        status: 'pending',
        fulfillmentSource,
        shipments: shipmentPlan,
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
