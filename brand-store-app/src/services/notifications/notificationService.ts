import { db } from '../../db/index.js';
import { notificationPreferences, notificationTemplates, notifications, users } from '../../db/schema.js';
import { and, count, desc, eq } from 'drizzle-orm';
import { recordAdminAction } from '../admin/auditLog.js';
import { sendPush } from './pushService.js';

export class NotificationError extends Error {
  readonly status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = 'NotificationError';
    this.status = status;
  }
}

export const DEFAULT_TEMPLATES = [
  {
    code: 'order.created',
    channel: 'both',
    category: 'order',
    subject: 'Pesanan {{orderNumber}} diterima',
    body: 'Terima kasih, pesanan {{orderNumber}} sudah kami terima dengan total {{totalAmount}}.',
    deepLinkPattern: '/orders/{{orderNumber}}',
  },
  {
    code: 'order.paid',
    channel: 'both',
    category: 'order',
    subject: 'Pembayaran {{orderNumber}} berhasil',
    body: 'Pembayaran pesanan {{orderNumber}} sudah kami terima. Pesanan akan segera diproses.',
    deepLinkPattern: '/orders/{{orderNumber}}',
  },
  {
    code: 'order.shipped',
    channel: 'both',
    category: 'order',
    subject: 'Pesanan {{orderNumber}} dikirim',
    body: 'Pesanan {{orderNumber}} sudah dikirim dengan AWB {{awb}}.',
    deepLinkPattern: '/orders/{{orderNumber}}/tracking',
  },
  {
    code: 'order.delivered',
    channel: 'both',
    category: 'order',
    subject: 'Pesanan {{orderNumber}} diterima',
    body: 'Pesanan {{orderNumber}} sudah diterima. Terima kasih sudah berbelanja.',
    deepLinkPattern: '/orders/{{orderNumber}}',
  },
  {
    code: 'payment.failed',
    channel: 'both',
    category: 'payment',
    subject: 'Pembayaran {{orderNumber}} gagal',
    body: 'Pembayaran pesanan {{orderNumber}} gagal atau kedaluwarsa. Silakan coba lagi.',
    deepLinkPattern: '/orders/{{orderNumber}}/payment',
  },
];

export const DEFAULT_PREFERENCES = [
  { category: 'order', inApp: true, email: true },
  { category: 'payment', inApp: true, email: true },
  { category: 'promo', inApp: true, email: false },
];

const PLACEHOLDER = /\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g;

export function renderTemplate(template: string, vars: Record<string, unknown>): string {
  return String(template ?? '').replace(PLACEHOLDER, (_match, key: string) => {
    const value = vars[key];
    if (value === null || value === undefined) return '';
    return String(value);
  });
}

export function buildDeepLink(pattern: string | null | undefined, vars: Record<string, unknown>): string | null {
  if (!pattern) return null;
  const rendered = renderTemplate(pattern, vars).trim();
  if (!rendered) return null;
  return rendered.startsWith('/') ? rendered : `/${rendered}`;
}

export interface ChannelDecision {
  inApp: boolean;
  email: boolean;
}

export function decideChannels(
  preference: { inApp?: boolean | null; email?: boolean | null } | null | undefined,
  templateChannel: string
): ChannelDecision {
  const wantsInApp = preference?.inApp ?? true;
  const wantsEmail = preference?.email ?? true;
  const templateAllowsInApp = templateChannel === 'in_app' || templateChannel === 'both';
  const templateAllowsEmail = templateChannel === 'email' || templateChannel === 'both';
  return {
    inApp: wantsInApp && templateAllowsInApp,
    email: wantsEmail && templateAllowsEmail,
  };
}

export async function ensureDefaultTemplates(actorId?: string): Promise<number> {
  let inserted = 0;
  for (const template of DEFAULT_TEMPLATES) {
    const [existing] = await db
      .select({ id: notificationTemplates.id })
      .from(notificationTemplates)
      .where(eq(notificationTemplates.code, template.code))
      .limit(1);
    if (existing) continue;
    await db.insert(notificationTemplates).values(template);
    inserted += 1;
  }
  if (inserted > 0 && actorId) {
    await recordAdminAction({
      actorId,
      action: 'notification_template.seed',
      targetType: 'notification_template',
      metadata: { inserted },
    });
  }
  return inserted;
}

export async function resolveRecipientId(actorId: string, email?: string): Promise<string> {
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (uuidPattern.test(actorId)) return actorId;
  if (!email) {
    throw new NotificationError('Tidak bisa menentukan penerima notifikasi dari token ini', 409);
  }
  const [user] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (!user) {
    throw new NotificationError(`Penerima notifikasi tidak ditemukan untuk email ${email}`, 409);
  }
  return user.id;
}

export async function getPreference(userId: string, category: string) {
  const [row] = await db
    .select()
    .from(notificationPreferences)
    .where(and(eq(notificationPreferences.userId, userId as any), eq(notificationPreferences.category, category)))
    .limit(1);
  return row ?? null;
}

export async function listPreferences(userId: string) {
  const rows = await db
    .select()
    .from(notificationPreferences)
    .where(eq(notificationPreferences.userId, userId as any));
  const byCategory = new Map(rows.map((row) => [row.category, row]));
  return DEFAULT_PREFERENCES.map((fallback) => {
    const stored = byCategory.get(fallback.category);
    return {
      category: fallback.category,
      inApp: stored?.inApp ?? fallback.inApp,
      email: stored?.email ?? fallback.email,
      updatedAt: stored?.updatedAt ?? null,
    };
  });
}

