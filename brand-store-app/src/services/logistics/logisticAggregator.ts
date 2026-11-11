import {
  CreateShipmentParams,
  LogisticProvider,
  PickupParams,
  PickupResult,
  RateCalculationParams,
  ShipmentResult,
  ShippingService,
  TrackingInfo,
} from './logisticProvider.js';

export interface RateComparisonEntry extends ShippingService {
  provider: string;
}

export interface ProviderDescriptor {
  name: string;
  mode: LogisticProvider['mode'];
  services: string[];
}

export class LogisticAggregator {
  private providers: Map<string, LogisticProvider> = new Map();

  register(provider: LogisticProvider): void {
    this.providers.set(provider.name, provider);
  }

  get(name: string): LogisticProvider {
    const provider = this.providers.get(name);
    if (!provider) {
      throw new Error(`Unknown logistics provider: ${name}`);
    }
    return provider;
  }

  list(): ProviderDescriptor[] {
    return Array.from(this.providers.values()).map((provider) => ({
      name: provider.name,
      mode: provider.mode,
      services: [],
    }));
  }

  names(): string[] {
    return Array.from(this.providers.keys());
  }

  async compareRates(params: RateCalculationParams): Promise<RateComparisonEntry[]> {
    const collected: RateComparisonEntry[] = [];
    const errors: string[] = [];

    for (const provider of this.providers.values()) {
      try {
        const rates = await provider.calculateRate(params);
        for (const rate of rates) {
          collected.push({ ...rate, provider: rate.provider || provider.name });
        }
      } catch (err: any) {
        errors.push(`${provider.name}: ${err?.message ?? 'failed'}`);
      }
    }

    if (collected.length === 0 && errors.length > 0) {
      throw new Error(`All logistics providers failed: ${errors.join('; ')}`);
    }

    return collected.sort((a, b) => a.cost - b.cost);
  }

  async pickCheapest(params: RateCalculationParams): Promise<RateComparisonEntry | null> {
    const rates = await this.compareRates(params);
    const available = rates.filter((rate) => rate.isAvailable);
    return available[0] ?? null;
  }

  async pickFastest(params: RateCalculationParams): Promise<RateComparisonEntry | null> {
    const rates = await this.compareRates(params);
    const available = rates.filter((rate) => rate.isAvailable);
    if (available.length === 0) return null;

    return available.reduce((best, candidate) => {
      const bestMax = maxDays(best.estimatedDays);
      const candidateMax = maxDays(candidate.estimatedDays);
      if (candidateMax < bestMax) return candidate;
      if (candidateMax === bestMax && candidate.cost < best.cost) return candidate;
      return best;
    }, available[0]);
  }

  async createShipment(providerName: string, params: CreateShipmentParams): Promise<ShipmentResult> {
    return this.get(providerName).createShipment(params);
  }

  async trackAny(awb: string, providerName?: string): Promise<TrackingInfo> {
    if (providerName) {
      return this.get(providerName).trackShipment(awb);
    }

    const errors: string[] = [];
    for (const provider of this.providers.values()) {
      try {
        return await provider.trackShipment(awb);
      } catch (err: any) {
        errors.push(`${provider.name}: ${err?.message ?? 'failed'}`);
      }
    }
    throw new Error(`AWB ${awb} not found in any provider (${errors.join('; ')})`);
  }

  async schedulePickup(providerName: string, params: PickupParams): Promise<PickupResult> {
    return this.get(providerName).schedulePickup(params);
  }
}

export function maxDays(estimatedDays: string): number {
  const matches = String(estimatedDays ?? '').match(/\d+/g);
  if (!matches || matches.length === 0) return Number.POSITIVE_INFINITY;
  return Math.max(...matches.map((value) => Number(value)));
}

export const logisticAggregator = new LogisticAggregator();
