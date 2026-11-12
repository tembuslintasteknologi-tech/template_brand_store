import { z } from 'zod';
import { db } from '../../db/index.js';
import { branchInventory, storeLocations } from '../../db/schema.js';
import { and, asc, eq, ne, sql } from 'drizzle-orm';
import { recordAdminAction } from '../admin/auditLog.js';
import { ConfigError } from './settings.js';
import {
  assertBranchDeactivatable,
  assertBranchDeletable,
  assertOndemandUsable,
  generateBranchCode,
  normalizeBranchCode,
  validateCoordinates,
  validateServiceRadius,
} from '../branch/branchValidation.js';

/**
 * Store location master data, extended for the multi-branch model (BR-005).
 *
 * The old fields stay exactly as they were so settings.ts and the existing
 * /api/v1/admin/store-locations handlers keep working. Branch specific fields and rules are
 * additive: coordinates, ondemand radius, branch type, and the guards that stop a branch from
 * being hidden or deleted while it still holds stock.
 */
export const storeLocationSchema = z.object({
  code: z.string().min(2).max(20).optional(),
  name: z.string().min(1).max(150),
  type: z.enum(['pusat', 'cabang']).optional(),
  phone: z.string().max(50).optional(),
  addressLine: z.string().min(3).max(500),
  city: z.string().min(1).max(100),
  province: z.string().min(1).max(100),
  postalCode: z.string().min(1).max(20),
  latitude: z.union([z.number(), z.string()]).nullable().optional(),
  longitude: z.union([z.number(), z.string()]).nullable().optional(),
  ondemandEnabled: z.boolean().optional(),
  serviceRadiusKm: z.union([z.number(), z.string()]).nullable().optional(),
  managerName: z.string().max(150).optional(),
  isOnline: z.boolean().optional(),
  isActive: z.boolean().optional(),
  operatingHours: z.record(z.any()).optional(),
});

export const storeLocationCoordinatesSchema = z.object({
  latitude: z.union([z.number(), z.string()]),
  longitude: z.union([z.number(), z.string()]),
});

function decimalOf(value: number | null): string | null {
  return value === null ? null : value.toFixed(7);
}

async function codeTaken(code: string, exceptId?: string): Promise<boolean> {
  const where = exceptId
    ? and(eq(storeLocations.code, code), ne(storeLocations.id, exceptId as any))
    : eq(storeLocations.code, code);
  const [row] = await db.select({ id: storeLocations.id }).from(storeLocations).where(where).limit(1);
  return Boolean(row);
}

/** Sum of stock that can still be sold across every variant in the branch. */
export async function branchAvailableStock(branchId: string): Promise<number> {
  const [row] = await db
    .select({
      total: sql<number>`coalesce(sum(greatest(${branchInventory.stock} - ${branchInventory.reservedStock}, 0)), 0)`,
    })
    .from(branchInventory)
    .where(eq(branchInventory.branchId, branchId as any));
  return Number(row?.total ?? 0);
}

export async function listStoreLocations() {
  return db
    .select()
    .from(storeLocations)
    .orderBy(asc(storeLocations.type), asc(storeLocations.name));
}

export async function getStoreLocation(id: string) {
  const [row] = await db.select().from(storeLocations).where(eq(storeLocations.id, id as any)).limit(1);
  return row ?? null;
}

async function requireStoreLocation(id: string) {
  const row = await getStoreLocation(id);
  if (!row) {
    throw new ConfigError(`Lokasi toko tidak ditemukan: ${id}`, 404);
  }
  return row;
}

export async function createStoreLocation(actorId: string, input: unknown) {
  const parsed = storeLocationSchema.safeParse(input);
  if (!parsed.success) {
    throw new ConfigError(`Lokasi toko tidak valid: ${parsed.error.issues.map((issue) => issue.message).join('; ')}`);
  }

  const data = parsed.data;
  const coordinates = validateCoordinates(data.latitude, data.longitude);
  const code = data.code ? normalizeBranchCode(data.code) : generateBranchCode();
  if (await codeTaken(code)) {
    throw new ConfigError(`Kode cabang sudah dipakai: ${code}`, 409);
  }

  // A branch created from a typed address has no map pin yet, so ondemand stays off until the
  // admin presses "gunakan lokasi saat ini". Asking for ondemand explicitly still requires it.
  const ondemandEnabled = data.ondemandEnabled ?? coordinates.latitude !== null;
  assertOndemandUsable({ ondemandEnabled, ...coordinates });

  const existing = await db.select({ id: storeLocations.id }).from(storeLocations).limit(1);
  const shouldBeDefault = existing.length === 0;

  const [row] = await db
    .insert(storeLocations)
    .values({
      code,
      name: data.name,
      type: data.type ?? 'cabang',
      phone: data.phone,
      addressLine: data.addressLine,
      city: data.city,
      province: data.province,
      postalCode: data.postalCode,
      latitude: decimalOf(coordinates.latitude),
      longitude: decimalOf(coordinates.longitude),
      ondemandEnabled,
      serviceRadiusKm: validateServiceRadius(data.serviceRadiusKm),
      operatingHours: data.operatingHours ?? {},
      managerName: data.managerName,
      isOnline: data.isOnline ?? true,
      isDefault: shouldBeDefault,
      isActive: data.isActive ?? true,
    })
    .returning();

  await recordAdminAction({
    actorId,
    action: 'branch.create',
    targetType: 'store_location',
    targetId: row.id,
    metadata: { code: row.code, name: row.name, type: row.type, isDefault: row.isDefault },
  });

  return row;
}

