/**
 * Delivery mode resolver (BR-008).
 *
 * Distance decides the mode, branch selection does not. Everything here is pure and
 * synchronous so the radius rules can be tested without a database or a network call.
 * The HTTP layer only feeds real numbers in and reads `modes` out.
 */

export const DELIVERY_MODES = ['ondemand', 'aggregator'] as const;
export type DeliveryMode = (typeof DELIVERY_MODES)[number];

/**
 * Fallback radius when a branch has no `service_radius_km` yet.
 *
 * A branch without an explicit radius must not silently disable ondemand, otherwise every
 * branch created before BR-005 would lose the same-day option. The value is a code default,
 * not a business promise, and the branch admin can override it per branch.
 */
export const DEFAULT_SERVICE_RADIUS_KM = 15;

export interface Coordinates {
  latitude: number;
  longitude: number;
}

export type DeliveryModeReason =
  | 'no_destination_coords'
  | 'ondemand_disabled'
  | 'outside_radius'
  | 'within_radius';

export interface DeliveryModeInput {
  distanceKm?: number | null;
  ondemandEnabled: boolean;
  serviceRadiusKm?: number | null;
  hasDestinationCoords: boolean;
  /**
   * OD-B is still open: whether 3PL is offered as a price comparison inside the ondemand
   * radius. The resolver stays honest by returning both modes, the caller decides whether to
   * hide aggregator. Default true means the customer sees both and can compare.
   */
  showAggregatorWithinRadius?: boolean;
}

export interface DeliveryModeResult {
  modes: DeliveryMode[];
  reason: DeliveryModeReason;
  radiusKm: number | null;
  distanceKm: number | null;
}

function positiveOrNull(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

/**
 * Rules, in order:
 *   1. No destination coordinates      -> aggregator only (distance cannot be proven).
 *   2. Ondemand disabled on the branch -> aggregator only.
 *   3. Distance beyond the radius      -> aggregator only.
 *   4. Inside the radius               -> ondemand, plus aggregator when configured.
 *
 * Aggregator is always in the list at step 1 to 3 because 3PL covers the whole country.
 */
export function resolveDeliveryModes(input: DeliveryModeInput): DeliveryModeResult {
  const radiusKm = positiveOrNull(input.serviceRadiusKm) ?? DEFAULT_SERVICE_RADIUS_KM;
  const distanceKm =
    typeof input.distanceKm === 'number' && Number.isFinite(input.distanceKm)
      ? input.distanceKm
      : null;

  if (!input.hasDestinationCoords || distanceKm === null) {
    return { modes: ['aggregator'], reason: 'no_destination_coords', radiusKm, distanceKm: null };
  }

  if (!input.ondemandEnabled) {
    return { modes: ['aggregator'], reason: 'ondemand_disabled', radiusKm, distanceKm };
  }

  if (distanceKm > radiusKm) {
    return { modes: ['aggregator'], reason: 'outside_radius', radiusKm, distanceKm };
  }

  const modes: DeliveryMode[] =
    input.showAggregatorWithinRadius === false ? ['ondemand'] : ['ondemand', 'aggregator'];

  return { modes, reason: 'within_radius', radiusKm, distanceKm };
}

export function isOndemandAvailable(result: DeliveryModeResult): boolean {
  return result.modes.includes('ondemand');
}

const EARTH_RADIUS_KM = 6371.0088;

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/** Great-circle distance in kilometres. Values are not rounded, callers decide the precision. */
export function haversineDistanceKm(from: Coordinates, to: Coordinates): number {
  const dLat = toRadians(to.latitude - from.latitude);
  const dLng = toRadians(to.longitude - from.longitude);
  const lat1 = toRadians(from.latitude);
  const lat2 = toRadians(to.latitude);

  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;

  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(a)));
}

export function roundKm(km: number): number {
  return Math.round(km * 100) / 100;
}

export interface MaybeCoordinates {
  latitude?: number | string | null;
  longitude?: number | string | null;
}

/**
 * Reads a coordinate pair from query strings or decimal columns. Returns null when either half
 * is missing or out of range, so a half coordinate can never be mistaken for a real location.
 */
export function parseCoordinates(input: MaybeCoordinates): Coordinates | null {
  const lat = typeof input.latitude === 'string' ? Number(input.latitude) : input.latitude;
  const lng = typeof input.longitude === 'string' ? Number(input.longitude) : input.longitude;

  if (typeof lat !== 'number' || typeof lng !== 'number') return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  if (lat === 0 && lng === 0) return null;

  return { latitude: lat, longitude: lng };
}
