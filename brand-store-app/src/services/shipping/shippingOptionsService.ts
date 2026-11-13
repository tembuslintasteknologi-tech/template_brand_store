/**
 * Shipping options (BR-010).
 *
 * The customer picks a branch, then asks what can actually carry the parcel. Delivery mode is
 * decided by distance (BR-008), but a mode is only offered when the courier will really quote
 * the route. So ondemand needs both coordinate pairs and a successful `/quotes` call, while
 * 3PL needs a destination city for the aggregator tariff lookup.
 *
 * The decision layer is pure (`assembleShippingOptions`, `resolveSelectedShippingOption`) so it
 * can be tested without a database or a network. `listShippingOptions` is the only function
 * here that reads rows or calls a provider.
 *
 * OD-C is still open: `user_addresses` has no latitude/longitude column. Destination
 * coordinates therefore come from the request when the client has them. Without coordinates the
 * customer still gets 3PL, ondemand simply cannot be proven.
 */

import { and, eq } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { userAddresses } from '../../db/schema.js';
import {
  OrderSourceError,
  buildBranchSnapshot,
  type BranchSnapshot,
  type FulfillmentMode,
} from '../branch/orderSourceService.js';
import { getShowAggregatorWithinRadius, getStoreLocationById } from '../config/settings.js';
import { ensureLogisticProvidersRegistered } from '../logistics/logisticRegistry.js';
import type { Address, ShippingService } from '../logistics/logisticProvider.js';
import {
  haversineDistanceKm,
  parseCoordinates,
  resolveDeliveryModes,
  roundKm,
  type Coordinates,
  type DeliveryMode,
  type DeliveryModeReason,
} from './deliveryModeService.js';

/** Fallback parcel weight when the client does not send one. One kilogram keeps quotes sane. */
export const DEFAULT_PARCEL_WEIGHT_GRAMS = 1000;

export interface ShippingOption {
  mode: FulfillmentMode;
  provider: string;
  service: string;
  name: string;
  cost: number;
  estimatedDays: string;
  codSupported?: boolean;
  insuranceCost?: number;
}

export interface ShippingUnavailable {
  mode: FulfillmentMode;
  reason: string;
  message: string;
}

export interface ShippingDestination {
  addressId: string | null;
  city: string | null;
  postalCode: string | null;
  coordinates: Coordinates | null;
}

export interface ShippingOptionsResult {
  branch: BranchSnapshot;
  destination: ShippingDestination;
  modes: DeliveryMode[];
  reason: DeliveryModeReason;
  distanceKm: number | null;
  radiusKm: number | null;
  weightGrams: number;
  currency: 'IDR';
  options: ShippingOption[];
  unavailable: ShippingUnavailable[];
}

export interface AssembleShippingOptionsInput {
  /** Modes the distance rule allows, in the order the customer should see them. */
  modes: DeliveryMode[];
}

function isDeliveryMode(value: unknown): value is DeliveryMode {
  return value === 'ondemand' || value === 'aggregator';
}

/**
 * Turns provider output into what the storefront may show. Unavailable services, modes the
 * distance rule forbids, and duplicates are dropped here, which is why a caller can never pick
 * an option that was not offered for this branch.
 *
 * Ordering is mode first (ondemand before 3PL when inside the radius), then price, then name.
 */
export function assembleShippingOptions(
  services: ShippingService[],
  input: AssembleShippingOptionsInput
): ShippingOption[] {
  const allowed = new Set<DeliveryMode>(input.modes);
  const modeRank = new Map<DeliveryMode, number>();
  input.modes.forEach((mode, index) => modeRank.set(mode, index));

  const seen = new Set<string>();
  const options: ShippingOption[] = [];

  for (const service of services ?? []) {
    if (!service || service.isAvailable === false) continue;
    if (!isDeliveryMode(service.mode)) continue;
    if (!allowed.has(service.mode)) continue;

    const cost = Number(service.cost);
    if (!Number.isFinite(cost) || cost < 0) continue;

    const key = `${service.mode}:${service.service}`;
    if (seen.has(key)) continue;
    seen.add(key);

    options.push({
      mode: service.mode,
      provider: service.provider,
      service: service.service,
      name: service.name,
      cost,
      estimatedDays: service.estimatedDays,
      codSupported: service.codSupported,
      insuranceCost: service.insuranceCost,
    });
  }

  options.sort((a, b) => {
    const rankA = modeRank.get(a.mode) ?? Number.MAX_SAFE_INTEGER;
    const rankB = modeRank.get(b.mode) ?? Number.MAX_SAFE_INTEGER;
    if (rankA !== rankB) return rankA - rankB;
    if (a.cost !== b.cost) return a.cost - b.cost;
    return a.name.localeCompare(b.name);
  });

  return options;
}

