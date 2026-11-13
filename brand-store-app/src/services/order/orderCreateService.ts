/**
 * Shared order creation (BR-010).
 *
 * `POST /api/v1/orders` and `POST /api/v1/checkout` must not drift apart: both validate the
 * branch stock, freeze the branch snapshot, write the same columns, and return the same
 * shipment plan. The only difference is that checkout first picks a shipping option and hands
 * the winning price and mode in here.
 *
 * Errors are `OrderSourceError` so both routes can map them to their real status instead of
 * turning a sold-out branch into a 500.
 */

import { db } from '../../db/index.js';
import { orderItems, orders, products } from '../../db/schema.js';
import { eq } from 'drizzle-orm';
import { notifyOrderEvent } from '../notifications/orderNotifications.js';
import {
  OrderSourceError,
  assertBranchCanFulfill,
  assertFulfillmentMode,
  distinctBranchIds,
  getBranchSnapshot,
  planBranchShipments,
  resolveFulfillmentSource,
  type BranchShipmentPlan,
  type FulfillmentMode,
  type FulfillmentSource,
} from '../branch/orderSourceService.js';

export interface CreateOrderItemInput {
  productId: string;
  quantity: number;
  branchId?: string | null;
  fulfillmentMode?: string | null;
}

export interface CreateOrderShippingInput {
  mode: FulfillmentMode;
  provider: string;
  service: string;
  name?: string;
  cost: number;
}

export interface CreateOrderInput {
  customerId: string;
  items: CreateOrderItemInput[];
  shippingAddress: Record<string, unknown>;
  /** Filled by checkout from the option the customer picked. Zero for a plain order. */
  shippingAmount?: number;
  discountAmount?: number;
  /** Recorded on the order so support can see which courier was chosen. */
  shipping?: CreateOrderShippingInput | null;
  /**
   * OD-A is still open. Checkout only supports one branch per order, so it sets this to true.
   * `POST /api/v1/orders` leaves it off to keep accepting the legacy mixed cart.
   */
  enforceSingleBranch?: boolean;
}

export interface CreatedOrderItem {
  productId: string;
  sourceBranchId: string | null;
  fulfillmentMode: string | null;
  quantity: number;
  unitPrice: string;
  totalPrice: string;
  productSnapshot: Record<string, unknown>;
}

export interface CreatedOrderResult {
  orderId: string;
  orderNumber: string;
  status: string;
  itemsTotal: number;
  shippingAmount: number;
  discountAmount: number;
  totalAmount: number;
  fulfillmentSource: FulfillmentSource;
  shipments: BranchShipmentPlan[];
  items: CreatedOrderItem[];
}

function money(value: number): string {
  return (Math.round(value * 100) / 100).toFixed(2);
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Creates one order plus its lines, in the order the caller sent them, after checking that
 * every line can actually be fulfilled. Nothing is written when a check fails, so a partial
 * order is impossible.
 */
export async function createOrderWithItems(input: CreateOrderInput): Promise<CreatedOrderResult> {
  if (!input.items || input.items.length === 0) {
    throw new OrderSourceError('ORDER_ITEMS_REQUIRED', 'Order minimal berisi satu item');
  }

  if (input.enforceSingleBranch && distinctBranchIds(input.items).length > 1) {
    throw new OrderSourceError(
      'MULTI_BRANCH_CHECKOUT_UNSUPPORTED',
      'Satu checkout hanya boleh berisi produk dari satu cabang. Pisahkan jadi dua order.'
    );
  }

  // The selected shipping mode wins over a per-item mode, because one checkout equals one
  // shipment group while OD-A is open.
  const modeOverride = input.shipping?.mode ?? null;

  let itemsTotal = 0;
  const drafts: CreatedOrderItem[] = [];

  for (const item of input.items) {
    const [product] = await db
      .select()
      .from(products)
      .where(eq(products.id, item.productId as any))
      .limit(1);

    if (!product) {
      throw new OrderSourceError('PRODUCT_NOT_FOUND', `Produk tidak ditemukan: ${item.productId}`, 400);
    }

    let sourceBranchId: string | null = null;
    let fulfillmentMode: string | null = null;
    let branchSnapshot: Awaited<ReturnType<typeof getBranchSnapshot>> = null;

    if (item.branchId) {
      // BR-009: a branched line is checked against the branch, which is the source of truth.
      fulfillmentMode = assertFulfillmentMode(modeOverride ?? item.fulfillmentMode);
      await assertBranchCanFulfill({
        branchId: item.branchId,
        productId: product.id,
        quantity: item.quantity,
      });
      sourceBranchId = item.branchId;
      branchSnapshot = await getBranchSnapshot(item.branchId);
    } else if (product.stock < item.quantity) {
      // Legacy pusat pool, only for clients that do not send a branch yet.
      throw new OrderSourceError(
        'INSUFFICIENT_STOCK',
        `Stok tidak cukup untuk produk: ${product.title}`,
        400
      );
    }

    const unitPrice = parseFloat(product.basePrice);
    const lineTotal = unitPrice * item.quantity;
    itemsTotal += lineTotal;

    drafts.push({
      productId: product.id,
      sourceBranchId,
      fulfillmentMode,
      quantity: item.quantity,
      unitPrice: money(unitPrice),
      totalPrice: money(lineTotal),
      productSnapshot: branchSnapshot
        ? { title: product.title, sku: product.sku, branch: branchSnapshot }
        : { title: product.title, sku: product.sku },
    });
  }

  const fulfillmentSource = resolveFulfillmentSource(
    drafts.map((draft) => ({ branchId: draft.sourceBranchId }))
  );
  const shipments = planBranchShipments(
    drafts.map((draft) => ({
      branchId: draft.sourceBranchId,
      productId: draft.productId,
      quantity: draft.quantity,
      fulfillmentMode: draft.fulfillmentMode,
    }))
  );

  const shippingAmount = roundMoney(Math.max(0, Number(input.shippingAmount ?? 0)));
  const discountAmount = roundMoney(Math.max(0, Number(input.discountAmount ?? 0)));
  const totalAmount = roundMoney(Math.max(0, itemsTotal + shippingAmount - discountAmount));

  const orderNumber = `ORD-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const shippingDetails = input.shipping
    ? {
        mode: input.shipping.mode,
        provider: input.shipping.provider,
        service: input.shipping.service,
        name: input.shipping.name ?? null,
        cost: shippingAmount,
      }
    : null;

  const [newOrder] = await db
    .insert(orders)
    .values({
      orderNumber,
      customerId: input.customerId,
      fulfillmentSource,
      totalAmount: money(totalAmount),
      shippingAmount: money(shippingAmount),
      discountAmount: money(discountAmount),
      shippingAddress: input.shippingAddress,
      shippingDetails: shippingDetails ?? undefined,
      status: 'pending',
    })
    .returning();

  for (const draft of drafts) {
    await db.insert(orderItems).values({
      orderId: newOrder.id,
      ...draft,
      fulfillmentMode: draft.fulfillmentMode ?? undefined,
    });
  }

  notifyOrderEvent(input.customerId, 'created', {
    orderNumber,
    totalAmount: money(totalAmount),
  }).catch(() => {});

  return {
    orderId: newOrder.id,
    orderNumber,
    status: newOrder.status,
    itemsTotal: roundMoney(itemsTotal),
    shippingAmount,
    discountAmount,
    totalAmount,
    fulfillmentSource,
    shipments,
    items: drafts,
  };
}
