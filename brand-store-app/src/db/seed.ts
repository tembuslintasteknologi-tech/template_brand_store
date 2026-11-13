import argon2 from 'argon2';
import { db, closeDatabase } from './index.js';
import {
  branchInventory,
  productVariants,
  products,
  settings,
  storeLocations,
  users,
} from './schema.js';
import { unifiedConfig } from '../config/unifiedConfig.js';
import {
  demoBranches,
  demoCatalog,
  demoInventoryRows,
  pusatBranch,
  type SeedBranch,
  type SeedInventoryRow,
} from './seedData.js';
import { and, eq, isNull, sql } from 'drizzle-orm';

const ARGON2_OPTIONS = { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 };

export function defaultSettings() {
  return [
    { key: 'brand.name', value: { text: unifiedConfig.brand.name } },
    { key: 'brand.currency', value: { code: unifiedConfig.brand.currency } },
    { key: 'brand.locale', value: { code: unifiedConfig.brand.locale } },
    { key: 'tax.percent', value: { percent: unifiedConfig.brand.taxPercent } },
    { key: 'payment.expiry_minutes', value: { minutes: unifiedConfig.brand.paymentExpiryMinutes } },
    {
      key: 'order.number_format',
      value: { pattern: 'INV/{YYYY}/{MM}/{NNNNNN}' },
    },
    {
      key: 'shipping.default',
      value: { provider: 'tembus', requireDefaultLocation: true },
    },
    {
      // OD-B is still open: default shows 3PL as a price comparison inside the ondemand radius.
      key: 'shipping.showAggregatorWithinRadius',
      value: { enabled: true },
    },
    {
      key: 'feature_flags',
      value: { reviews: true, wishlist: true, flash_sale: false, wallet: false, loyalty: false, promos: true },
    },
  ];
}

function locationPayload(branch: SeedBranch) {
  return {
    code: branch.code,
    name: branch.name,
    type: branch.type,
    phone: branch.phone,
    addressLine: branch.addressLine,
    city: branch.city,
    province: branch.province,
    postalCode: branch.postalCode,
    latitude: branch.latitude,
    longitude: branch.longitude,
    ondemandEnabled: branch.ondemandEnabled,
    serviceRadiusKm: branch.serviceRadiusKm,
    managerName: branch.managerName,
    isDefault: branch.isDefault,
    isActive: branch.isActive,
  };
}

/**
 * Upserts by `code`. A row created by the pre-BR-005 seed has no code, so the default row is
 * claimed instead of duplicated: without that, every rerun would add another "Main Warehouse".
 */
async function ensureLocation(branch: SeedBranch): Promise<string> {
  const payload = locationPayload(branch);

  const [byCode] = await db
    .select({ id: storeLocations.id })
    .from(storeLocations)
    .where(eq(storeLocations.code, branch.code))
    .limit(1);

  if (byCode) {
    await db.update(storeLocations).set(payload).where(eq(storeLocations.id, byCode.id));
    return byCode.id;
  }

  if (branch.isDefault) {
    const [legacyDefault] = await db
      .select({ id: storeLocations.id })
      .from(storeLocations)
      .where(and(eq(storeLocations.isDefault, true), isNull(storeLocations.code)))
      .limit(1);
    if (legacyDefault) {
      await db.update(storeLocations).set(payload).where(eq(storeLocations.id, legacyDefault.id));
      return legacyDefault.id;
    }
  }

  const [created] = await db
    .insert(storeLocations)
    .values(payload)
    .returning({ id: storeLocations.id });
  return created.id;
}