export interface SelectShippingInput {
  selectedMode?: unknown;
  selectedService?: unknown;
}

function normalizeSelectedMode(value: unknown): FulfillmentMode | null {
  if (value === undefined || value === null || value === '') return null;
  const mode = String(value).trim().toLowerCase();
  if (mode !== 'ondemand' && mode !== 'aggregator') {
    throw new OrderSourceError(
      'INVALID_FULFILLMENT_MODE',
      `Mode pengiriman tidak dikenal: ${String(value)}`
    );
  }
  return mode;
}

/**
 * Picks the option the customer asked for and rejects everything else with a 400 that explains
 * which selector was wrong.
 *
 * Rules:
 *   - Unknown mode               -> INVALID_FULFILLMENT_MODE.
 *   - No option at all           -> SHIPPING_MODE_NOT_AVAILABLE.
 *   - Mode without any option    -> SHIPPING_MODE_NOT_AVAILABLE.
 *   - Aggregator without service -> SHIPPING_SERVICE_REQUIRED.
 *   - Service not in the list    -> SHIPPING_SERVICE_NOT_AVAILABLE.
 *   - Ondemand without service   -> first ondemand option, since the model is the service.
 *   - Nothing selected           -> first option in display order.
 */
export function resolveSelectedShippingOption(
  options: ShippingOption[],
  input: SelectShippingInput
): ShippingOption {
  const mode = normalizeSelectedMode(input.selectedMode);

  if (!options || options.length === 0) {
    throw new OrderSourceError('SHIPPING_MODE_NOT_AVAILABLE', 'Tidak ada opsi pengiriman yang tersedia');
  }

  const pool = mode ? options.filter((option) => option.mode === mode) : options;
  if (pool.length === 0) {
    throw new OrderSourceError(
      'SHIPPING_MODE_NOT_AVAILABLE',
      `Mode pengiriman ${mode} tidak tersedia untuk cabang ini`
    );
  }

  const wanted =
    input.selectedService === undefined || input.selectedService === null
      ? ''
      : String(input.selectedService).trim();

  if (wanted.length > 0) {
    const hit = pool.find((option) => option.service.toLowerCase() === wanted.toLowerCase());
    if (!hit) {
      throw new OrderSourceError(
        'SHIPPING_SERVICE_NOT_AVAILABLE',
        `Layanan ${wanted} tidak tersedia untuk mode ${mode ?? pool[0].mode}`
      );
    }
    return hit;
  }

  if (mode === 'aggregator') {
    throw new OrderSourceError(
      'SHIPPING_SERVICE_REQUIRED',
      'Layanan 3PL wajib dipilih saat mode pengiriman aggregator'
    );
  }

  return pool[0];
}

export interface ListShippingOptionsInput {
  branchId: string;
  addressId?: string | null;
  /** When present, the address must belong to this customer. */
  customerId?: string | null;
  /** Coordinates the client already has, because `user_addresses` does not store them yet. */
  destination?: {
    city?: string | null;
    postalCode?: string | null;
    latitude?: number | string | null;
    longitude?: number | string | null;
  };
  weightGrams?: number | string | null;
  value?: number | null;
  cod?: boolean;
}