export async function putPreferences(
  userId: string,
  input: Array<{ category: string; inApp?: boolean; email?: boolean }>
) {
  if (!Array.isArray(input) || input.length === 0) {
    throw new NotificationError('preferences harus berupa array dengan minimal satu kategori');
  }

  const rows = [];
  for (const entry of input) {
    const category = String(entry?.category ?? '').trim();
    if (!category) {
      throw new NotificationError('Setiap preferensi wajib punya category');
    }
    const [row] = await db
      .insert(notificationPreferences)
      .values({
        userId: userId as any,
        category,
        inApp: entry.inApp ?? true,
        email: entry.email ?? true,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [notificationPreferences.userId, notificationPreferences.category],
        set: {
          inApp: entry.inApp ?? true,
          email: entry.email ?? true,
          updatedAt: new Date(),
        },
      })
      .returning();
    rows.push(row);
  }

  return rows;
}

export interface NotifyInput {
  userId: string;
  templateCode: string;
  vars: Record<string, unknown>;
  data?: Record<string, unknown>;
}

export async function notify(input: NotifyInput) {
  const [template] = await db
    .select()
    .from(notificationTemplates)
    .where(eq(notificationTemplates.code, input.templateCode))
    .limit(1);

  if (!template || template.isActive === false) {
    throw new NotificationError(`Template notifikasi tidak aktif: ${input.templateCode}`, 404);
  }

  const preference = await getPreference(input.userId, template.category);
  const channels = decideChannels(preference, template.channel);

  if (!channels.inApp && !channels.email) {
    return { skipped: true, reason: 'semua channel dimatikan oleh preferensi penerima', created: [] as any[] };
  }

  const title = renderTemplate(template.subject ?? template.code, input.vars);
  const body = renderTemplate(template.body, input.vars);
  const deepLink = buildDeepLink(template.deepLinkPattern, input.vars);

  const created = [];
  let push: Awaited<ReturnType<typeof sendPush>> | null = null;
  if (channels.inApp) {
    const [row] = await db
      .insert(notifications)
      .values({
        userId: input.userId as any,
        templateCode: template.code,
        channel: 'in_app',
        category: template.category,
        title,
        body,
        deepLink,
        data: (input.data ?? {}) as any,
        deliveryStatus: 'delivered',
        isRead: false,
      })
      .returning();
    created.push(row);

    // Push mirror the in-app feed. Failures are non-fatal: the in-app row is
    // already persisted so the recipient still sees the notification.
    try {
      push = await sendPush(input.userId, title, body, {
        ...(input.data ?? {}),
        templateCode: template.code,
        category: template.category,
        deepLink: deepLink ?? '',
      });
    } catch {
      push = { sent: false, reason: 'push_error' };
    }
  }

  if (channels.email) {
    const smtpConfigured = Boolean(process.env.SMTP_HOST);
    const [row] = await db
      .insert(notifications)
      .values({
        userId: input.userId as any,
        templateCode: template.code,
        channel: 'email',
        category: template.category,
        title,
        body,
        deepLink,
        data: (input.data ?? {}) as any,
        deliveryStatus: smtpConfigured ? 'queued' : 'skipped_no_smtp',
        isRead: true,
      })
      .returning();
    created.push(row);
  }

  return { skipped: false, reason: null, created, push };
}

export async function listNotifications(userId: string, options: { limit?: number; unreadOnly?: boolean } = {}) {
  const limit = Math.min(Math.max(options.limit ?? 20, 1), 100);
  const rows = await db
    .select()
    .from(notifications)
    .where(eq(notifications.userId, userId as any))
    .orderBy(desc(notifications.createdAt))
    .limit(limit);

  const filtered = options.unreadOnly ? rows.filter((row) => row.isRead === false) : rows;
  return filtered;
}

export async function unreadCount(userId: string): Promise<number> {
  const [row] = await db
    .select({ total: count(notifications.id) })
    .from(notifications)
    .where(and(eq(notifications.userId, userId as any), eq(notifications.isRead, false)));
  return Number(row?.total ?? 0);
}

export async function markRead(userId: string, id: string) {
  const [existing] = await db.select().from(notifications).where(eq(notifications.id, id as any)).limit(1);
  if (!existing || existing.userId !== userId) {
    throw new NotificationError(`Notifikasi tidak ditemukan: ${id}`, 404);
  }
  const [row] = await db
    .update(notifications)
    .set({ isRead: true, readAt: new Date() })
    .where(eq(notifications.id, id as any))
    .returning();
  return row;
}

export async function markAllRead(userId: string): Promise<number> {
  const rows = await db
    .update(notifications)
    .set({ isRead: true, readAt: new Date() })
    .where(and(eq(notifications.userId, userId as any), eq(notifications.isRead, false)))
    .returning({ id: notifications.id });
  return rows.length;
}

export async function listTemplates() {
  return db.select().from(notificationTemplates).orderBy(notificationTemplates.code);
}

export async function upsertTemplate(actorId: string, code: string, input: any) {
  const channel = String(input?.channel ?? 'in_app');
  if (!['in_app', 'email', 'both'].includes(channel)) {
    throw new NotificationError('channel harus in_app, email, atau both');
  }

  const values = {
    code,
    channel,
    category: String(input?.category ?? 'order'),
    subject: input?.subject ? String(input.subject) : null,
    body: String(input?.body ?? ''),
    deepLinkPattern: input?.deepLinkPattern ? String(input.deepLinkPattern) : null,
    isActive: input?.isActive ?? true,
    updatedAt: new Date(),
  };

  if (!values.body.trim()) {
    throw new NotificationError('body template wajib diisi');
  }

  const [row] = await db
    .insert(notificationTemplates)
    .values(values)
    .onConflictDoUpdate({ target: notificationTemplates.code, set: values })
    .returning();

  await recordAdminAction({
    actorId,
    action: 'notification_template.upsert',
    targetType: 'notification_template',
    targetId: row.code,
  });

  return row;
}
