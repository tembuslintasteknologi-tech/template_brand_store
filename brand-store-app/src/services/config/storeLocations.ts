import { z } from 'zod';
import { db } from '../../db/index.js';
import { storeLocations } from '../../db/schema.js';
import { asc, eq, ne } from 'drizzle-orm';
import { recordAdminAction } from '../admin/auditLog.js';
import { ConfigError } from './settings.js';

export const storeLocationSchema = z.object({
  name: z.string().min(1).max(150),
  phone: z.string().max(50).optional(),
  addressLine: z.string().min(3).max(500),
  city: z.string().min(1).max(100),
  province: z.string().min(1).max(100),
  postalCode: z.string().min(1).max(20),
  isActive: z.boolean().optional(),
});

export async function listStoreLocations() {
  return db.select().from(storeLocations).orderBy(asc(storeLocations.createdAt));
}

export async function createStoreLocation(actorId: string, input: unknown) {
  const parsed = storeLocationSchema.safeParse(input);
  if (!parsed.success) {
    throw new ConfigError(`Lokasi toko tidak valid: ${parsed.error.issues.map((issue) => issue.message).join('; ')}`);
  }

  const existing = await db.select().from(storeLocations);
  const shouldBeDefault = existing.length === 0;

  const [row] = await db
    .insert(storeLocations)
    .values({ ...parsed.data, isDefault: shouldBeDefault, isActive: parsed.data.isActive ?? true })
    .returning();

  await recordAdminAction({
    actorId,
    action: 'store_location.create',
    targetType: 'store_location',
    targetId: row.id,
    metadata: { name: row.name, isDefault: row.isDefault },
  });

  return row;
}

export async function updateStoreLocation(actorId: string, id: string, input: unknown) {
  const parsed = storeLocationSchema.partial().safeParse(input);
  if (!parsed.success) {
    throw new ConfigError(`Lokasi toko tidak valid: ${parsed.error.issues.map((issue) => issue.message).join('; ')}`);
  }

  const [existing] = await db.select().from(storeLocations).where(eq(storeLocations.id, id as any)).limit(1);
  if (!existing) {
    throw new ConfigError(`Lokasi toko tidak ditemukan: ${id}`, 404);
  }

  const [row] = await db
    .update(storeLocations)
    .set({ ...parsed.data })
    .where(eq(storeLocations.id, id as any))
    .returning();

  await recordAdminAction({
    actorId,
    action: 'store_location.update',
    targetType: 'store_location',
    targetId: row.id,
    metadata: { changed: Object.keys(parsed.data) },
  });

  return row;
}

export async function deleteStoreLocation(actorId: string, id: string) {
  const [existing] = await db.select().from(storeLocations).where(eq(storeLocations.id, id as any)).limit(1);
  if (!existing) {
    throw new ConfigError(`Lokasi toko tidak ditemukan: ${id}`, 404);
  }

  await db.delete(storeLocations).where(eq(storeLocations.id, id as any));

  await recordAdminAction({
    actorId,
    action: 'store_location.delete',
    targetType: 'store_location',
    targetId: id,
    metadata: { name: existing.name },
  });

  return { id, deleted: true };
}

export async function setDefaultStoreLocation(actorId: string, id: string) {
  const [existing] = await db.select().from(storeLocations).where(eq(storeLocations.id, id as any)).limit(1);
  if (!existing) {
    throw new ConfigError(`Lokasi toko tidak ditemukan: ${id}`, 404);
  }

  await db.update(storeLocations).set({ isDefault: false }).where(ne(storeLocations.id, id as any));
  const [row] = await db
    .update(storeLocations)
    .set({ isDefault: true, isActive: true })
    .where(eq(storeLocations.id, id as any))
    .returning();

  await recordAdminAction({
    actorId,
    action: 'store_location.set_default',
    targetType: 'store_location',
    targetId: row.id,
    metadata: { name: row.name },
  });

  return row;
}
