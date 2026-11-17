/**
 * Granular admin permission scopes (AUT-013).
 *
 * Role is the ceiling, overrides are the narrowing or widening inside that ceiling:
 * - `admin` starts with every permission and can lose specific scopes.
 * - `branch_admin` starts with the operational subset and can gain scopes the granting
 *   admin holds.
 * - `permissions.manage` is never handed out through an override, it only comes from the
 *   `admin` role default, so a scoped admin cannot clone their own authority.
 *
 * Everything here is pure. Database access lives in `permissionRepository.ts` and the
 * HTTP guard lives in `src/middleware/auth.ts`.
 */

export const ADMIN_PERMISSIONS = [
  'dashboard.view',
  'users.view',
  'users.manage',
  'catalog.view',
  'catalog.manage',
  'inventory.view',
  'inventory.manage',
  'orders.view',
  'orders.manage',
  'promos.view',
  'promos.manage',
  'finance.view',
  'reports.export',
  'content.view',
  'content.manage',
  'reviews.view',
  'reviews.manage',
  'settings.view',
  'settings.manage',
  'chat.view',
  'chat.manage',
  'audit.view',
  'permissions.manage',
] as const;

export type AdminPermission = (typeof ADMIN_PERMISSIONS)[number];
export type PermissionEffect = 'grant' | 'revoke';

export interface PermissionOverride {
  permission: AdminPermission;
  effect: PermissionEffect;
}

export const PERMISSION_DESCRIPTIONS: Record<AdminPermission, string> = {
  'dashboard.view': 'Lihat dashboard dan alert operasional',
  'users.view': 'Lihat daftar dan detail customer',
  'users.manage': 'Ubah status customer dan peran admin',
  'catalog.view': 'Lihat katalog dan data produk',
  'catalog.manage': 'Buat, ubah, dan hapus produk',
  'inventory.view': 'Lihat stok dan riwayat pergerakan stok',
  'inventory.manage': 'Sesuaikan stok dan transfer antar cabang',
  'orders.view': 'Lihat pesanan',
  'orders.manage': 'Proses, ubah status, dan batalkan pesanan',
  'promos.view': 'Lihat promo dan flash sale',
  'promos.manage': 'Buat dan ubah promo dan flash sale',
  'finance.view': 'Lihat laporan keuangan dan refund',
  'reports.export': 'Unduh laporan CSV atau JSON',
  'content.view': 'Lihat banner dan halaman konten',
  'content.manage': 'Ubah banner dan halaman konten',
  'reviews.view': 'Lihat ulasan customer',
  'reviews.manage': 'Moderasi dan balas ulasan',
  'settings.view': 'Lihat pengaturan toko',
  'settings.manage': 'Ubah pengaturan toko',
  'chat.view': 'Lihat percakapan live chat',
  'chat.manage': 'Balas dan tutup percakapan live chat',
  'audit.view': 'Lihat audit log admin',
  'permissions.manage': 'Atur scope admin lain',
};

const ADMIN_DEFAULTS: AdminPermission[] = [...ADMIN_PERMISSIONS];

const BRANCH_ADMIN_DEFAULTS: AdminPermission[] = [
  'dashboard.view',
  'catalog.view',
  'inventory.view',
  'inventory.manage',
  'orders.view',
  'orders.manage',
  'reviews.view',
  'reviews.manage',
  'chat.view',
  'chat.manage',
];

export const ROLE_PERMISSION_DEFAULTS: Record<string, AdminPermission[]> = {
  admin: ADMIN_DEFAULTS,
  branch_admin: BRANCH_ADMIN_DEFAULTS,
  customer: [],
};

export type PermissionErrorCode =
  | 'UNKNOWN_PERMISSION'
  | 'INVALID_EFFECT'
  | 'PERMISSION_DENIED'
  | 'SCOPE_NOT_HELD';

export class PermissionError extends Error {
  readonly status: number;
  readonly code: PermissionErrorCode;

  constructor(message: string, code: PermissionErrorCode, status = 400) {
    super(message);
    this.name = 'PermissionError';
    this.code = code;
    this.status = status;
  }
}

export function isKnownPermission(value: unknown): value is AdminPermission {
  return typeof value === 'string' && (ADMIN_PERMISSIONS as readonly string[]).includes(value);
}

export function defaultsForRole(role: string | null | undefined): AdminPermission[] {
  return [...(ROLE_PERMISSION_DEFAULTS[String(role ?? '')] ?? [])];
}

