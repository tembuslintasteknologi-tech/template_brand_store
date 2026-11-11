import { Hono } from 'hono';
import { paymentManager } from '../services/payment/paymentManager.js';
import { PaymentGatewayError } from '../services/payment/midtransProvider.js';
import { expirePendingOrders, resolvePaymentExpiry } from '../services/payment/paymentExpiry.js';
import { getPaymentExpiryMinutes } from '../services/config/settings.js';
import { db } from '../db/index.js';
import { orders } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { authMiddleware, adminOnlyMiddleware } from '../middleware/auth.js';
import { unifiedConfig } from '../config/unifiedConfig.js';
import { notifyOrderEvent } from '../services/notifications/orderNotifications.js';

export const paymentRoutes = new Hono();

// GET available payment methods / providers
paymentRoutes.get('/methods', (c) => {
  return c.json({
    success: true,
    data: {
      gateways: paymentManager.listProviders(),
      methods: [
        { code: 'qris', name: 'QRIS (Instant QR Code)', gateway: 'midtrans' },
        { code: 'va_bca', name: 'BCA Virtual Account', gateway: 'midtrans' },
        { code: 'va_mandiri', name: 'Mandiri Virtual Account', gateway: 'xendit' },
        { code: 'ewallet_gopay', name: 'GoPay / E-Wallet', gateway: 'midtrans' },
        { code: 'cc', name: 'Credit / Debit Card', gateway: 'midtrans' },
        { code: 'manual_bank', name: 'Manual Bank Transfer (BCA)', gateway: 'manual_bank' },
      ],
    },
  });
});

// POST /api/payments/create - Create payment transaction for order
paymentRoutes.post('/create', authMiddleware, async (c) => {
  try {
    const body = await c.req.json();
    const { orderId, gateway = 'midtrans', paymentMethod = 'qris' } = body;

    if (!orderId) {
      return c.json({ success: false, error: 'orderId is required' }, 400);
    }

    // Find order
    const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
    if (!order) {
      return c.json({ success: false, error: 'Order not found' }, 404);
    }

    const provider = paymentManager.getProvider(gateway);
    const user = c.get('user') as { id: string; fullName?: string; email: string; phone?: string };

    const now = new Date();
    const requestedMinutes = Number(body.expiryMinutes);
    const expiryMinutes =
      Number.isFinite(requestedMinutes) && requestedMinutes > 0
        ? requestedMinutes
        : await getPaymentExpiryMinutes();
    const expiresAt = resolvePaymentExpiry(now, expiryMinutes);

    const paymentResponse = await provider.createTransaction({
      orderId: order.id,
      orderNumber: order.orderNumber,
      amount: parseFloat(order.totalAmount),
      customer: {
        id: user.id,
        name: user.fullName ?? 'Customer',
        email: user.email,
        phone: user.phone,
      },
      paymentMethod,
    });

    // Update order with payment details
    await db.update(orders).set({
      paymentDetails: {
        gateway,
        paymentMethod,
        transactionId: paymentResponse.transactionId,
        status: paymentResponse.status,
        paymentUrl: paymentResponse.paymentUrl,
        qrCodeUrl: paymentResponse.qrCodeUrl,
        virtualAccountNumber: paymentResponse.virtualAccountNumber,
        rawResponse: paymentResponse.rawResponse,
        createdAt: now.toISOString(),
      },
      expiresAt,
      updatedAt: now,
    }).where(eq(orders.id, orderId));

    return c.json({
      success: true,
      data: {
        ...paymentResponse,
        expiresAt: expiresAt.toISOString(),
        expiryMinutes,
      },
    });
  } catch (err: any) {
    const status = err instanceof PaymentGatewayError ? 502 : 500;
    return c.json({ success: false, error: err.message, gateway: (err as any)?.gateway ?? null }, status);
  }
});

// POST /api/payments/admin/expire-sweep - Cancel pending orders whose payment window passed (PAY-006)
paymentRoutes.post('/admin/expire-sweep', authMiddleware, adminOnlyMiddleware, async (c) => {
  try {
    const now = new Date();
    const expired = await expirePendingOrders(now);
    return c.json({
      success: true,
      data: {
        expiredCount: expired.length,
        orders: expired,
        checkedAt: now.toISOString(),
        expiryMinutes: unifiedConfig.brand.paymentExpiryMinutes,
      },
    });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500);
  }
});

