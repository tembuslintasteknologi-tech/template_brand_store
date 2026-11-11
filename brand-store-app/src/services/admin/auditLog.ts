import { db } from '../../db/index.js';
import { adminLogs, users } from '../../db/schema.js';
import { desc, eq } from 'drizzle-orm';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): boolean {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

export interface AdminActionInput {
  actorId: string;
  action: string;
  targetType?: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
}

export async function recordAdminAction(input: AdminActionInput): Promise<void> {
  const resolvableActor = isUuid(input.actorId);
  const metadata = {
    ...(input.metadata ?? {}),
    ...(resolvableActor ? {} : { actorIdentifier: input.actorId }),
  };

  await db.insert(adminLogs).values({
    actorId: (resolvableActor ? input.actorId : null) as any,
    action: input.action,
    targetType: input.targetType ?? null,
    targetId: input.targetId ?? null,
    metadata: (Object.keys(metadata).length > 0 ? metadata : null) as any,
  });
}

export async function listAdminActions(limit = 50, action?: string) {
  const query = db
    .select({
      id: adminLogs.id,
      actorId: adminLogs.actorId,
      actorEmail: users.email,
      action: adminLogs.action,
      targetType: adminLogs.targetType,
      targetId: adminLogs.targetId,
      metadata: adminLogs.metadata,
      createdAt: adminLogs.createdAt,
    })
    .from(adminLogs)
    .leftJoin(users, eq(adminLogs.actorId, users.id))
    .orderBy(desc(adminLogs.createdAt))
    .limit(Math.min(Math.max(limit, 1), 200));

  if (action) {
    return query.where(eq(adminLogs.action, action));
  }

  return query;
}
