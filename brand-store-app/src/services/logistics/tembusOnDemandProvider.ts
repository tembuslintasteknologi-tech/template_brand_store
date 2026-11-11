import crypto from 'node:crypto';
import {
  CreateShipmentParams,
  LogisticGatewayError,
  LogisticProvider,
  PickupParams,
  PickupResult,
  RateCalculationParams,
  ShipmentResult,
  ShipmentStatus,
  ShippingService,
  TrackingEvent,
  TrackingInfo,
} from './logisticProvider.js';
import { normalizeShipmentStatus } from './statusMap.js';

export interface TembusOnDemandOptions {
  baseUrl?: string;
  apiKey?: string;
  webhookSecret?: string;
  models?: string[];
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

interface QuoteResponse {
  estimate_id?: string;
  quote_id?: string;
  total_price_idr?: number;
  price_idr?: number;
  distance_km?: number;
  currency?: string;
  [key: string]: unknown;
}

const DEFAULT_MODELS = ['p2p'];

function pickNumber(...values: unknown[]): number {
  for (const value of values) {
    const num = typeof value === 'string' ? Number(value) : (value as number);
    if (typeof num === 'number' && Number.isFinite(num)) return num;
  }
  return 0;
}

function pickString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === 'string' && value.trim().length > 0) return value.trim();
  }
  return undefined;
}

export class TembusOnDemandProvider implements LogisticProvider {
  name = 'tembus_ondemand';
  mode = 'ondemand' as const;
  private baseUrl: string;
  private apiKey: string;
  private webhookSecret: string;
  private models: string[];
  private timeoutMs: number;
  private fetchImpl: typeof fetch;

  constructor(options: TembusOnDemandOptions = {}) {
    this.baseUrl = (options.baseUrl ?? 'https://staging-api.bawain.my.id/api/v1/developer/v1').replace(/\/$/, '');
    this.apiKey = options.apiKey ?? '';
    this.webhookSecret = options.webhookSecret ?? '';
    this.models = options.models && options.models.length > 0 ? options.models : DEFAULT_MODELS;
    this.timeoutMs = options.timeoutMs ?? 15000;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  private headers(idempotencyKey?: string): Record<string, string> {
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      accept: 'application/json',
      authorization: `Bearer ${this.apiKey}`,
    };
    if (idempotencyKey) headers['idempotency-key'] = idempotencyKey.slice(0, 160);
    return headers;
  }

  private async request(method: string, path: string, body?: unknown, idempotencyKey?: string): Promise<any> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let response: Response;
    try {
      response = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method,
        headers: this.headers(idempotencyKey),
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (err: any) {
      throw new LogisticGatewayError(
        `Tembus on-demand request failed: ${err?.message ?? 'network error'}`,
        this.name
      );
    } finally {
      clearTimeout(timer);
    }

    const text = await response.text();
    let parsed: any = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = { raw: text };
    }

    if (!response.ok) {
      const detail = parsed?.error?.message ?? parsed?.message ?? text.slice(0, 200);
      throw new LogisticGatewayError(
        `Tembus on-demand rejected ${method} ${path}: ${detail}`,
        this.name,
        response.status,
        parsed
      );
    }