// POST /api/payments/webhooks/:provider - Webhook listener for payment gateways
paymentRoutes.post('/webhooks/:provider', async (c) => {
  const providerName = c.req.param('provider');
  try {
    const signature = c.req.header('x-callback-signature') ?? c.req.header('x-signature') ?? 'mock-valid-signature';
    const payload = await c.req.json();

    const provider = paymentManager.getProvider(providerName);
    const isValid = provider.verifyWebhook(signature, payload);

    if (!isValid) {
      return c.json({ success: false, error: 'Invalid webhook signature' }, 401);
    }

    const { orderNumber, status, transactionId, amount } = provider.parseWebhookPayload(payload);

    // Find order by orderNumber
    const [order] = await db.select().from(orders).where(eq(orders.orderNumber, orderNumber)).limit(1);
    if (!order) {
      return c.json({ success: false, error: 'Order not found for webhook' }, 404);
    }

    // Idempotency check: if already success, acknowledge
    if (order.status === 'paid' && status === 'success') {
      return c.json({ success: true, message: 'Already processed (idempotent)' });
    }

    let newOrderStatus = order.status;
    if (status === 'success') {
      newOrderStatus = 'paid';
    } else if (status === 'failed' || status === 'expired') {
      newOrderStatus = 'cancelled';
    }

    await db.update(orders).set({
      status: newOrderStatus,
      paymentDetails: {
        ...(order.paymentDetails as any ?? {}),
        status,
        transactionId,
        amount,
        updatedAt: new Date().toISOString(),
      },
      updatedAt: new Date(),
    }).where(eq(orders.id, order.id));

    if (status === 'success') {
      await notifyOrderEvent(order.customerId, 'paid', {
        orderNumber: order.orderNumber,
        totalAmount: order.totalAmount,
        status: newOrderStatus,
      });
    } else if (status === 'failed' || status === 'expired') {
      await notifyOrderEvent(order.customerId, 'payment_failed', {
        orderNumber: order.orderNumber,
        totalAmount: order.totalAmount,
        status: newOrderStatus,
      });
    }

    return c.json({ success: true, data: { orderNumber, status: newOrderStatus } });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500);
  }
});

// GET /api/payments/:orderId/status - Payment status for an order (owner or admin)
paymentRoutes.get('/:orderId/status', authMiddleware, async (c) => {
  try {
    const orderId = c.req.param('orderId');
    const user = c.get('user') as { id: string; role: string };

    const [order] = await db.select().from(orders).where(eq(orders.id, orderId as any)).limit(1);
    if (!order) {
      return c.json({ success: false, error: 'Order not found' }, 404);
    }

    if (user.role !== 'admin' && order.customerId !== user.id) {
      return c.json({ success: false, error: 'Forbidden: not your order' }, 403);
    }

    const details = (order.paymentDetails ?? {}) as Record<string, unknown>;

    return c.json({
      success: true,
      data: {
        orderId: order.id,
        orderNumber: order.orderNumber,
        status: order.status,
        paymentStatus: details.status ?? 'pending',
        gateway: details.gateway ?? null,
        paymentMethod: details.paymentMethod ?? null,
        transactionId: details.transactionId ?? null,
        updatedAt: order.updatedAt,
      },
    });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500);
  }
});

// Admin: Verify manual bank transfer
paymentRoutes.post('/admin/verify-manual', authMiddleware, adminOnlyMiddleware, async (c) => {
  try {
    const { orderId, approved, notes } = await c.req.json();
    if (!orderId) {
      return c.json({ success: false, error: 'orderId is required' }, 400);
    }

    const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
    if (!order) {
      return c.json({ success: false, error: 'Order not found' }, 404);
    }

    const newStatus = approved ? 'paid' : 'cancelled';

    await db.update(orders).set({
      status: newStatus,
      paymentDetails: {
        ...(order.paymentDetails as any ?? {}),
        status: approved ? 'success' : 'failed',
        adminVerificationNotes: notes,
        verifiedAt: new Date().toISOString(),
      },
      updatedAt: new Date(),
    }).where(eq(orders.id, orderId));

    return c.json({ success: true, data: { orderId, status: newStatus } });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500);
  }
});
