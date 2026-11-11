export type OrderStatus =
  | 'pending'
  | 'paid'
  | 'processing'
  | 'shipped'
  | 'delivered'
  | 'completed'
  | 'cancelled'
  | 'expired'
  | 'refunded';

/**
 * ORD-003: the only status changes the system accepts. Anything else is rejected
 * so an order can never move backwards or revive after it is closed.
 */
export const ORDER_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pending: ['paid', 'cancelled', 'expired'],
  paid: ['processing', 'cancelled', 'refunded'],
  processing: ['shipped', 'cancelled', 'refunded'],
  shipped: ['delivered', 'refunded'],
  delivered: ['completed', 'refunded'],
  completed: ['refunded'],
  cancelled: [],
  expired: [],
  refunded: [],
};

export const TERMINAL_STATUSES: OrderStatus[] = ['cancelled', 'expired', 'refunded'];

export function isOrderStatus(value: string): value is OrderStatus {
  return Object.prototype.hasOwnProperty.call(ORDER_TRANSITIONS, value);
}

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return ORDER_TRANSITIONS[from]?.includes(to) ?? false;
}

export function nextStatuses(from: OrderStatus): OrderStatus[] {
  return [...(ORDER_TRANSITIONS[from] ?? [])];
}

export function isTerminal(status: OrderStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}

export interface TransitionResult {
  allowed: boolean;
  reason?: 'UNKNOWN_STATUS' | 'INVALID_TRANSITION' | 'SAME_STATUS';
}

export function validateTransition(from: string, to: string): TransitionResult {
  if (!isOrderStatus(from) || !isOrderStatus(to))
    return { allowed: false, reason: 'UNKNOWN_STATUS' };
  if (from === to) return { allowed: false, reason: 'SAME_STATUS' };
  if (!canTransition(from, to)) return { allowed: false, reason: 'INVALID_TRANSITION' };
  return { allowed: true };
}
