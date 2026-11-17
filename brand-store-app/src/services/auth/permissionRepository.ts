import { and, eq } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { adminPermissionGrants, users } from '../../db/schema.js';
import {
  AdminPermission,
  PermissionError,
  PermissionOverride,
  effectivePermissions,
  isKnownPermission,
  normalizeOverrides,
} from './permissions.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isPersistedUserId(value: unknown): boolean {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

/**
 * Mock and test tokens carry identifiers such as `admin-uuid-001`, which are not users in the
 * database. They get the role defaults and skip the query instead of failing the request.
 */
export async function loadPermissionOverrides(userId: unknown): Promise<PermissionOverride[]> {
  if (!isPersistedUserId(userId)) return [];

  const rows = await db
    .select({
      permission: adminPermissionGrants.permission,
      effect: adminPermissionGrants.effect,
    })
    .from(adminPermissionGrants)
    .where(eq(adminPermissionGrants.userId, userId as string));

  return rows
    .filter((row) => isKnownPermission(row.permission))
    .map((row) => ({
      permission: row.permission as AdminPermission,
      effect: row.effect === 'revoke' ? 'revoke' : 'grant',
    }));
}

export interface AdminPermissionState {
  userId: string;
  email: string;
  role: string;
  overrides: PermissionOverride[];
  effective: AdminPermission[];
}

export async function getAdminPermissionState(userId: string): Promise<AdminPermissionState> {
  const [user] = await db
    .select({ id: users.id, email: users.email, role: users.role })
    .from(users)
    .where(eq(users.id, userId as any))
    .limit(1);

  if (!user) {
    throw new PermissionError(`User not found: ${userId}`, 'PERMISSION_DENIED', 404);
  }

  const overrides = await loadPermissionOverrides(user.id);
  return {
    userId: user.id,
    email: user.email,
    role: user.role,
    overrides,
    effective: effectivePermissions(user.role, overrides),
  };
}

export interface ReplaceOverridesInput {
  userId: string;
  overrides: unknown;
  actorId: string;
}

export async function replaceUserOverrides(input: ReplaceOverridesInput): Promise<AdminPermissionState> {
  const desired = normalizeOverrides(input.overrides);

  const [target] = await db
    .select({ id: users.id, role: users.role })
    .from(users)
    .where(eq(users.id, input.userId as any))
    .limit(1);

  if (!target) {
    throw new PermissionError(`User not found: ${input.userId}`, 'PERMISSION_DENIED', 404);
  }

  // Role `customer` has no admin scope at all. Writing overrides for it would create rows that
  // never grant anything, so reject early instead of storing dead data.
  if (target.role === 'customer') {
    throw new PermissionError(
      'Customer tidak punya scope admin, ubah role terlebih dahulu',
      'SCOPE_NOT_HELD',
      409
    );
  }

  await db.delete(adminPermissionGrants).where(eq(adminPermissionGrants.userId, target.id));

  if (desired.length > 0) {
    await db.insert(adminPermissionGrants).values(
      desired.map((row) => ({
        userId: target.id,
        permission: row.permission,
        effect: row.effect,
        grantedBy: isPersistedUserId(input.actorId) ? input.actorId : null,
      })) as any
    );
  }

  return getAdminPermissionState(target.id);
}

/**
 * Removes a single scope row. The update endpoint replaces the full set, this helper exists for
 * callers that only need to drop one stale grant after a role change.
 */
export async function deletePermissionOverride(userId: string, permission: AdminPermission): Promise<void> {
  await db
    .delete(adminPermissionGrants)
    .where(
      and(
        eq(adminPermissionGrants.userId, userId as any),
        eq(adminPermissionGrants.permission, permission)
      )
    );
}
