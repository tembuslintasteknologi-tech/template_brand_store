/**
 * Public branch availability for a product page (BR-007).
 *
 * Only branches that can actually ship the product right now are returned. A branch is
 * hidden when it is offline, inactive, or has zero sellable stock across every variant of the
 * product. Hidden branches are hidden entirely, the storefront never sees a zero stock row.
 */

import { db } from '../../db/index.js';
import { branchInventory, productVariants, products, storeLocations } from '../../db/schema.js';
import { and, eq, sql } from 'drizzle-orm';
import {
  Coordinates,
  DeliveryMode,
  haversineDistanceKm,
  isOndemandAvailable,
  parseCoordinates,
  resolveDeliveryModes,
  roundKm,
} from '../shipping/deliveryModeService.js';

export type BranchStockAvailability = 'in_stock' | 'low_stock';

export interface BranchAvailability {
  branchId: string;
  code: string | null;
  name: string;
  city: string;
  available: number;
  stockStatus: BranchStockAvailability;
  distanceKm: number | null;
  ondemandAvailable: boolean;
  availableModes: DeliveryMode[];
}

export interface BranchAvailabilityResult {
  productId: string;
  productSlug: string;
  branches: BranchAvailability[];
  reason: 'no_branch_has_stock' | null;
}

export interface BranchAvailabilityOptions {
  latitude?: string | number | null;
  longitude?: string | number | null;
  showAggregatorWithinRadius?: boolean;
}

export class ProductNotFoundError extends Error {
  readonly status = 404;

  constructor(slug: string) {
    super(`Produk tidak ditemukan: ${slug}`);
    this.name = 'ProductNotFoundError';
  }
}

/** One grouped inventory row per branch, as returned by the aggregate query. */
export interface BranchAvailabilityRow {
  branchId: string;
  code: string | null;
  name: string;
  city: string;
  latitude: string | number | null;
  longitude: string | number | null;
  ondemandEnabled: boolean;
  serviceRadiusKm: number | null;
  available: string | number | null;
}

export interface AssembleBranchesOptions extends BranchAvailabilityOptions {
  lowStockThreshold?: number | null;
}

/**
 * Turns grouped inventory rows into the public branch list. Pure on purpose: the filter, the
 * sort and the mode decision are the part customers actually feel, so they are testable
 * without Postgres.
 *
 * Rows with zero sellable stock are dropped entirely. The storefront must never render a
 * branch it cannot order from.
 */
export function assembleBranches(
  rows: BranchAvailabilityRow[],
  options: AssembleBranchesOptions = {}
): BranchAvailability[] {
  const customer = parseCoordinates(options);
  const lowStockThreshold =
    typeof options.lowStockThreshold === 'number' && Number.isFinite(options.lowStockThreshold)
      ? options.lowStockThreshold
      : 5;

  return rows
    .map((row) => {
      const available = Number(row.available ?? 0);
      const branchCoords: Coordinates | null = parseCoordinates({
        latitude: row.latitude,
        longitude: row.longitude,
      });
      const distanceKm =
        customer && branchCoords ? roundKm(haversineDistanceKm(customer, branchCoords)) : null;

      // Distance is only a map hint here. Live courier coverage for this branch is validated
      // in the shipping options route (BR-010), where the quote itself can fail.
      const modes = resolveDeliveryModes({
        distanceKm,
        ondemandEnabled: row.ondemandEnabled,
        serviceRadiusKm: row.serviceRadiusKm,
        hasDestinationCoords: customer !== null,
        showAggregatorWithinRadius: options.showAggregatorWithinRadius,
      });

      return {
        branchId: row.branchId,
        code: row.code,
        name: row.name,
        city: row.city,
        available,
        stockStatus: (available <= lowStockThreshold
          ? 'low_stock'
          : 'in_stock') as BranchStockAvailability,
        distanceKm,
        ondemandAvailable: isOndemandAvailable(modes),
        availableModes: modes.modes,
      };
    })
    .filter((branch) => Number.isFinite(branch.available) && branch.available > 0)
    .sort((a, b) => {
      if (a.distanceKm !== null && b.distanceKm !== null) return a.distanceKm - b.distanceKm;
      if (a.distanceKm !== null) return -1;
      if (b.distanceKm !== null) return 1;
      return a.name.localeCompare(b.name);
    });
}

export async function listProductBranchAvailability(
  slug: string,
  options: BranchAvailabilityOptions = {}
): Promise<BranchAvailabilityResult> {
  const [product] = await db
    .select({
      id: products.id,
      slug: products.slug,
      lowStockThreshold: products.lowStockThreshold,
    })
    .from(products)
    .where(eq(products.slug, slug))
    .limit(1);

  if (!product) {
    throw new ProductNotFoundError(slug);
  }

  const rows = await db
    .select({
      branchId: storeLocations.id,
      code: storeLocations.code,
      name: storeLocations.name,
      city: storeLocations.city,
      latitude: storeLocations.latitude,
      longitude: storeLocations.longitude,
      ondemandEnabled: storeLocations.ondemandEnabled,
      serviceRadiusKm: storeLocations.serviceRadiusKm,
      available: sql<number>`coalesce(sum(greatest(${branchInventory.stock} - ${branchInventory.reservedStock}, 0)), 0)`,
    })
    .from(branchInventory)
    .innerJoin(productVariants, eq(branchInventory.variantId, productVariants.id))
    .innerJoin(storeLocations, eq(branchInventory.branchId, storeLocations.id))
    .where(
      and(
        eq(productVariants.productId, product.id),
        eq(storeLocations.isOnline, true),
        eq(storeLocations.isActive, true)
      )
    )
    .groupBy(
      storeLocations.id,
      storeLocations.code,
      storeLocations.name,
      storeLocations.city,
      storeLocations.latitude,
      storeLocations.longitude,
      storeLocations.ondemandEnabled,
      storeLocations.serviceRadiusKm
    );

  const lowStockThreshold = Number(product.lowStockThreshold ?? 5);

  const branches = assembleBranches(rows, {
    latitude: options.latitude,
    longitude: options.longitude,
    showAggregatorWithinRadius: options.showAggregatorWithinRadius,
    lowStockThreshold,
  });

  return {
    productId: product.id,
    productSlug: product.slug,
    branches,
    reason: branches.length === 0 ? 'no_branch_has_stock' : null,
  };
}
