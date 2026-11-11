import {
  CreateShipmentParams,
  LogisticGatewayError,
  LogisticProvider,
  PickupParams,
  PickupResult,
  RateCalculationParams,
  ShipmentResult,
  ShippingService,
  TrackingEvent,
  TrackingInfo,
} from './logisticProvider.js';
import { normalizeShipmentStatus } from './statusMap.js';

export interface TembusAggregatorOptions {
  baseUrl?: string;
  token?: string;
  providers?: string[];
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

interface AggregatorServiceOption {
  service_code?: string;
  service_name?: string;
  tariff_gross?: number;
  tariff_net?: number;
  customer_tariff_idr?: number;
  etd?: string;
  etd_source?: string;
  quote_id?: string;
}

function pickString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === 'string' && value.trim().length > 0) return value.trim();
  }
  return undefined;
}

function pickNumber(...values: unknown[]): number {
  for (const value of values) {
    const num = typeof value === 'string' ? Number(value) : (value as number);
    if (typeof num === 'number' && Number.isFinite(num)) return num;
  }
  return 0;
}

export class TembusAggregatorProvider implements LogisticProvider {
  name = 'tembus_aggregator';
  mode = 'aggregator' as const;
  private baseUrl: string;
  private token: string;
  private carriers: string[];
  private timeoutMs: number;
  private fetchImpl: typeof fetch;

