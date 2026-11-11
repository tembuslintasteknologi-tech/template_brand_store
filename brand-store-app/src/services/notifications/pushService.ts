import { z } from 'zod';
import { db } from '../../db/index.js';
import { userDevices } from '../../db/schema.js';
import { and, eq } from 'drizzle-orm';

export type PushPlatform = 'android' | 'ios' | 'web';
export type PushProvider = 'fcm' | 'apns';

export const PUSH_PLATFORMS: PushPlatform[] = ['android', 'ios', 'web'];

export const deviceRegistrationSchema = z.object({
  platform: z.enum(['android', 'ios', 'web']),
  token: z.string().min(10).max(4096),
  deviceName: z.string().max(150).optional(),
  appVersion: z.string().max(50).optional(),
});

export interface PushDevice {
  platform: string;
  token: string;
  isActive?: boolean | null;
}

export interface PushResponse {
  sent: boolean;
  reason?: string;
  delivered?: number;
  failed?: number;
  provider?: PushProvider | null;
  results?: Array<{ token: string; ok: boolean; reason?: string }>;
}

export function resolvePushProvider(platform: string): PushProvider {
  return platform === 'ios' ? 'apns' : 'fcm';
}

export function selectDeliverableDevices<T extends PushDevice>(devices: T[]): T[] {
  return devices.filter((device) => {
    if (device.isActive === false) return false;
    return typeof device.token === 'string' && device.token.trim().length >= 10;
  });
}

export function buildFcmMessage(
  token: string,
  title: string,
  body: string,
  data: Record<string, unknown> = {}
) {
  return {
    message: {
      token,
      notification: { title, body },
      data: Object.fromEntries(Object.entries(data).map(([key, value]) => [key, String(value)])),
      android: { priority: 'HIGH' as const },
    },
  };
}

export function buildApnsPayload(
  title: string,
  body: string,
  data: Record<string, unknown> = {}
): { aps: { alert: { title: string; body: string }; sound: string } } & Record<string, unknown> {
  return {
    aps: { alert: { title, body }, sound: 'default' },
    ...data,
  };
}

export interface PushConfig {
  fcmEndpoint: string;
  fcmServerKey: string | null;
  apnsEndpoint: string;
  apnsAuthToken: string | null;
  apnsTopic: string | null;
}

export function readPushConfig(env: NodeJS.ProcessEnv = process.env): PushConfig {
  return {
    fcmEndpoint: env.FCM_ENDPOINT ?? 'https://fcm.googleapis.com/v1/projects/brand-store/messages:send',
    fcmServerKey: env.FCM_SERVER_KEY ?? env.FCM_ACCESS_TOKEN ?? null,
    apnsEndpoint: env.APNS_ENDPOINT ?? 'https://api.push.apple.com/3/device',
    apnsAuthToken: env.APNS_AUTH_TOKEN ?? null,
    apnsTopic: env.APNS_TOPIC ?? null,
  };
}

export function isProviderConfigured(provider: PushProvider, config: PushConfig): boolean {
  return provider === 'apns' ? Boolean(config.apnsAuthToken) : Boolean(config.fcmServerKey);
}

async function deliverToDevice(
  device: PushDevice,
  title: string,
  body: string,
  data: Record<string, unknown>,
  config: PushConfig
): Promise<{ token: string; ok: boolean; reason?: string }> {
  const provider = resolvePushProvider(device.platform);

  if (!isProviderConfigured(provider, config)) {
    return { token: device.token, ok: false, reason: `push_not_configured:${provider}` };
  }

  try {
    if (provider === 'fcm') {
      const res = await fetch(config.fcmEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.fcmServerKey}`,
        },
        body: JSON.stringify(buildFcmMessage(device.token, title, body, data)),
      });
      return { token: device.token, ok: res.ok, reason: res.ok ? undefined : `fcm_http_${res.status}` };
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      authorization: `bearer ${config.apnsAuthToken}`,
    };
    if (config.apnsTopic) headers['apns-topic'] = config.apnsTopic;

    const res = await fetch(`${config.apnsEndpoint}/${device.token}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(buildApnsPayload(title, body, data)),
    });
    return { token: device.token, ok: res.ok, reason: res.ok ? undefined : `apns_http_${res.status}` };
  } catch (err: any) {
    return { token: device.token, ok: false, reason: err?.message ?? 'push_send_failed' };
  }
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function sendPush(
  userId: string,
  title: string,
  body: string,
  data: Record<string, unknown> = {}
): Promise<PushResponse> {
  if (!UUID_PATTERN.test(userId)) {
    return { sent: false, reason: 'Device token not found' };
  }

  let devices: Array<{ platform: string; token: string; isActive: boolean }> = [];
  try {
    devices = await db
      .select({ platform: userDevices.platform, token: userDevices.token, isActive: userDevices.isActive })
      .from(userDevices)
      .where(and(eq(userDevices.userId, userId as any), eq(userDevices.isActive, true)));
  } catch {
    return { sent: false, reason: 'Device token not found' };
  }

  const targets = selectDeliverableDevices(devices);
  if (targets.length === 0) {
    return { sent: false, reason: 'Device token not found' };
  }

  const config = readPushConfig();
  const results = await Promise.all(
    targets.map((device) => deliverToDevice(device, title, body, data, config))
  );
  const delivered = results.filter((row) => row.ok).length;

  return {
    sent: delivered > 0,
    delivered,
    failed: results.length - delivered,
    provider: resolvePushProvider(targets[0].platform),
    reason: delivered > 0 ? undefined : results[0]?.reason ?? 'push_not_delivered',
    results,
  };
}

export async function registerDevice(userId: string, input: unknown) {
  const parsed = deviceRegistrationSchema.parse(input);
  const now = new Date();

  const [row] = await db
    .insert(userDevices)
    .values({
      userId: userId as any,
      platform: parsed.platform,
      token: parsed.token,
      deviceName: parsed.deviceName ?? null,
      appVersion: parsed.appVersion ?? null,
      isActive: true,
      lastUsedAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: userDevices.token,
      set: {
        userId: userId as any,
        platform: parsed.platform,
        deviceName: parsed.deviceName ?? null,
        appVersion: parsed.appVersion ?? null,
        isActive: true,
        lastUsedAt: now,
        updatedAt: now,
      },
    })
    .returning();

  return row;
}

export async function unregisterDevice(userId: string, token: string) {
  const [row] = await db
    .update(userDevices)
    .set({ isActive: false, updatedAt: new Date() })
    .where(and(eq(userDevices.token, token), eq(userDevices.userId, userId as any)))
    .returning();
  return row ?? null;
}

export async function listDevices(userId: string) {
  return db
    .select({
      id: userDevices.id,
      platform: userDevices.platform,
      deviceName: userDevices.deviceName,
      appVersion: userDevices.appVersion,
      isActive: userDevices.isActive,
      lastUsedAt: userDevices.lastUsedAt,
    })
    .from(userDevices)
    .where(eq(userDevices.userId, userId as any));
}
