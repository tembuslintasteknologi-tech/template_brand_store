import { ShipmentStatus } from './logisticProvider.js';

const RAW_STATUS_MAP: Record<string, ShipmentStatus> = {
  created: 'created',
  pending: 'created',
  booked: 'created',
  requested: 'created',
  assigned: 'created',
  picked_up: 'picked_up',
  picked: 'picked_up',
  pickup: 'picked_up',
  in_transit: 'in_transit',
  transit: 'in_transit',
  on_process: 'in_transit',
  out_for_delivery: 'out_for_delivery',
  delivering: 'out_for_delivery',
  on_delivery: 'out_for_delivery',
  delivered: 'delivered',
  success: 'delivered',
  completed: 'delivered',
  failed: 'failed',
  delivery_failed: 'failed',
  undelivered: 'failed',
  rejected: 'failed',
  cancelled: 'cancelled',
  canceled: 'cancelled',
  returned: 'returned',
  return: 'returned',
};

export function normalizeShipmentStatus(raw: unknown): ShipmentStatus {
  const key = String(raw ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  return RAW_STATUS_MAP[key] ?? 'created';
}

export type OrderStatus = 'pending' | 'processing' | 'shipped' | 'delivered' | 'cancelled';

export function shipmentStatusToOrderStatus(status: ShipmentStatus): OrderStatus | null {
  switch (status) {
    case 'created':
    case 'picked_up':
      return 'processing';
    case 'in_transit':
    case 'out_for_delivery':
      return 'shipped';
    case 'delivered':
      return 'delivered';
    case 'cancelled':
    case 'returned':
      return 'cancelled';
    case 'failed':
      return null;
    default:
      return null;
  }
}

export function isTerminalShipmentStatus(status: ShipmentStatus): boolean {
  return status === 'delivered' || status === 'cancelled' || status === 'returned';
}

export type FailureResolutionAction = 'retry' | 'return_to_sender' | 'cancel';

export interface FailureResolution {
  shipmentStatus: ShipmentStatus;
  orderStatus: OrderStatus | null;
}

export function resolveDeliveryFailure(action: FailureResolutionAction): FailureResolution {
  switch (action) {
    case 'retry':
      return { shipmentStatus: 'in_transit', orderStatus: 'shipped' };
    case 'return_to_sender':
      return { shipmentStatus: 'returned', orderStatus: 'cancelled' };
    case 'cancel':
      return { shipmentStatus: 'cancelled', orderStatus: 'cancelled' };
    default:
      return { shipmentStatus: 'failed', orderStatus: null };
  }
}