  constructor(options: TembusAggregatorOptions = {}) {
    this.baseUrl = (options.baseUrl ?? 'https://staging-api.bawain.my.id').replace(/\/$/, '');
    this.token = options.token ?? '';
    this.carriers = options.providers && options.providers.length > 0 ? options.providers : ['jne', 'jnt'];
    this.timeoutMs = options.timeoutMs ?? 15000;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  private async request(method: string, path: string): Promise<any> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let response: Response;
    try {
      response = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method,
        headers: {
          accept: 'application/json',
          authorization: `Bearer ${this.token}`,
        },
        signal: controller.signal,
      });
    } catch (err: any) {
      throw new LogisticGatewayError(
        `Tembus aggregator request failed: ${err?.message ?? 'network error'}`,
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
      const detail = parsed?.message ?? parsed?.error?.message ?? text.slice(0, 200);
      throw new LogisticGatewayError(
        `Tembus aggregator rejected ${method} ${path}: ${detail}`,
        this.name,
        response.status,
        parsed
      );
    }

    return parsed;
  }

  private tariffQuery(params: RateCalculationParams): string {
    const weightKg = Math.max(params.weightGrams / 1000, 0.1);
    const query = new URLSearchParams();
    query.set('origin_code', params.origin.city);
    query.set('destination_code', params.destination.city);
    query.set('weight_kg', String(Number(weightKg.toFixed(2))));
    if (params.dimensions) {
      query.set('length_cm', String(params.dimensions.lengthCm));
      query.set('width_cm', String(params.dimensions.widthCm));
      query.set('height_cm', String(params.dimensions.heightCm));
    }
    if (params.value !== undefined) query.set('item_value_idr', String(Math.round(params.value)));
    if (params.cod !== undefined) query.set('cod', String(params.cod));
    return query.toString();
  }

  async getServices(): Promise<ShippingService[]> {
    return this.carriers.map((carrier) => ({
      provider: this.name,
      mode: 'aggregator',
      service: `${carrier.toUpperCase()}_REG`,
      name: `Tembus ${carrier.toUpperCase()} Regular`,
      estimatedDays: '2-4',
      cost: 0,
      isAvailable: true,
    }));
  }

  async calculateRate(params: RateCalculationParams): Promise<ShippingService[]> {
    const collected: ShippingService[] = [];
    const query = this.tariffQuery(params);

    for (const carrier of this.carriers) {
      const parsed = await this.request(
        'GET',
        `/api/v1/logistics/tariff?provider=${encodeURIComponent(carrier)}&${query}`
      );
      const data = parsed?.data ?? parsed;
      const services: AggregatorServiceOption[] = Array.isArray(data?.services) ? data.services : [];

      for (const service of services) {
        const code = pickString(service.service_code) ?? carrier.toUpperCase();
        collected.push({
          provider: this.name,
          mode: 'aggregator',
          service: `${carrier.toUpperCase()}_${code}`,
          name: pickString(service.service_name) ?? `Tembus ${carrier.toUpperCase()} ${code}`,
          estimatedDays: pickString(service.etd) ?? '2-4',
          cost: pickNumber(service.customer_tariff_idr, service.tariff_net, service.tariff_gross),
          isAvailable: true,
          codSupported: params.cod ?? false,
          insuranceCost: 0,
        });
      }
    }

    return collected;
  }

  async createShipment(params: CreateShipmentParams): Promise<ShipmentResult> {
    if (!this.token) {
      throw new LogisticGatewayError(
        'Tembus aggregator shipment creation requires a partner credential (TEMBUS_AGGREGATOR_TOKEN); the public developer API only exposes on-demand orders',
        this.name,
        501
      );
    }

    const carrier = (params.service || 'jne_reg').split('_')[0].toLowerCase();
    const serviceType = (params.service || 'jne_reg').split('_').slice(1).join('_').toUpperCase() || 'REG';

    const parsed = await this.requestWithBody('/api/internal/logistics/create-order', {
      provider: carrier,
      reference_id: params.orderNumber,
      sender_name: params.origin.name,
      sender_phone: params.origin.phone,
      sender_address: params.origin.addressLine,
      sender_city: params.origin.city,
      sender_zip_code: params.origin.postalCode ?? '',
      receiver_name: params.destination.name,
      receiver_phone: params.destination.phone,
      receiver_address: params.destination.addressLine,
      receiver_city: params.destination.city,
      receiver_zip_code: params.destination.postalCode ?? '',
      origin_code: params.origin.city,
      destination_code: params.destination.city,
      weight_kg: Number(Math.max(params.weightGrams / 1000, 0.1).toFixed(2)),
      item_description: params.items.map((item) => `${item.name} x${item.quantity}`).join(', ').slice(0, 200),
      item_value: Math.round(params.items.reduce((sum, item) => sum + (item.value ?? 0) * item.quantity, 0)),
      service_type: serviceType,
    });

    const data = parsed?.data ?? parsed;
    const awb = pickString(data?.awb_number, data?.awb, data?.tracking_number);
    if (!awb) {
      throw new LogisticGatewayError('Tembus aggregator response has no awb_number', this.name, undefined, parsed);
    }

    return {
      awb,
      provider: this.name,
      mode: 'aggregator',
      service: params.service || `${carrier.toUpperCase()}_${serviceType}`,
      status: normalizeShipmentStatus(data?.status ?? 'created'),
      cost: pickNumber(data?.tariff_net, data?.tariff_gross),
      labelUrl: pickString(data?.label_url),
      rawResponse: data,
    };
  }

  private async requestWithBody(path: string, body: unknown): Promise<any> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let response: Response;
    try {
      response = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json',
          authorization: `Bearer ${this.token}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (err: any) {
      throw new LogisticGatewayError(
        `Tembus aggregator request failed: ${err?.message ?? 'network error'}`,
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
      throw new LogisticGatewayError(
        `Tembus aggregator rejected POST ${path}: ${parsed?.message ?? text.slice(0, 200)}`,
        this.name,
        response.status,
        parsed
      );
    }
    return parsed;
  }

  async cancelShipment(awb: string): Promise<void> {
    throw new LogisticGatewayError(
      `Cancelling aggregator shipment ${awb} is not exposed by the Tembus public API`,
      this.name,
      501
    );
  }

  async printLabel(awb: string): Promise<{ awb: string; labelUrl: string }> {
    return {
      awb,
      labelUrl: `${this.baseUrl}/api/resi/render/${encodeURIComponent(awb)}`,
    };
  }

  async trackShipment(awb: string): Promise<TrackingInfo> {
    const parsed = await this.request('GET', `/api/v1/tracking/public?resi=${encodeURIComponent(awb)}`);
    const data = parsed?.data ?? parsed;
    const history: TrackingEvent[] = Array.isArray(data?.history)
      ? data.history.map((entry: any) => ({
          status: normalizeShipmentStatus(entry?.status),
          rawStatus: String(entry?.status ?? ''),
          timestamp: String(entry?.timestamp ?? entry?.occurred_at ?? new Date().toISOString()),
          location: pickString(entry?.location),
          notes: pickString(entry?.notes, entry?.description),
        }))
      : [];

    return {
      awb,
      provider: this.name,
      service: pickString(data?.service_type, data?.service),
      status: normalizeShipmentStatus(data?.status ?? data?.resi_status),
      origin: pickString(data?.sender_city, data?.origin),
      destination: pickString(data?.receiver_city, data?.destination),
      estimatedDelivery: pickString(data?.etd, data?.estimated_delivery),
      history,
    };
  }

  async schedulePickup(params: PickupParams): Promise<PickupResult> {
    throw new LogisticGatewayError(
      `Pickup scheduling for aggregator shipments (${params.shipmentAwbs.length} AWB) is not exposed by the Tembus public API`,
      this.name,
      501
    );
  }

  verifyWebhook(input: { signature: string; timestamp: string; rawBody: string }): boolean {
    // Carrier events are consumed by Tembus itself; the storefront receives order
    // status through tracking pull, so no shared signing secret exists yet.
    return false;
  }

  parseWebhookPayload(payload: unknown): {
    awb: string;
    orderNumber?: string;
    status: ReturnType<typeof normalizeShipmentStatus>;
    rawStatus: string;
    timestamp: string;
    location?: string;
    notes?: string;
  } {
    const data = (payload ?? {}) as any;
    const body = data.data ?? data;
    return {
      awb: String(body.awb_number ?? body.awb ?? ''),
      orderNumber: pickString(body.reference_id, body.order_number),
      status: normalizeShipmentStatus(body.status),
      rawStatus: String(body.status ?? ''),
      timestamp: String(body.timestamp ?? body.occurred_at ?? new Date().toISOString()),
      location: pickString(body.location),
      notes: pickString(body.description, body.notes),
    };
  }
}
