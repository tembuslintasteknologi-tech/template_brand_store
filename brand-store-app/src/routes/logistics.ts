import { Hono } from 'hono';
import { db } from '../db/index.js';
import { orders, shipments } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { authMiddleware, adminOnlyMiddleware } from '../middleware/auth.js';
import { ensureLogisticProvidersRegistered } from '../services/logistics/logisticRegistry.js';
import {
  LogisticGatewayError,
  LogisticProvider,
  RateCalculationParams,
} from '../services/logistics/logisticProvider.js';
import { createShipmentForOrder, persistTracking, syncOrderFromShipment } from '../services/logistics/shipmentService.js';
import { FailureResolutionAction, resolveDeliveryFailure } from '../services/logistics/statusMap.js';
import { notifyOrderEvent } from '../services/notifications/orderNotifications.js';

export const logisticsRoutes = new Hono();

function credentialsFor(): LogisticProvider[] {
  const registry = ensureLogisticProvidersRegistered();
  return registry.names().map((name) => registry.get(name));
}

function parseRateParams(body: any): RateCalculationParams {
  const origin = body?.origin ?? {};
  const destination = body?.destination ?? {};
  return {
    origin: {
      name: String(origin.name ?? 'Gudang'),
      phone: String(origin.phone ?? ''),
      addressLine: String(origin.addressLine ?? ''),
      city: String(origin.city ?? 'Jakarta'),
      province: origin.province ? String(origin.province) : undefined,
      postalCode: origin.postalCode ? String(origin.postalCode) : undefined,
      latitude: typeof origin.latitude === 'number' ? origin.latitude : Number(origin.latitude) || undefined,
      longitude: typeof origin.longitude === 'number' ? origin.longitude : Number(origin.longitude) || undefined,
    },
    destination: {
      name: String(destination.name ?? 'Penerima'),
      phone: String(destination.phone ?? ''),
      addressLine: String(destination.addressLine ?? ''),
      city: String(destination.city ?? 'Jakarta'),
      province: destination.province ? String(destination.province) : undefined,
      postalCode: destination.postalCode ? String(destination.postalCode) : undefined,
      latitude:
        typeof destination.latitude === 'number' ? destination.latitude : Number(destination.latitude) || undefined,
      longitude:
        typeof destination.longitude === 'number'
          ? destination.longitude
          : Number(destination.longitude) || undefined,
    },
    weightGrams: Number(body?.weightGrams ?? 1000),
    dimensions: body?.dimensions
      ? {
          lengthCm: Number(body.dimensions.lengthCm),
          widthCm: Number(body.dimensions.widthCm),
          heightCm: Number(body.dimensions.heightCm),
        }
      : undefined,
    value: body?.value !== undefined ? Number(body.value) : undefined,
    cod: Boolean(body?.cod),
  };
}

// GET /api/v1/logistics/providers - registered providers and capability modes
logisticsRoutes.get('/providers', (c) => {
  const registry = ensureLogisticProvidersRegistered();
  return c.json({
    success: true,
    data: registry.list(),
  });
});

// GET /api/v1/logistics/services - service catalogue per provider
logisticsRoutes.get('/services', async (c) => {
  const services = [];
  for (const provider of credentialsFor()) {
    try {
      const items = await provider.getServices();
      for (const item of items) services.push(item);
    } catch {
      // a provider without a live catalogue must not break the others
    }
  }
  return c.json({ success: true, data: services });
});

// POST /api/v1/logistics/rates - rate comparison across providers (on-demand quote and aggregator tariff)
logisticsRoutes.post('/rates', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const params = parseRateParams(body);
  const registry = ensureLogisticProvidersRegistered();
  const only: string | undefined = typeof body?.provider === 'string' ? body.provider : undefined;

  const rates = [];
  const errors: Array<{ provider: string; message: string }> = [];

  for (const provider of credentialsFor()) {
    if (only && provider.name !== only) continue;
    try {
      const items = await provider.calculateRate(params);
      for (const item of items) rates.push(item);
    } catch (err: any) {
      errors.push({ provider: provider.name, message: err?.message ?? 'failed' });
    }
  }

  rates.sort((a, b) => a.cost - b.cost);

  if (rates.length === 0) {
    return c.json({ success: false, error: 'No logistics provider returned a rate', providers: errors }, 502);
  }

  return c.json({
    success: true,
    data: {
      rates,
      cheapest: rates.find((rate) => rate.isAvailable) ?? null,
      errors,
    },
  });
});