    return parsed;
  }

  private payloadOf(parsed: any): any {
    return parsed?.data ?? parsed;
  }

  async getServices(): Promise<ShippingService[]> {
    return this.models.map((model) => ({
      provider: this.name,
      mode: 'ondemand',
      service: model,
      name: `Tembus On-Demand ${model}`,
      estimatedDays: 'same day',
      cost: 0,
      isAvailable: true,
    }));
  }

  async calculateRate(params: RateCalculationParams): Promise<ShippingService[]> {
    const weightKg = Math.max(params.weightGrams / 1000, 0.1);
    const payload: Record<string, unknown> = {
      weight: Number(weightKg.toFixed(2)),
      models: this.models,
    };
    if (params.origin.latitude !== undefined) payload.pickup_lat = params.origin.latitude;
    if (params.origin.longitude !== undefined) payload.pickup_lng = params.origin.longitude;
    if (params.destination.latitude !== undefined) payload.dropoff_lat = params.destination.latitude;
    if (params.destination.longitude !== undefined) payload.dropoff_lng = params.destination.longitude;
    if (params.dimensions) {
      payload.length = params.dimensions.lengthCm;
      payload.width = params.dimensions.widthCm;
      payload.height = params.dimensions.heightCm;
    }

    const parsed = this.payloadOf(await this.request('POST', '/quotes', payload, this.idempotencyKey('quote')));
    const estimateId = pickString(parsed?.estimate_id, parsed?.quote_id);
    const cost = pickNumber(parsed?.total_price_idr, parsed?.price_idr, parsed?.total_price);

    if (!estimateId) {
      throw new LogisticGatewayError('Tembus quote response has no estimate_id', this.name, undefined, parsed);
    }

    return this.models.map((model) => ({
      provider: this.name,
      mode: 'ondemand' as const,
      service: model,
      name: `Tembus On-Demand ${model}`,
      estimatedDays: 'same day',
      cost,
      isAvailable: true,
    }));
  }

  async createShipment(params: CreateShipmentParams): Promise<ShipmentResult> {
    const quote = this.payloadOf(
      await this.request(
        'POST',
        '/quotes',
        {
          weight: Number(Math.max(params.weightGrams / 1000, 0.1).toFixed(2)),
          models: [params.service || this.models[0]],
          ...(params.origin.latitude !== undefined ? { pickup_lat: params.origin.latitude } : {}),
          ...(params.origin.longitude !== undefined ? { pickup_lng: params.origin.longitude } : {}),
          ...(params.destination.latitude !== undefined ? { dropoff_lat: params.destination.latitude } : {}),
          ...(params.destination.longitude !== undefined ? { dropoff_lng: params.destination.longitude } : {}),
          ...(params.dimensions
            ? {
                length: params.dimensions.lengthCm,
                width: params.dimensions.widthCm,
                height: params.dimensions.heightCm,
              }
            : {}),
        },
        this.idempotencyKey('quote-' + params.orderNumber)
      )
    );

    const estimateId = pickString(quote?.estimate_id, quote?.quote_id);
    if (!estimateId) {
      throw new LogisticGatewayError('Tembus quote response has no estimate_id', this.name, undefined, quote);
    }

    const descriptionParts = [params.items.map((item) => `${item.name} x${item.quantity}`).join(', ')];
    if (params.deliveryInstructions) descriptionParts.push(`catatan: ${params.deliveryInstructions}`);

    const order = this.payloadOf(
      await this.request(
        'POST',
        '/orders',
        {
          estimate_id: estimateId,
          item_description: descriptionParts.join(' | ').slice(0, 500) || `Pesanan ${params.orderNumber}`,
          pickup_address: params.origin.addressLine,
          dropoff_address: params.destination.addressLine,
          model: params.service || this.models[0],
          cod: params.cod ?? false,
          insurance: params.insurance ?? false,
        },
        this.idempotencyKey('order-' + params.orderNumber)
      )
    );

    const orderId = pickString(order?.order_id, order?.id);
    if (!orderId) {
      throw new LogisticGatewayError('Tembus order response has no order_id', this.name, undefined, order);
    }

    return {
      awb: orderId,
      provider: this.name,
      mode: 'ondemand',
      service: params.service || this.models[0],
      status: normalizeShipmentStatus(order?.status ?? 'created'),
      cost: pickNumber(order?.total_price_idr, quote?.total_price_idr),
      estimatedDelivery: pickString(order?.estimated_delivery, order?.eta),
      rawResponse: order,
    };
  }

  async cancelShipment(awb: string): Promise<void> {
    await this.request('POST', `/orders/${encodeURIComponent(awb)}/cancel`, { reason: 'dibatalkan oleh merchant' }, this.idempotencyKey('cancel-' + awb));
  }

  async printLabel(awb: string): Promise<{ awb: string; labelUrl: string }> {
    const tracking = await this.trackShipment(awb);
    return { awb, labelUrl: (tracking as any).trackingUrl ?? '' };
  }

  async trackShipment(awb: string): Promise<TrackingInfo> {
    const parsed = this.payloadOf(await this.request('GET', `/orders/${encodeURIComponent(awb)}/track`));
    const history: TrackingEvent[] = Array.isArray(parsed?.history)
      ? parsed.history.map((entry: any) => ({
          status: normalizeShipmentStatus(entry?.status),
          rawStatus: String(entry?.status ?? ''),
          timestamp: String(entry?.timestamp ?? entry?.created_at ?? new Date().toISOString()),
          location: pickString(entry?.location),
          notes: pickString(entry?.notes, entry?.description),
        }))
      : [];

    return {
      awb,
      provider: this.name,
      service: pickString(parsed?.model, parsed?.service),
      status: normalizeShipmentStatus(parsed?.status),
      origin: pickString(parsed?.pickup_address),
      destination: pickString(parsed?.dropoff_address),
      estimatedDelivery: pickString(parsed?.estimated_delivery, parsed?.eta),
      history,
    };
  }

  async schedulePickup(_params: PickupParams): Promise<PickupResult> {
    throw new LogisticGatewayError(
      'Tembus on-demand does not expose pickup scheduling; courier pickup is dispatched automatically after order creation',
      this.name,
      501
    );
  }

  verifyWebhook(input: { signature: string; timestamp: string; rawBody: string }): boolean {
    if (!this.webhookSecret) return false;
    const match = /^sha256=([0-9a-f]{64})$/i.exec(String(input.signature ?? ''));
    if (!match) return false;
    const expected = crypto
      .createHmac('sha256', this.webhookSecret)
      .update(`${input.timestamp}.${input.rawBody}`)
      .digest('hex');
    const a = Buffer.from(expected, 'utf8');
    const b = Buffer.from(match[1].toLowerCase(), 'utf8');
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  }

  parseWebhookPayload(payload: unknown): {
    awb: string;
    orderNumber?: string;
    status: ShipmentStatus;
    rawStatus: string;
    timestamp: string;
    location?: string;
    notes?: string;
  } {
    const data = (payload ?? {}) as any;
    const body = data.data ?? data;
    return {
      awb: String(body.order_id ?? body.awb ?? body.id ?? ''),
      orderNumber: pickString(body.reference_id, body.merchant_reference, body.order_number),
      status: normalizeShipmentStatus(body.status),
      rawStatus: String(body.status ?? ''),
      timestamp: String(body.timestamp ?? body.occurred_at ?? new Date().toISOString()),
      location: pickString(body.location),
      notes: pickString(body.notes, body.description),
    };
  }

  private idempotencyKey(seed: string): string {
    return `${seed}-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
  }
}
