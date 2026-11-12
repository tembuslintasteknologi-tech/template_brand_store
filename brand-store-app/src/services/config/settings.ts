import { z } from 'zod';
import { db } from '../../db/index.js';
import { settings, storeLocations } from '../../db/schema.js';
import { asc, eq } from 'drizzle-orm';
import { recordAdminAction } from '../admin/auditLog.js';
import { unifiedConfig } from '../../config/unifiedConfig.js';

export class ConfigError extends Error {
  readonly status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = 'ConfigError';
    this.status = status;
  }
}

export const brandProfileSchema = z.object({
  name: z.string().min(1).max(120),
  logoUrl: z.string().url().or(z.literal('')).optional(),
  faviconUrl: z.string().url().or(z.literal('')).optional(),
  contact: z
    .object({
      email: z.string().email().or(z.literal('')).optional(),
      phone: z.string().max(40).optional(),
      whatsapp: z.string().max(40).optional(),
    })
    .optional(),
  social: z
    .object({
      instagram: z.string().max(120).optional(),
      facebook: z.string().max(120).optional(),
      tiktok: z.string().max(120).optional(),
      x: z.string().max(120).optional(),
    })
    .optional(),
});

export type BrandProfile = z.infer<typeof brandProfileSchema>;

export const featureFlagsSchema = z.record(z.boolean());

export const shippingDefaultSchema = z.object({
  provider: z.string().min(1).max(50),
  requireDefaultLocation: z.boolean(),
});

export const settingValidators: Record<string, z.ZodTypeAny> = {
  'brand.name': z.object({ text: z.string().min(1).max(120) }),
  'brand.currency': z.object({ code: z.string().length(3) }),
  'brand.locale': z.object({ code: z.string().min(2).max(10) }),
  'brand.profile': brandProfileSchema,
  'tax.percent': z.object({ percent: z.number().min(0).max(100) }),
  'payment.expiry_minutes': z.object({ minutes: z.number().int().min(1).max(10080) }),
  'order.number_format': z.object({ pattern: z.string().min(1).max(120) }),
  'shipping.default': shippingDefaultSchema,
  'shipping.showAggregatorWithinRadius': z.object({ enabled: z.boolean() }),
  feature_flags: featureFlagsSchema,
  'maintenance.mode': z.object({
    enabled: z.boolean(),
    message: z.string().max(300).optional(),
  }),
};

export interface MaintenanceMode {
  enabled: boolean;
  message?: string;
}

export async function getMaintenanceMode(): Promise<MaintenanceMode> {
  const value = await getSettingValue<MaintenanceMode>('maintenance.mode', { enabled: false });
  return { enabled: value?.enabled === true, message: value?.message };
}

export const MAINTENANCE_ALLOWED_PREFIXES = [
  '/health',
  '/ready',
  '/webhooks',
  '/api/v1/admin',
  '/api/v1/auth',
];

export function shouldBlockForMaintenance(enabled: boolean, path: string): boolean {
  if (!enabled) return false;
  return !MAINTENANCE_ALLOWED_PREFIXES.some((prefix) => path === prefix || path.startsWith(prefix + '/') || path.startsWith(prefix));
}

const KEY_PATTERN = /^[a-zA-Z][a-zA-Z0-9_.-]{1,149}$/;

export function validateSetting(key: string, value: unknown): unknown {
  if (!KEY_PATTERN.test(key)) {
    throw new ConfigError(`Kunci setting tidak valid: ${key}`);
  }
  const validator = settingValidators[key];
  if (!validator) {
    if (value === null || typeof value !== 'object') {
      throw new ConfigError(`Nilai untuk kunci ${key} harus berupa objek JSON`);
    }
    return value;
  }
  const parsed = validator.safeParse(value);
  if (!parsed.success) {
    throw new ConfigError(`Nilai tidak valid untuk ${key}: ${parsed.error.issues.map((issue) => issue.message).join('; ')}`);
  }
  return parsed.data;
}

export async function listSettings() {
  return db.select().from(settings).orderBy(asc(settings.key));
}

export async function getSettingRow(key: string) {
  const [row] = await db.select().from(settings).where(eq(settings.key, key)).limit(1);
  if (!row) {
    throw new ConfigError(`Setting tidak ditemukan: ${key}`, 404);
  }
  return row;
}

export async function getSettingValue<T>(key: string, fallback: T): Promise<T> {
  try {
    const [row] = await db.select().from(settings).where(eq(settings.key, key)).limit(1);
    if (!row) return fallback;
    return (row.value as T) ?? fallback;
  } catch {
    return fallback;
  }
}