export async function updateStoreLocation(actorId: string, id: string, input: unknown) {
  const parsed = storeLocationSchema.partial().safeParse(input);
  if (!parsed.success) {
    throw new ConfigError(`Lokasi toko tidak valid: ${parsed.error.issues.map((issue) => issue.message).join('; ')}`);
  }

  const existing = await requireStoreLocation(id);
  const data = parsed.data;

  const coordinates = validateCoordinates(
    data.latitude !== undefined ? data.latitude : existing.latitude,
    data.longitude !== undefined ? data.longitude : existing.longitude
  );
  const ondemandEnabled = data.ondemandEnabled ?? existing.ondemandEnabled;
  assertOndemandUsable({ ondemandEnabled, ...coordinates });

  let code = existing.code;
  if (data.code !== undefined) {
    code = normalizeBranchCode(data.code);
    if (await codeTaken(code, id)) {
      throw new ConfigError(`Kode cabang sudah dipakai: ${code}`, 409);
    }
  }

  if (data.isActive === false && existing.isActive !== false) {
    assertBranchDeactivatable(await branchAvailableStock(id));
  }

  const [row] = await db
    .update(storeLocations)
    .set({
      code,
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.type !== undefined ? { type: data.type } : {}),
      ...(data.phone !== undefined ? { phone: data.phone } : {}),
      ...(data.addressLine !== undefined ? { addressLine: data.addressLine } : {}),
      ...(data.city !== undefined ? { city: data.city } : {}),
      ...(data.province !== undefined ? { province: data.province } : {}),
      ...(data.postalCode !== undefined ? { postalCode: data.postalCode } : {}),
      latitude: decimalOf(coordinates.latitude),
      longitude: decimalOf(coordinates.longitude),
      ondemandEnabled,
      ...(data.serviceRadiusKm !== undefined
        ? { serviceRadiusKm: validateServiceRadius(data.serviceRadiusKm) }
        : {}),
      ...(data.managerName !== undefined ? { managerName: data.managerName } : {}),
      ...(data.isOnline !== undefined ? { isOnline: data.isOnline } : {}),
      ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
      ...(data.operatingHours !== undefined ? { operatingHours: data.operatingHours } : {}),
    })
    .where(eq(storeLocations.id, id as any))
    .returning();

  await recordAdminAction({
    actorId,
    action: 'branch.update',
    targetType: 'store_location',
    targetId: row.id,
    metadata: { code: row.code, changed: Object.keys(data) },
  });

  return row;
}

/** Coordinates only, used by the "gunakan lokasi saat ini" button in the admin UI. */
export async function setStoreLocationCoordinates(actorId: string, id: string, input: unknown) {
  const parsed = storeLocationCoordinatesSchema.safeParse(input);
  if (!parsed.success) {
    throw new ConfigError(
      `Koordinat tidak valid: ${parsed.error.issues.map((issue) => issue.message).join('; ')}`
    );
  }

  const existing = await requireStoreLocation(id);
  const coordinates = validateCoordinates(parsed.data.latitude, parsed.data.longitude);
  assertOndemandUsable({ ondemandEnabled: existing.ondemandEnabled, ...coordinates });

  const [row] = await db
    .update(storeLocations)
    .set({
      latitude: decimalOf(coordinates.latitude),
      longitude: decimalOf(coordinates.longitude),
    })
    .where(eq(storeLocations.id, id as any))
    .returning();

  await recordAdminAction({
    actorId,
    action: 'branch.set_location',
    targetType: 'store_location',
    targetId: row.id,
    metadata: { latitude: row.latitude, longitude: row.longitude },
  });

  return row;
}

export async function deleteStoreLocation(actorId: string, id: string) {
  const existing = await requireStoreLocation(id);
  assertBranchDeletable(existing.isDefault);
  assertBranchDeactivatable(await branchAvailableStock(id));

  await db.delete(storeLocations).where(eq(storeLocations.id, id as any));

  await recordAdminAction({
    actorId,
    action: 'branch.delete',
    targetType: 'store_location',
    targetId: id,
    metadata: { code: existing.code, name: existing.name },
  });

  return { id, deleted: true };
}

export async function setDefaultStoreLocation(actorId: string, id: string) {
  const existing = await requireStoreLocation(id);

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
    metadata: { code: row.code, name: row.name, previous: existing.code },
  });

  return row;
}