// GET /api/v1/logistics/track/:awb - unified tracking (LOG-004)
logisticsRoutes.get('/track/:awb', async (c) => {
  const awb = c.req.param('awb');
  const [row] = await db.select().from(shipments).where(eq(shipments.awb, awb)).limit(1);

  if (!row) {
    return c.json({ success: false, error: 'Shipment not found for this AWB' }, 404);
  }

  const registry = ensureLogisticProvidersRegistered();
  let provider: LogisticProvider;
  try {
    provider = registry.get(row.provider);
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 502);
  }

  try {
    const tracking = await provider.trackShipment(awb);
    await persistTracking(row.id, tracking);
    const synced = await syncOrderFromShipment({ id: row.id, orderId: row.orderId, status: tracking.status });
    const [orderRow] = await db.select().from(orders).where(eq(orders.id, row.orderId)).limit(1);
    if (orderRow) {
      if (tracking.status === 'in_transit' || tracking.status === 'out_for_delivery') {
        await notifyOrderEvent(orderRow.customerId, 'shipped', {
          orderNumber: orderRow.orderNumber,
          totalAmount: orderRow.totalAmount,
          awb,
          status: synced ?? undefined,
        });
      } else if (tracking.status === 'delivered') {
        await notifyOrderEvent(orderRow.customerId, 'delivered', {
          orderNumber: orderRow.orderNumber,
          totalAmount: orderRow.totalAmount,
          awb,
          status: synced ?? undefined,
        });
      }
    }
    return c.json({
      success: true,
      data: {
        awb,
        provider: row.provider,
        mode: row.mode,
        service: tracking.service ?? row.service,
        status: tracking.status,
        orderStatus: synced,
        origin: tracking.origin,
        destination: tracking.destination,
        estimatedDelivery: tracking.estimatedDelivery,
        history: tracking.history,
      },
    });
  } catch (err: any) {
    if (err instanceof LogisticGatewayError) {
      return c.json({ success: false, error: err.message, provider: err.provider }, err.statusCode === 501 ? 501 : 502);
    }
    return c.json({ success: false, error: err?.message ?? 'tracking failed' }, 502);
  }
});

// POST /api/v1/logistics/admin/shipments - create AWB from admin (LOG-002)
logisticsRoutes.post('/admin/shipments', authMiddleware, adminOnlyMiddleware, async (c) => {
  const body = await c.req.json().catch(() => ({}));
  if (!body?.orderId) {
    return c.json({ success: false, error: 'orderId is required' }, 400);
  }

  const registry = ensureLogisticProvidersRegistered();
  let provider: LogisticProvider;
  try {
    provider = registry.get(String(body.provider ?? 'tembus_ondemand'));
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 400);
  }

  try {
    const created = await createShipmentForOrder(provider, {
      orderId: String(body.orderId),
      provider: provider.name,
      service: body.service ? String(body.service) : undefined,
      deliveryInstructions: body.deliveryInstructions ? String(body.deliveryInstructions) : undefined,
      cod: Boolean(body.cod),
      insurance: Boolean(body.insurance),
    });

    return c.json({
      success: true,
      data: {
        shipmentId: created.shipment.id,
        orderNumber: created.orderNumber,
        awb: created.shipment.awb,
        provider: created.shipment.provider,
        mode: created.shipment.mode,
        service: created.shipment.service,
        status: created.shipment.status,
        labelUrl: created.shipment.labelUrl,
      },
    });
  } catch (err: any) {
    const status = err instanceof LogisticGatewayError && err.statusCode === 501 ? 501 : 502;
    return c.json({ success: false, error: err.message, provider: (err as any)?.provider ?? provider.name }, status);
  }
});

