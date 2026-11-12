import argon2 from 'argon2';
import { db, closeDatabase } from './index.js';
import { users, settings, storeLocations } from './schema.js';
import { unifiedConfig } from '../config/unifiedConfig.js';

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

  const [location] = await db
    .insert(storeLocations)
    .values({
      name: unifiedConfig.storeOrigin.name,
      phone: unifiedConfig.storeOrigin.phone,
      addressLine: unifiedConfig.storeOrigin.address,
      city: unifiedConfig.storeOrigin.city,
      province: unifiedConfig.storeOrigin.province,
      postalCode: unifiedConfig.storeOrigin.postalCode,
      isDefault: true,
      isActive: true,
    })
    .onConflictDoNothing()
    .returning({ id: storeLocations.id, name: storeLocations.name });

  console.log(
    location
      ? `[seed] default store location: ${location.name}`
      : '[seed] store location exists, skipped'
  );
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
