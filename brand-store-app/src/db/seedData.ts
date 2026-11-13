/**
 * Pure seed data for the branch demo (BR-015).
 *
 * Kept separate from `seed.ts` because that file runs `seed()` at import time. Everything here is
 * synchronous and side effect free, so the demo branches, catalogue, and stock plan can be tested
 * without a database.
 *
 * The stock plan is the contract the storefront sees:
 *   PUSAT 50, CBG-BDG 12, CBG-SBY 8  ->  variant aggregate 70
 *
 * A branch is a seller inside one brand, not an automatic router. Customers pick the branch, and
 * the distance from that branch decides whether ondemand is offered.
 */

import { unifiedConfig } from '../config/unifiedConfig.js';

export type SeedBranchType = 'pusat' | 'cabang';

export interface SeedBranch {
  code: string;
  name: string;
  type: SeedBranchType;
  phone: string;
  addressLine: string;
  city: string;
  province: string;
  postalCode: string;
  /** decimal column, so the value travels as a string */
  latitude: string;
  longitude: string;
  ondemandEnabled: boolean;
  serviceRadiusKm: number;
  managerName: string;
  isDefault: boolean;
  isActive: boolean;
}

export interface SeedProduct {
  title: string;
  slug: string;
  description: string;
  basePrice: string;
  sku: string;
  stock: number;
  lowStockThreshold: number;
  status: 'draft' | 'published' | 'archived';
  images: unknown[];
  attributes: Record<string, unknown>;
  metaTitle: string;
  metaDescription: string;
}

export interface SeedVariant {
  sku: string;
  name: string;
  price: string;
  stock: number;
  reservedStock: number;
  lowStockThreshold: number;
  attributes: Record<string, unknown>;
}

export interface SeedCatalog {
  product: SeedProduct;
  variant: SeedVariant;
}

export interface SeedInventoryRow {
  branchCode: string;
  variantSku: string;
  stock: number;
  lowStockThreshold: number;
}

export const PUSAT_CODE = 'PUSAT';
export const DEMO_BRANCH_CODES = ['CBG-BDG', 'CBG-SBY'] as const;
export const DEMO_PRODUCT_SLUG = 'kaos-tembus-demo';
export const DEMO_PRODUCT_SKU = 'DEMO-KAOS-001';
export const DEMO_VARIANT_SKU = 'DEMO-KAOS-001-M';
export const DEMO_LOW_STOCK_THRESHOLD = 5;

export const DEMO_STOCK_BY_CODE: Record<string, number> = {
  [PUSAT_CODE]: 50,
  'CBG-BDG': 12,
  'CBG-SBY': 8,
};

/** Pusat follows the brand configuration, so renaming the brand does not silently split the seed. */
export function pusatBranch(): SeedBranch {
  return {
    code: PUSAT_CODE,
    name: unifiedConfig.storeOrigin.name,
    type: 'pusat',
    phone: unifiedConfig.storeOrigin.phone,
    addressLine: unifiedConfig.storeOrigin.address,
    city: unifiedConfig.storeOrigin.city,
    province: unifiedConfig.storeOrigin.province,
    postalCode: unifiedConfig.storeOrigin.postalCode,
    latitude: '-6.2088000',
    longitude: '106.8456000',
    ondemandEnabled: true,
    serviceRadiusKm: 15,
    managerName: 'Kepala Cabang Pusat',
    isDefault: true,
    isActive: true,
  };
}

/** Two demo branches with real coordinates, so the radius rule can be exercised end to end. */
export function demoBranches(): SeedBranch[] {
  return [
    {
      code: 'CBG-BDG',
      name: 'TEMBUS Cabang Bandung',
      type: 'cabang',
      phone: '+62224234567',
      addressLine: 'Jl. Asia Afrika No. 8',
      city: 'Bandung',
      province: 'Jawa Barat',
      postalCode: '40111',
      latitude: '-6.9218000',
      longitude: '107.6071000',
      ondemandEnabled: true,
      serviceRadiusKm: 15,
      managerName: 'Kepala Cabang Bandung',
      isDefault: false,
      isActive: true,
    },
    {
      code: 'CBG-SBY',
      name: 'TEMBUS Cabang Surabaya',
      type: 'cabang',
      phone: '+62315345678',
      addressLine: 'Jl. Tunjungan No. 45',
      city: 'Surabaya',
      province: 'Jawa Timur',
      postalCode: '60275',
      latitude: '-7.2575000',
      longitude: '112.7521000',
      ondemandEnabled: true,
      serviceRadiusKm: 20,
      managerName: 'Kepala Cabang Surabaya',
      isDefault: false,
      isActive: true,
    },
  ];
}

export function demoCatalog(): SeedCatalog {
  const totalStock = Object.values(DEMO_STOCK_BY_CODE).reduce((sum, value) => sum + value, 0);
  const price = '149000.00';

  return {
    product: {
      title: 'Kaos TEMBUS Demo',
      slug: DEMO_PRODUCT_SLUG,
      description: 'Produk contoh untuk mencoba pemilihan cabang dan mode pengiriman.',
      basePrice: price,
      sku: DEMO_PRODUCT_SKU,
      stock: totalStock,
      lowStockThreshold: DEMO_LOW_STOCK_THRESHOLD,
      status: 'published',
      images: [],
      attributes: { material: 'cotton' },
      metaTitle: 'Kaos TEMBUS Demo',
      metaDescription: 'Kaos contoh untuk demo stok dan pengiriman per cabang.',
    },
    variant: {
      sku: DEMO_VARIANT_SKU,
      name: 'Kaos TEMBUS Demo - M',
      price,
      stock: totalStock,
      reservedStock: 0,
      lowStockThreshold: DEMO_LOW_STOCK_THRESHOLD,
      attributes: { size: 'M' },
    },
  };
}

/** One row per seeded branch, in pusat-first order, with the stock plan applied to the demo variant. */
export function demoInventoryRows(): SeedInventoryRow[] {
  return Object.entries(DEMO_STOCK_BY_CODE).map(([branchCode, stock]) => ({
    branchCode,
    variantSku: DEMO_VARIANT_SKU,
    stock,
    lowStockThreshold: DEMO_LOW_STOCK_THRESHOLD,
  }));
}