export async function putSetting(actorId: string, key: string, value: unknown) {
  const validated = validateSetting(key, value);
  const [row] = await db
    .insert(settings)
    .values({ key, value: validated as any })
    .onConflictDoUpdate({ target: settings.key, set: { value: validated as any, updatedAt: new Date() } })
    .returning();

  await recordAdminAction({
    actorId,
    action: 'setting.update',
    targetType: 'setting',
    targetId: key,
    metadata: { key },
  });

  return row;
}

export async function getBrandProfile(): Promise<BrandProfile> {
  const fallback: BrandProfile = { name: unifiedConfig.brand.name };
  const stored = await getSettingValue<any>('brand.profile', null);
  if (stored) return brandProfileSchema.parse({ ...fallback, ...stored });
  const name = await getSettingValue<any>('brand.name', { text: unifiedConfig.brand.name });
  return { ...fallback, name: name?.text ?? fallback.name };
}

export async function putBrandProfile(actorId: string, value: unknown) {
  const parsed = brandProfileSchema.safeParse(value);
  if (!parsed.success) {
    throw new ConfigError(`Profil brand tidak valid: ${parsed.error.issues.map((issue) => issue.message).join('; ')}`);
  }
  return putSetting(actorId, 'brand.profile', parsed.data);
}

export const DEFAULT_FEATURE_FLAGS: Record<string, boolean> = {
  promos: true,
  reviews: true,
  wishlist: true,
  wallet: true,
  loyalty: true,
  flash_sale: true,
};

export async function getFeatureFlags(): Promise<Record<string, boolean>> {
  const stored = await getSettingValue<Record<string, boolean>>('feature_flags', DEFAULT_FEATURE_FLAGS);
  return featureFlagsSchema.parse({ ...DEFAULT_FEATURE_FLAGS, ...(stored ?? {}) });
}

export async function putFeatureFlags(actorId: string, value: unknown) {
  const parsed = featureFlagsSchema.safeParse(value);
  if (!parsed.success) {
    throw new ConfigError('feature_flags harus berupa objek berisi boolean');
  }
  return putSetting(actorId, 'feature_flags', parsed.data);
}

export async function isFeatureEnabled(flag: string): Promise<boolean> {
  const flags = await getFeatureFlags();
  return flags[flag] ?? (DEFAULT_FEATURE_FLAGS[flag] === true);
}

export async function getTaxPercent(): Promise<number> {
  const value = await getSettingValue<any>('tax.percent', { percent: unifiedConfig.brand.taxPercent });
  const percent = Number(value?.percent);
  return Number.isFinite(percent) ? percent : unifiedConfig.brand.taxPercent;
}

export async function getPaymentExpiryMinutes(): Promise<number> {
  const value = await getSettingValue<any>('payment.expiry_minutes', {
    minutes: unifiedConfig.brand.paymentExpiryMinutes,
  });
  const minutes = Number(value?.minutes);
  return Number.isFinite(minutes) && minutes > 0 ? minutes : unifiedConfig.brand.paymentExpiryMinutes;
}

export async function getShippingDefault() {
  return getSettingValue('shipping.default', { provider: 'tembus', requireDefaultLocation: true });
}

/**
 * OD-B is still open. Default true means inside the ondemand radius the customer also sees
 * 3PL as a price comparison. Flip the setting to false to hide aggregator inside the radius.
 */
export async function getShowAggregatorWithinRadius(): Promise<boolean> {
  const value = await getSettingValue<{ enabled?: boolean }>('shipping.showAggregatorWithinRadius', {
    enabled: true,
  });
  return value?.enabled !== false;
}

export async function getDefaultStoreLocation() {
  try {
    const [row] = await db
      .select()
      .from(storeLocations)
      .where(eq(storeLocations.isDefault, true))
      .limit(1);
    return row ?? null;
  } catch {
    return null;
  }
}

export async function getSiteConfig() {
  const [profile, flags] = await Promise.all([getBrandProfile(), getFeatureFlags()]);
  return {
    brand: profile,
    currency: await getSettingValue<any>('brand.currency', { code: unifiedConfig.brand.currency }),
    locale: await getSettingValue<any>('brand.locale', { code: unifiedConfig.brand.locale }),
    taxPercent: await getTaxPercent(),
    paymentExpiryMinutes: await getPaymentExpiryMinutes(),
    shippingDefault: await getShippingDefault(),
    features: Object.fromEntries(Object.entries(flags).filter(([, enabled]) => enabled === true)),
  };
}

export function pickDefaultLocation<T extends { isDefault?: boolean | null; isActive?: boolean | null }>(
  rows: T[]
): T | null {
  return rows.find((row) => row.isDefault === true && row.isActive !== false) ?? null;
}
