/**
 * Validation rules for branch master data (BR-005).
 *
 * Kept pure and synchronous so the admin endpoints can reject bad input before touching the
 * database, and so every rule has a unit test that does not need a live Postgres.
 */

export const BRANCH_CODE_PATTERN = /^[A-Z0-9-]{2,20}$/;
export const MAX_SERVICE_RADIUS_KM = 500;

export type BranchValidationCode =
  | 'INVALID_CODE'
  | 'INVALID_COORDINATES'
  | 'INCOMPLETE_COORDINATES'
  | 'ONDEMAND_REQUIRES_COORDINATES'
  | 'BRANCH_HAS_STOCK'
  | 'BRANCH_IS_DEFAULT'
  | 'INVALID_SERVICE_RADIUS';

export class BranchValidationError extends Error {
  readonly code: BranchValidationCode;
  readonly status: 400 | 409;

  constructor(code: BranchValidationCode, message: string, status: 400 | 409 = 400) {
    super(message);
    this.name = 'BranchValidationError';
    this.code = code;
    this.status = status;
  }
}

/** Uppercases, trims, and collapses whitespace so `cbg jogja` becomes `CBG-JOGJA`. */
export function normalizeBranchCode(raw: unknown): string {
  if (typeof raw !== 'string') {
    throw new BranchValidationError('INVALID_CODE', 'Kode cabang wajib berupa teks');
  }
  const normalized = raw.trim().toUpperCase().replace(/\s+/g, '-');
  if (!BRANCH_CODE_PATTERN.test(normalized)) {
    throw new BranchValidationError(
      'INVALID_CODE',
      'Kode cabang hanya boleh huruf, angka, dan tanda minus, panjang 2 sampai 20 karakter'
    );
  }
  return normalized;
}

/** Fallback code for a branch created without one, so the unique index never sees NULL. */
export function generateBranchCode(): string {
  const suffix = Math.random().toString(16).slice(2, 10).toUpperCase().padEnd(8, '0');
  return `CBG-${suffix}`;
}

export type CoordinateKind = 'latitude' | 'longitude';

export function coerceCoordinate(value: unknown, kind: CoordinateKind): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  const limit = kind === 'latitude' ? 90 : 180;
  if (!Number.isFinite(parsed) || parsed < -limit || parsed > limit) {
    throw new BranchValidationError(
      'INVALID_COORDINATES',
      `${kind === 'latitude' ? 'Latitude' : 'Longitude'} harus di antara -${limit} dan ${limit}`
    );
  }
  return parsed;
}

export interface Coordinates {
  latitude: number | null;
  longitude: number | null;
}

/**
 * A branch either has both coordinates or neither. Half a coordinate pair is always a bug,
 * not a state the delivery mode resolver should have to guess about.
 */
export function validateCoordinates(latitude: unknown, longitude: unknown): Coordinates {
  const lat = coerceCoordinate(latitude, 'latitude');
  const lng = coerceCoordinate(longitude, 'longitude');
  if ((lat === null) !== (lng === null)) {
    throw new BranchValidationError(
      'INCOMPLETE_COORDINATES',
      'Latitude dan longitude harus diisi bersama atau dikosongkan bersama'
    );
  }
  return { latitude: lat, longitude: lng };
}

export interface OndemandState {
  ondemandEnabled: boolean;
  latitude: number | null;
  longitude: number | null;
}

/** Ondemand delivery needs a map pin to calculate the radius from. */
export function assertOndemandUsable(state: OndemandState): void {
  if (!state.ondemandEnabled) return;
  if (state.latitude === null || state.longitude === null) {
    throw new BranchValidationError(
      'ONDEMAND_REQUIRES_COORDINATES',
      'Ondemand tidak bisa diaktifkan tanpa koordinat cabang'
    );
  }
}

export function validateServiceRadius(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === '') return null;
  const parsed = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > MAX_SERVICE_RADIUS_KM) {
    throw new BranchValidationError(
      'INVALID_SERVICE_RADIUS',
      `Radius layanan harus bilangan bulat 1 sampai ${MAX_SERVICE_RADIUS_KM} km`
    );
  }
  return parsed;
}

/** Refuses to hide a branch that customers can still order from. */
export function assertBranchDeactivatable(availableStock: number): void {
  if (availableStock > 0) {
    throw new BranchValidationError(
      'BRANCH_HAS_STOCK',
      `Cabang masih punya ${availableStock} stok tersedia, pindahkan atau nolkan dulu sebelum menonaktifkan`,
      409
    );
  }
}

/** The default location is the shipping origin for 3PL, deleting it would break checkout. */
export function assertBranchDeletable(isDefault: boolean | null | undefined): void {
  if (isDefault === true) {
    throw new BranchValidationError(
      'BRANCH_IS_DEFAULT',
      'Cabang default tidak bisa dihapus, pindahkan default ke cabang lain dulu',
      409
    );
  }
}
