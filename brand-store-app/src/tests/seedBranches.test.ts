import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  DEMO_BRANCH_CODES,
  DEMO_LOW_STOCK_THRESHOLD,
  DEMO_PRODUCT_SKU,
  DEMO_PRODUCT_SLUG,
  DEMO_STOCK_BY_CODE,
  DEMO_VARIANT_SKU,
  PUSAT_CODE,
  demoBranches,
  demoCatalog,
  demoInventoryRows,
  pusatBranch,
  type SeedBranch,
} from '../db/seedData.js';
import {
  BRANCH_CODE_PATTERN,
  MAX_SERVICE_RADIUS_KM,
  assertOndemandUsable,
  normalizeBranchCode,
  validateCoordinates,
  validateServiceRadius,
} from '../services/branch/branchValidation.js';
import {
  haversineDistanceKm,
  resolveDeliveryModes,
} from '../services/shipping/deliveryModeService.js';
import { unifiedConfig } from '../config/unifiedConfig.js';

function coordinatesOf(branch: SeedBranch) {
  return {
    latitude: Number(branch.latitude),
    longitude: Number(branch.longitude),
  };
}

describe('seed cabang pusat', () => {
  it('follows the brand configuration for name, city, and address', () => {
    const pusat = pusatBranch();

    assert.strictEqual(pusat.code, PUSAT_CODE);
    assert.strictEqual(pusat.name, unifiedConfig.storeOrigin.name);
    assert.strictEqual(pusat.city, unifiedConfig.storeOrigin.city);
    assert.strictEqual(pusat.province, unifiedConfig.storeOrigin.province);
    assert.strictEqual(pusat.addressLine, unifiedConfig.storeOrigin.address);
  });

  it('is the default active pusat with a usable ondemand pin', () => {
    const pusat = pusatBranch();

    assert.strictEqual(pusat.type, 'pusat');
    assert.strictEqual(pusat.isDefault, true);
    assert.strictEqual(pusat.isActive, true);
    assert.strictEqual(pusat.ondemandEnabled, true);
    assert.doesNotThrow(() =>
      assertOndemandUsable({
        ondemandEnabled: pusat.ondemandEnabled,
        ...validateCoordinates(pusat.latitude, pusat.longitude),
      })
    );
  });

  it('passes the same branch code rules the admin API enforces', () => {
    const pusat = pusatBranch();
    assert.match(pusat.code, BRANCH_CODE_PATTERN);
    assert.strictEqual(normalizeBranchCode(pusat.code), PUSAT_CODE);
  });
});

describe('seed cabang contoh', () => {
  it('ships at least two demo branches with unique codes', () => {
    const branches = demoBranches();
    assert.ok(branches.length >= 2, 'minimal dua cabang contoh');

    const codes: string[] = branches.map((branch) => branch.code);
    assert.strictEqual(new Set(codes).size, codes.length, 'kode cabang harus unik');
    assert.ok(!codes.includes(PUSAT_CODE), 'pusat punya baris sendiri');
    assert.deepStrictEqual(codes, [...DEMO_BRANCH_CODES]);
  });

  it('uses valid, active cabang rows that are not the default', () => {
    for (const branch of demoBranches()) {
      assert.strictEqual(branch.type, 'cabang');
      assert.strictEqual(branch.isActive, true);
      assert.strictEqual(branch.isDefault, false);
      assert.match(branch.code, BRANCH_CODE_PATTERN);
      assert.strictEqual(normalizeBranchCode(branch.code), branch.code);
    }
  });

  it('carries complete in-range coordinates so ondemand is legal', () => {
    for (const branch of demoBranches()) {
      const { latitude, longitude } = coordinatesOf(branch);

      assert.ok(Number.isFinite(latitude), `${branch.code} latitude harus angka`);
      assert.ok(Number.isFinite(longitude), `${branch.code} longitude harus angka`);
      assert.ok(latitude >= -90 && latitude <= 90);
      assert.ok(longitude >= -180 && longitude <= 180);

      assert.doesNotThrow(() => validateCoordinates(branch.latitude, branch.longitude));
      assert.doesNotThrow(() =>
        assertOndemandUsable({ ondemandEnabled: branch.ondemandEnabled, latitude, longitude })
      );
    }
  });

  it('sets a positive integer service radius inside the allowed maximum', () => {
    for (const branch of demoBranches()) {
      const radius = validateServiceRadius(branch.serviceRadiusKm);
      assert.ok(radius !== null);
      assert.ok(radius > 0 && radius <= MAX_SERVICE_RADIUS_KM);
      assert.ok(branch.ondemandEnabled);
    }
  });

  it('puts Bandung and Surabaya outside each other radius', () => {
    const [bandung, surabaya] = demoBranches();
    const distance = haversineDistanceKm(coordinatesOf(bandung), coordinatesOf(surabaya));

    assert.ok(distance > bandung.serviceRadiusKm);
    const result = resolveDeliveryModes({
      distanceKm: distance,
      ondemandEnabled: bandung.ondemandEnabled,
      serviceRadiusKm: bandung.serviceRadiusKm,
      hasDestinationCoords: true,
    });
    assert.deepStrictEqual(result.modes, ['aggregator']);
    assert.strictEqual(result.reason, 'outside_radius');
  });

  it('offers ondemand to a customer standing at the branch', () => {
    for (const branch of demoBranches()) {
      const result = resolveDeliveryModes({
        distanceKm: 0,
        ondemandEnabled: branch.ondemandEnabled,
        serviceRadiusKm: branch.serviceRadiusKm,
        hasDestinationCoords: true,
      });
      assert.deepStrictEqual(result.modes, ['ondemand', 'aggregator']);
      assert.strictEqual(result.reason, 'within_radius');
    }
  });
});