// GET /api/v1/logistics/admin/shipments/:awb/label - label URL / PDF (LOG-003)
logisticsRoutes.get('/admin/shipments/:awb/label', authMiddleware, adminOnlyMiddleware, async (c) => {
  const awb = c.req.param('awb');
  const [row] = await db.select().from(shipments).where(eq(shipments.awb, awb as any)).limit(1);
  if (!row) {
    return c.json({ success: false, error: 'Shipment not found for this AWB' }, 404);
  }

  const registry = ensureLogisticProvidersRegistered();
  try {
    const label = await registry.get(row.provider).printLabel(awb as string);
    if (!label.labelUrl) {
      return c.json({ success: false, error: `Provider ${row.provider} does not expose a printable label` }, 501);
    }
    await db.update(shipments).set({ labelUrl: label.labelUrl, updatedAt: new Date() }).where(eq(shipments.id, row.id));
    return c.json({ success: true, data: label });
  } catch (err: any) {
    const status = err instanceof LogisticGatewayError && err.statusCode === 501 ? 501 : 502;
    return c.json({ success: false, error: err.message }, status);
  }
});

// POST /api/v1/logistics/admin/pickup - pickup scheduling (LOG-006)
logisticsRoutes.post('/admin/pickup', authMiddleware, adminOnlyMiddleware, async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const awbs: string[] = Array.isArray(body?.awbs) ? body.awbs.map(String) : [];
  if (awbs.length === 0) {
    return c.json({ success: false, error: 'awbs is required' }, 400);
  }

  const [row] = await db.select().from(shipments).where(eq(shipments.awb, awbs[0])).limit(1);
  if (!row) {
    return c.json({ success: false, error: 'Shipment not found for the first AWB' }, 404);
  }

  const registry = ensureLogisticProvidersRegistered();
  try {
    const pickup = await registry.get(row.provider).schedulePickup({
      origin: {
        name: process.env.STORE_ORIGIN_NAME || 'Gudang Utama',
        phone: process.env.STORE_ORIGIN_PHONE || '+628123456789',
        addressLine: process.env.STORE_ORIGIN_ADDRESS || 'Jl. Sudirman No. 1',
        city: process.env.STORE_ORIGIN_CITY || 'Jakarta Pusat',
      },
      shipmentAwbs: awbs,
      pickupDate: String(body.pickupDate ?? new Date().toISOString().slice(0, 10)),
      pickupTimeWindow: body.pickupTimeWindow ? String(body.pickupTimeWindow) : undefined,
      notes: body.notes ? String(body.notes) : undefined,
    });
    return c.json({ success: true, data: pickup });
  } catch (err: any) {
    const status = err instanceof LogisticGatewayError && err.statusCode === 501 ? 501 : 502;
    return c.json({ success: false, error: err.message, provider: (err as any)?.provider ?? row.provider }, status);
  }
});

// POST /api/v1/logistics/admin/shipments/:awb/exception - failed delivery handling (DLV-004)
logisticsRoutes.post('/admin/shipments/:awb/exception', authMiddleware, adminOnlyMiddleware, async (c) => {
  const awb = c.req.param('awb');
  const body = await c.req.json().catch(() => ({}));
  const action = String(body?.action ?? '');
  if (!['retry', 'return_to_sender', 'cancel'].includes(action)) {
    return c.json({ success: false, error: 'action must be retry, return_to_sender, or cancel' }, 400);
  }

  const [row] = await db.select().from(shipments).where(eq(shipments.awb, awb as any)).limit(1);
  if (!row) {
    return c.json({ success: false, error: 'Shipment not found for this AWB' }, 404);
  }

  const resolution = resolveDeliveryFailure(action as FailureResolutionAction);
  const now = new Date();
  await db
    .update(shipments)
    .set({
      status: resolution.shipmentStatus,
      updatedAt: now,
      trackingHistory: [
        ...(((row.trackingHistory as any[]) ?? []) as any[]),
        {
          status: resolution.shipmentStatus,
          rawStatus: `admin:${action}`,
          timestamp: now.toISOString(),
          notes: body?.notes ? String(body.notes) : undefined,
        },
      ] as any,
    })
    .where(eq(shipments.id, row.id));

  let orderStatus: string | null = null;
  if (resolution.orderStatus) {
    await db.update(orders).set({ status: resolution.orderStatus, updatedAt: now }).where(eq(orders.id, row.orderId));
    orderStatus = resolution.orderStatus;
  }

  return c.json({
    success: true,
    data: { awb, action, shipmentStatus: resolution.shipmentStatus, orderStatus, resolvedAt: now.toISOString() },
  });
});