function clampWeightGrams(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_PARCEL_WEIGHT_GRAMS;
  return Math.max(100, Math.round(parsed));
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

async function loadDestination(input: ListShippingOptionsInput): Promise<ShippingDestination> {
  let city = input.destination?.city?.trim() || null;
  let postalCode = input.destination?.postalCode?.trim() || null;
  let addressId: string | null = null;

  if (input.addressId) {
    addressId = String(input.addressId).trim();
    const where = input.customerId
      ? and(eq(userAddresses.id, addressId), eq(userAddresses.userId, input.customerId))
      : eq(userAddresses.id, addressId);
    const [row] = await db.select().from(userAddresses).where(where).limit(1);

    if (!row) {
      throw new OrderSourceError('ADDRESS_NOT_FOUND', `Alamat tidak ditemukan: ${addressId}`, 404);
    }

    city = city ?? row.city;
    postalCode = postalCode ?? row.postalCode;
  }

  return {
    addressId,
    city,
    postalCode,
    coordinates: parseCoordinates({
      latitude: input.destination?.latitude ?? null,
      longitude: input.destination?.longitude ?? null,
    }),
  };
}

function branchAddress(branch: {
  name: string;
  phone: string | null;
  addressLine: string;
  city: string;
  province: string;
  postalCode: string;
}, coordinates: Coordinates | null): Address {
  return {
    name: branch.name,
    phone: branch.phone ?? '',
    addressLine: branch.addressLine,
    city: branch.city,
    province: branch.province,
    postalCode: branch.postalCode,
    latitude: coordinates?.latitude,
    longitude: coordinates?.longitude,
  };
}

/**
 * Loads the branch, resolves the allowed modes, asks each courier for a quote, and returns the
 * merged list. A provider that fails is recorded in `unavailable` instead of turning the whole
 * request into a 500, because 3PL must keep working when the ondemand API is down.
 */
export async function listShippingOptions(
  input: ListShippingOptionsInput
): Promise<ShippingOptionsResult> {
  const branchId = typeof input.branchId === 'string' ? input.branchId.trim() : '';
  if (branchId.length === 0) {
    throw new OrderSourceError('BRANCH_REQUIRED', 'branchId wajib diisi');
  }

  const branch = await getStoreLocationById(branchId);
  if (!branch) {
    throw new OrderSourceError('BRANCH_NOT_FOUND', `Cabang tidak ditemukan: ${branchId}`, 404);
  }
  if (!branch.isActive) {
    throw new OrderSourceError('BRANCH_INACTIVE', `Cabang tidak aktif: ${branchId}`, 409);
  }

  const destination = await loadDestination(input);
  const originCoordinates = parseCoordinates({
    latitude: branch.latitude,
    longitude: branch.longitude,
  });
  const destinationCoordinates = destination.coordinates;
  const hasBothCoordinates = Boolean(originCoordinates && destinationCoordinates);
  const distanceKm = hasBothCoordinates
    ? roundKm(haversineDistanceKm(originCoordinates as Coordinates, destinationCoordinates as Coordinates))
    : null;

  const resolution = resolveDeliveryModes({
    distanceKm,
    ondemandEnabled: branch.ondemandEnabled,
    serviceRadiusKm: branch.serviceRadiusKm,
    hasDestinationCoords: hasBothCoordinates,
    showAggregatorWithinRadius: await getShowAggregatorWithinRadius(),
  });

  const weightGrams = clampWeightGrams(input.weightGrams);
  const registry = ensureLogisticProvidersRegistered();
  const collected: ShippingService[] = [];
  const unavailable: ShippingUnavailable[] = [];

  if (resolution.modes.includes('ondemand')) {
    if (!originCoordinates || !destinationCoordinates) {
      unavailable.push({
        mode: 'ondemand',
        reason: 'no_coordinates',
        message: 'Koordinat cabang atau tujuan belum lengkap, ondemand tidak bisa dihitung',
      });
    } else {
      try {
        const provider = registry.get('tembus_ondemand');
        const services = await provider.calculateRate({
          origin: branchAddress(branch, originCoordinates),
          destination: {
            name: 'Tujuan',
            phone: '',
            addressLine: '',
            city: destination.city ?? '',
            postalCode: destination.postalCode ?? undefined,
            latitude: destinationCoordinates.latitude,
            longitude: destinationCoordinates.longitude,
          },
          weightGrams,
          value: input.value ?? undefined,
          cod: input.cod,
        });
        collected.push(...services);
      } catch (err) {
        unavailable.push({
          mode: 'ondemand',
          reason: 'quote_failed',
          message: `Ondemand tidak bisa dihitung: ${errorMessage(err)}`,
        });
      }
    }
  }

  if (resolution.modes.includes('aggregator')) {
    if (!destination.city) {
      unavailable.push({
        mode: 'aggregator',
        reason: 'missing_destination_city',
        message: 'Kota tujuan belum diisi, tarif 3PL tidak bisa dihitung',
      });
    } else {
      try {
        const provider = registry.get('tembus_aggregator');
        const services = await provider.calculateRate({
          origin: branchAddress(branch, originCoordinates),
          destination: {
            name: 'Tujuan',
            phone: '',
            addressLine: '',
            city: destination.city,
            postalCode: destination.postalCode ?? undefined,
          },
          weightGrams,
          value: input.value ?? undefined,
          cod: input.cod,
        });
        collected.push(...services);
      } catch (err) {
        unavailable.push({
          mode: 'aggregator',
          reason: 'quote_failed',
          message: `3PL tidak bisa dihitung: ${errorMessage(err)}`,
        });
      }
    }
  }

  const options = assembleShippingOptions(collected, { modes: resolution.modes });

  for (const mode of resolution.modes) {
    const hasOption = options.some((option) => option.mode === mode);
    const hasReason = unavailable.some((entry) => entry.mode === mode);
    if (!hasOption && !hasReason) {
      unavailable.push({
        mode,
        reason: 'no_service',
        message: `Tidak ada layanan ${mode} untuk rute ini`,
      });
    }
  }

  return {
    branch: buildBranchSnapshot(branch) as BranchSnapshot,
    destination,
    modes: resolution.modes,
    reason: resolution.reason,
    distanceKm: resolution.distanceKm,
    radiusKm: resolution.radiusKm,
    weightGrams,
    currency: 'IDR',
    options,
    unavailable,
  };
}