describe('seed katalog demo', () => {
  it('keeps a fixed slug and SKU so rerunning the seed updates instead of duplicating', () => {
    const catalog = demoCatalog();
    assert.strictEqual(catalog.product.slug, DEMO_PRODUCT_SLUG);
    assert.strictEqual(catalog.product.sku, DEMO_PRODUCT_SKU);
    assert.strictEqual(catalog.variant.sku, DEMO_VARIANT_SKU);
  });

  it('publishes the product with a variant price that matches the base price', () => {
    const { product, variant } = demoCatalog();

    assert.strictEqual(product.status, 'published');
    assert.strictEqual(variant.price, product.basePrice);
    assert.strictEqual(Number(variant.price), 149000);
    assert.strictEqual(variant.lowStockThreshold, DEMO_LOW_STOCK_THRESHOLD);
    assert.strictEqual(variant.reservedStock, 0);
  });

  it('spreads the aggregate stock across the seeded branches exactly', () => {
    const { product, variant } = demoCatalog();
    const total = Object.values(DEMO_STOCK_BY_CODE).reduce((sum, value) => sum + value, 0);

    assert.strictEqual(total, 70);
    assert.strictEqual(product.stock, total);
    assert.strictEqual(variant.stock, total);
  });
});

describe('seed rencana stok', () => {
  it('has one inventory row per branch, pusat first', () => {
    const rows = demoInventoryRows();
    const branches = [pusatBranch(), ...demoBranches()];

    assert.strictEqual(rows.length, branches.length);
    assert.deepStrictEqual(
      rows.map((row) => row.branchCode),
      branches.map((branch) => branch.code)
    );
  });

  it('matches the stock plan and always references the demo variant', () => {
    for (const row of demoInventoryRows()) {
      assert.strictEqual(row.variantSku, DEMO_VARIANT_SKU);
      assert.strictEqual(row.stock, DEMO_STOCK_BY_CODE[row.branchCode]);
      assert.ok(row.stock > 0, 'setiap cabang contoh harus punya stok');
      assert.strictEqual(row.lowStockThreshold, DEMO_LOW_STOCK_THRESHOLD);
    }
  });

  it('never plans stock for a branch that is not seeded', () => {
    const known = new Set([PUSAT_CODE, ...DEMO_BRANCH_CODES]);
    for (const code of Object.keys(DEMO_STOCK_BY_CODE)) {
      assert.ok(known.has(code), `stok untuk cabang tak dikenal: ${code}`);
    }
  });

  it('gives pusat more stock than any single branch so analytics has a baseline', () => {
    const branchStocks = DEMO_BRANCH_CODES.map((code) => DEMO_STOCK_BY_CODE[code]);
    assert.ok(DEMO_STOCK_BY_CODE[PUSAT_CODE] > Math.max(...branchStocks));
  });
});