// POST /webhooks/logistics/:provider - signed status webhook (LOG-005)
export const logisticsWebhookRoutes = new Hono();

logisticsWebhookRoutes.post('/:provider', async (c) => {
  const providerName = c.req.param('provider');
  const registry = ensureLogisticProvidersRegistered();

  let provider: LogisticProvider;
  try {
    provider = registry.get(providerName);
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 404);
  }

  const rawBody = await c.req.text();
  const signature = c.req.header('x-lancar-signature') ?? '';
  const timestamp = c.req.header('x-lancar-timestamp') ?? '';
  const deliveryId = c.req.header('x-lancar-delivery-id') ?? '';

  if (!provider.verifyWebhook({ signature, timestamp, rawBody })) {
    return c.json({ success: false, error: 'Invalid webhook signature' }, 401);
  }

  let payload: unknown = null;
  try {
    payload = rawBody ? JSON.parse(rawBody) : null;
  } catch {
    return c.json({ success: false, error: 'Invalid JSON payload' }, 400);
  }

  const event = provider.parseWebhookPayload(payload);
  if (!event.awb) {
    return c.json({ success: false, error: 'Payload has no AWB identifier' }, 400);
  }

  const [row] = await db.select().from(shipments).where(eq(shipments.awb, event.awb)).limit(1);
  if (!row) {
    return c.json({ success: false, error: 'Shipment not found for this AWB' }, 404);
  }

  const now = new Date();
  await db
    .update(shipments)
    .set({
      status: event.status,
      updatedAt: now,
      trackingHistory: [
        ...(((row.trackingHistory as any[]) ?? []) as any[]),
        {
          status: event.status,
          rawStatus: event.rawStatus,
          timestamp: event.timestamp,
          location: event.location,
          notes: event.notes,
          deliveryId,
        },
      ] as any,
    })
    .where(eq(shipments.id, row.id));

  const synced = await syncOrderFromShipment({ id: row.id, orderId: row.orderId, status: event.status });
  const [orderRow] = await db.select().from(orders).where(eq(orders.id, row.orderId)).limit(1);
  if (orderRow) {
    if (event.status === 'in_transit' || event.status === 'out_for_delivery') {
      await notifyOrderEvent(orderRow.customerId, 'shipped', {
        orderNumber: orderRow.orderNumber,
        totalAmount: orderRow.totalAmount,
        awb: event.awb,
        status: synced ?? undefined,
      });
    } else if (event.status === 'delivered') {
      await notifyOrderEvent(orderRow.customerId, 'delivered', {
        orderNumber: orderRow.orderNumber,
        totalAmount: orderRow.totalAmount,
        awb: event.awb,
        status: synced ?? undefined,
      });
    }
  }

  return c.json({
    success: true,
    data: {
      awb: event.awb,
      shipmentStatus: event.status,
      orderStatus: synced,
      deliveryId,
      appliedAt: now.toISOString(),
    },
  });
});

export async function findOrderByNumber(orderNumber: string) {
  const [row] = await db.select().from(orders).where(eq(orders.orderNumber, orderNumber)).limit(1);
  return row;
}