/**
 * Validates raw overrides and keeps the last statement per permission. A duplicate is not an
 * error, the later row simply replaces the earlier one so an update can be expressed as a diff.
 */
export function normalizeOverrides(input: unknown): PermissionOverride[] {
  if (input == null) return [];
  if (!Array.isArray(input)) {
    throw new PermissionError('overrides must be an array', 'UNKNOWN_PERMISSION');
  }

  const byPermission = new Map<AdminPermission, PermissionOverride>();
  for (const raw of input) {
    const permission = (raw as any)?.permission;
    const effect = (raw as any)?.effect;

    if (!isKnownPermission(permission)) {
      throw new PermissionError(`Unknown permission: ${String(permission)}`, 'UNKNOWN_PERMISSION');
    }
    if (effect !== 'grant' && effect !== 'revoke') {
      throw new PermissionError(`Invalid effect for ${permission}: ${String(effect)}`, 'INVALID_EFFECT');
    }
    if (permission === 'permissions.manage' && effect === 'grant') {
      throw new PermissionError(
        'permissions.manage hanya diberikan lewat role admin, bukan override',
        'SCOPE_NOT_HELD'
      );
    }
    byPermission.set(permission, { permission, effect });
  }

  return Array.from(byPermission.values());
}

/**
 * Applies overrides to the role defaults and returns permissions in catalog order so
 * comparisons and UI listings stay stable.
 */
export function effectivePermissions(
  role: string | null | undefined,
  overrides: unknown = []
): AdminPermission[] {
  const normalized = normalizeOverrides(overrides);
  const result = new Set<AdminPermission>(defaultsForRole(role));

  for (const override of normalized) {
    if (override.effect === 'grant') result.add(override.permission);
    else result.delete(override.permission);
  }

  return ADMIN_PERMISSIONS.filter((permission) => result.has(permission));
}

export function hasPermission(
  role: string | null | undefined,
  overrides: unknown,
  permission: AdminPermission
): boolean {
  return effectivePermissions(role, overrides).includes(permission);
}

export function assertPermission(
  role: string | null | undefined,
  overrides: unknown,
  permission: AdminPermission
): void {
  if (!hasPermission(role, overrides, permission)) {
    throw new PermissionError(`Butuh scope ${permission}`, 'PERMISSION_DENIED', 403);
  }
}

/**
 * An actor can only hand out scopes the actor currently holds. The role default for
 * `permissions.manage` is the one exception: it is never transferable through an override.
 */
export function canGrant(
  actorRole: string | null | undefined,
  actorOverrides: unknown,
  permission: AdminPermission
): boolean {
  if (permission === 'permissions.manage') return false;
  if (!isKnownPermission(permission)) return false;
  return hasPermission(actorRole, actorOverrides, permission);
}

export interface PermissionDiff {
  added: AdminPermission[];
  removed: AdminPermission[];
  unchanged: AdminPermission[];
}

export function diffPermissions(
  before: readonly AdminPermission[],
  after: readonly AdminPermission[]
): PermissionDiff {
  const beforeSet = new Set(before);
  const afterSet = new Set(after);
  const added: AdminPermission[] = [];
  const removed: AdminPermission[] = [];
  const unchanged: AdminPermission[] = [];

  for (const permission of ADMIN_PERMISSIONS) {
    const inBefore = beforeSet.has(permission);
    const inAfter = afterSet.has(permission);
    if (inBefore && inAfter) unchanged.push(permission);
    else if (!inBefore && inAfter) added.push(permission);
    else if (inBefore && !inAfter) removed.push(permission);
  }

  return { added, removed, unchanged };
}

/**
 * Overrides are stored one row per permission, so the update endpoint accepts the full desired
 * override list and this helper turns it into a compact idempotent statement list.
 */
export function overridesForUpdate(
  current: unknown,
  desired: unknown
): Array<{ permission: AdminPermission; effect: PermissionEffect | null }> {
  const currentMap = new Map(normalizeOverrides(current).map((row) => [row.permission, row.effect]));
  const desiredMap = new Map(normalizeOverrides(desired).map((row) => [row.permission, row.effect]));
  const changes: Array<{ permission: AdminPermission; effect: PermissionEffect | null }> = [];

  for (const permission of ADMIN_PERMISSIONS) {
    const before = currentMap.get(permission) ?? null;
    const after = desiredMap.get(permission) ?? null;
    if (before !== after) changes.push({ permission, effect: after });
  }

  return changes;
}