async function ensureCatalog(): Promise<{ productId: string; variantId: string }> {
  const catalog = demoCatalog();

  const [existingProduct] = await db
    .select({ id: products.id })
    .from(products)
    .where(eq(products.slug, catalog.product.slug))
    .limit(1);

  let productId: string;
  if (existingProduct) {
    await db
      .update(products)
      .set({ ...catalog.product, updatedAt: new Date() })
      .where(eq(products.id, existingProduct.id));
    productId = existingProduct.id;
  } else {
    const [created] = await db
      .insert(products)
      .values(catalog.product)
      .returning({ id: products.id });
    productId = created.id;
  }

  const [existingVariant] = await db
    .select({ id: productVariants.id })
    .from(productVariants)
    .where(eq(productVariants.sku, catalog.variant.sku))
    .limit(1);

  let variantId: string;
  if (existingVariant) {
    await db
      .update(productVariants)
      .set({ ...catalog.variant, productId, updatedAt: new Date() })
      .where(eq(productVariants.id, existingVariant.id));
    variantId = existingVariant.id;
  } else {
    const [created] = await db
      .insert(productVariants)
      .values({ ...catalog.variant, productId })
      .returning({ id: productVariants.id });
    variantId = created.id;
  }

  return { productId, variantId };
}

/**
 * Stock rows are inserted with `onConflictDoNothing` on purpose. Rerunning the seed must not reset
 * local stock changes back to the demo plan; the plan is only the starting point.
 */
async function ensureInventory(
  branchIdByCode: Map<string, string>,
  variantId: string,
  rows: SeedInventoryRow[]
): Promise<void> {
  for (const row of rows) {
    const branchId = branchIdByCode.get(row.branchCode);
    if (!branchId) {
      throw new Error(`[seed] cabang ${row.branchCode} belum tersedia untuk baris stok`);
    }
    await db
      .insert(branchInventory)
      .values({
        branchId,
        variantId,
        stock: row.stock,
        reservedStock: 0,
        lowStockThreshold: row.lowStockThreshold,
      })
      .onConflictDoNothing();
  }
}

/** branch_inventory is the source of truth, so both aggregates are recalculated from it. */
async function syncAggregates(productId: string, variantId: string): Promise<number> {
  const [totals] = await db
    .select({ total: sql<number>`coalesce(sum(${branchInventory.stock}), 0)` })
    .from(branchInventory)
    .where(eq(branchInventory.variantId, variantId));

  const total = Number(totals?.total ?? 0);
  await db
    .update(productVariants)
    .set({ stock: total, updatedAt: new Date() })
    .where(eq(productVariants.id, variantId));
  await db
    .update(products)
    .set({ stock: total, updatedAt: new Date() })
    .where(eq(products.id, productId));

  return total;
}

async function seed() {
  console.log('[seed] starting');

  const passwordHash = await argon2.hash(unifiedConfig.admin.password, ARGON2_OPTIONS);
  const [admin] = await db
    .insert(users)
    .values({
      email: unifiedConfig.admin.email,
      passwordHash,
      fullName: 'Super Administrator',
      role: 'admin',
      emailVerified: true,
    })
    .onConflictDoNothing()
    .returning({ id: users.id, email: users.email });

  console.log(
    admin ? `[seed] admin created: ${admin.email}` : '[seed] admin already exists, skipped'
  );

  for (const setting of defaultSettings()) {
    await db.insert(settings).values(setting).onConflictDoNothing();
  }
  console.log(`[seed] settings ensured: ${defaultSettings().length}`);

  const branchIdByCode = new Map<string, string>();
  const branches = [pusatBranch(), ...demoBranches()];
  for (const branch of branches) {
    const id = await ensureLocation(branch);
    branchIdByCode.set(branch.code, id);
    console.log(`[seed] cabang ${branch.code}: ${branch.name}`);
  }

  const { productId, variantId } = await ensureCatalog();
  console.log(`[seed] katalog demo: ${demoCatalog().product.slug}`);

  await ensureInventory(branchIdByCode, variantId, demoInventoryRows());
  const total = await syncAggregates(productId, variantId);
  console.log(`[seed] stok demo tersebar ke ${branches.length} cabang, total ${total}`);

  console.log('[seed] done');
}

seed()
  .catch((err) => {
    console.error('[seed] failed:', err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDatabase();
  });
