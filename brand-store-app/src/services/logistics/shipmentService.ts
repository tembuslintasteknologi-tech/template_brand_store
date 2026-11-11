import { db } from '../../db/index.js';
import { orders, shipments } from '../../db/schema.js';
import { eq } from 'drizzle-orm';
import {
  CreateShipmentParams,
  LogisticProvider,
  TrackingInfo,
} from './logisticProvider.js';
import { shipmentStatusToOrderStatus } from './statusMap.js';
import { getDefaultStoreLocation } from '../config/settings.js';

export interface CreateShipmentInput {
  orderId: string;
  provider: string;
  service?: string;
  deliveryInstructions?: string;
  cod?: boolean;
  insurance?: boolean;
}

export async function createShipmentForOrder(
  provider: LogisticProvider,
  input: CreateShipmentInput
): Promise<{ shipment: typeof shipments.$inferSelect; orderNumber: string }> {
  const [order] = await db.select().from(orders).where(eq(orders.id, input.orderId as any)).limit(1);
  if (!order) {
    throw new Error(`Order not found: ${input.orderId}`);
  }

  const address = (order.shippingAddress ?? {}) as Record<string, any>;
  const destination = {
    name: String(address.recipientName ?? address.name ?? 'Penerima'),
    phone: String(address.phone ?? ''),
    addressLine: String(address.addressLine ?? address.address ?? ''),
    city: String(address.city ?? 'Jakarta'),
    province: address.province ? String(address.province) : undefined,
    postalCode: address.postalCode ? String(address.postalCode) : undefined,
    latitude: typeof address.latitude === 'number' ? address.latitude : undefined,
    longitude: typeof address.longitude === 'number' ? address.longitude : undefined,
  };

  const defaultLocation = await getDefaultStoreLocation();
  const origin = {
    name: defaultLocation?.name ?? process.env.STORE_ORIGIN_NAME ?? 'Gudang Utama',
    phone: defaultLocation?.phone ?? process.env.STORE_ORIGIN_PHONE ?? '+628123456789',
    addressLine: defaultLocation?.addressLine ?? process.env.STORE_ORIGIN_ADDRESS ?? 'Jl. Sudirman No. 1',
    city: defaultLocation?.city ?? process.env.STORE_ORIGIN_CITY ?? 'Jakarta Pusat',
    province: defaultLocation?.province ?? process.env.STORE_ORIGIN_PROVINCE ?? 'DKI Jakarta',
    postalCode: defaultLocation?.postalCode ?? process.env.STORE_ORIGIN_POSTAL_CODE ?? '10210',
  };

  const params: CreateShipmentParams = {
    orderNumber: order.orderNumber,
    origin,
    destination,
    service: input.service ?? '',
    weightGrams: parseFloat(order.totalAmount) > 0 ? 1000 : 1000,
    items: [{ name: `Pesanan ${order.orderNumber}`, quantity: 1, weightGrams: 1000 }],
    cod: input.cod,
    insurance: input.insurance,
    deliveryInstructions: input.deliveryInstructions,
  };

  const result = await provider.createShipment(params);
  const now = new Date();

  const [shipment] = await db
    .insert(shipments)
    .values({
      orderId: order.id,
      provider: provider.name,
      mode: provider.mode,
      service: result.service ?? input.service ?? null,
      awb: result.awb,
      status: result.status,
      cost: String(result.cost ?? 0),
      labelUrl: result.labelUrl ?? null,
      deliveryInstructions: input.deliveryInstructions ?? null,
      rawResponse: (result.rawResponse ?? null) as any,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  const nextOrderStatus = shipmentStatusToOrderStatus(result.status as any);
  await db
    .update(orders)
    .set({
      status: nextOrderStatus === 'processing' ? 'processing' : order.status,
      shippingDetails: {
        provider: provider.name,
        mode: provider.mode,
        awb: result.awb,
        service: result.service ?? null,
        labelUrl: result.labelUrl ?? null,
        deliveryInstructions: input.deliveryInstructions ?? null,
      },
      updatedAt: now,
    })
    .where(eq(orders.id, order.id));

  return { shipment, orderNumber: order.orderNumber };
}

export async function persistTracking(shipmentId: string, tracking: TrackingInfo): Promise<void> {
  const now = new Date();
  await db
    .update(shipments)
    .set({
      status: tracking.status,
      trackingUrl: (tracking as any).trackingUrl ?? null,
      trackingHistory: (tracking.history ?? []) as any,
      updatedAt: now,
    })
    .where(eq(shipments.id, shipmentId as any));
}

export async function syncOrderFromShipment(shipmentRow: {
  id: string;
  orderId: string;
  status: string;
}): Promise<string | null> {
  const nextStatus = shipmentStatusToOrderStatus(shipmentRow.status as any);
  if (!nextStatus) return null;

  await db
    .update(orders)
    .set({ status: nextStatus, updatedAt: new Date() })
    .where(eq(orders.id, shipmentRow.orderId as any));

  return nextStatus;
}
