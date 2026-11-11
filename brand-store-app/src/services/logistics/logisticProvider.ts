export type LogisticMode = 'ondemand' | 'aggregator';

export type ShipmentStatus =
  | 'created'
  | 'picked_up'
  | 'in_transit'
  | 'out_for_delivery'
  | 'delivered'
  | 'failed'
  | 'cancelled'
  | 'returned';

export interface Address {
  name: string;
  phone: string;
  addressLine: string;
  city: string;
  province?: string;
  postalCode?: string;
  latitude?: number;
  longitude?: number;
}

export interface Dimensions {
  lengthCm: number;
  widthCm: number;
  heightCm: number;
}

export interface RateCalculationParams {
  origin: Address;
  destination: Address;
  weightGrams: number;
  dimensions?: Dimensions;
  value?: number;
  cod?: boolean;
}

export interface ShippingService {
  provider: string;
  mode: LogisticMode;
  service: string;
  name: string;
  estimatedDays: string;
  cost: number;
  isAvailable: boolean;
  codSupported?: boolean;
  insuranceCost?: number;
}

export interface ParcelItem {
  name: string;
  quantity: number;
  weightGrams: number;
  value?: number;
}

export interface CreateShipmentParams {
  orderNumber: string;
  origin: Address;
  destination: Address;
  service: string;
  weightGrams: number;
  dimensions?: Dimensions;
  items: ParcelItem[];
  cod?: boolean;
  insurance?: boolean;
  deliveryInstructions?: string;
}

export interface ShipmentResult {
  awb: string;
  provider: string;
  mode: LogisticMode;
  service: string;
  status: ShipmentStatus;
  cost?: number;
  labelUrl?: string;
  estimatedDelivery?: string;
  rawResponse?: unknown;
}

export interface TrackingEvent {
  status: ShipmentStatus;
  rawStatus: string;
  timestamp: string;
  location?: string;
  notes?: string;
}

export interface TrackingInfo {
  awb: string;
  provider: string;
  service?: string;
  status: ShipmentStatus;
  origin?: string;
  destination?: string;
  estimatedDelivery?: string;
  history: TrackingEvent[];
}

export interface PickupParams {
  origin: Address;
  shipmentAwbs: string[];
  pickupDate: string;
  pickupTimeWindow?: string;
  notes?: string;
}

export interface PickupResult {
  pickupId: string;
  scheduledAt: string;
  status: 'scheduled' | 'failed';
  rawResponse?: unknown;
}

export interface LogisticWebhookEvent {
  awb: string;
  orderNumber?: string;
  status: ShipmentStatus;
  rawStatus: string;
  timestamp: string;
  location?: string;
  notes?: string;
}

export interface WebhookVerificationInput {
  signature: string;
  timestamp: string;
  rawBody: string;
}

export interface LogisticProvider {
  name: string;
  mode: LogisticMode;
  getServices(): Promise<ShippingService[]>;
  calculateRate(params: RateCalculationParams): Promise<ShippingService[]>;
  createShipment(params: CreateShipmentParams): Promise<ShipmentResult>;
  cancelShipment(awb: string): Promise<void>;
  printLabel(awb: string): Promise<{ awb: string; labelUrl: string }>;
  trackShipment(awb: string): Promise<TrackingInfo>;
  schedulePickup(params: PickupParams): Promise<PickupResult>;
  verifyWebhook(input: WebhookVerificationInput): boolean;
  parseWebhookPayload(payload: unknown): LogisticWebhookEvent;
}

export class LogisticGatewayError extends Error {
  readonly provider: string;
  readonly statusCode?: number;
  readonly rawResponse?: unknown;

  constructor(message: string, provider: string, statusCode?: number, rawResponse?: unknown) {
    super(message);
    this.name = 'LogisticGatewayError';
    this.provider = provider;
    this.statusCode = statusCode;
    this.rawResponse = rawResponse;
  }
}
