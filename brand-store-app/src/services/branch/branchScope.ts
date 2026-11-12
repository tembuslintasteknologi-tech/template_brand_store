/**
 * Decides whether a user may act on a given branch (BR-002).
 *
 * Role model:
 *   admin        -> pusat, may read and write every branch
 *   branch_admin -> exactly one branch, taken from users.branch_id
 *   customer     -> no branch access at all
 *
 * The function is pure so the middleware in middleware/auth.ts stays a thin wrapper and the
 * rules can be unit tested without spinning up Hono or a database.
 */

export const BRANCH_ADMIN_ROLE = 'branch_admin';
export const PUSAT_ADMIN_ROLE = 'admin';

export interface ScopeUser {
  id?: string;
  role?: string;
  branchId?: string | null;
  branch_id?: string | null;
}

export type BranchScopeDenialCode =
  | 'FORBIDDEN'
  | 'BRANCH_SCOPE_MISSING'
  | 'BRANCH_SCOPE_MISMATCH';

export type BranchScopeDecision =
  | { allowed: true; branchId: string | null; scope: 'pusat' | 'branch' }
  | { allowed: false; status: 401 | 403; code: BranchScopeDenialCode; message: string };

/** Reads branch id from either camelCase JWT payload or snake_case database column. */
export function branchIdOf(user: ScopeUser | null | undefined): string | null {
  if (!user) return null;
  const value = user.branchId ?? user.branch_id ?? null;
  return value && String(value).trim() !== '' ? String(value) : null;
}

export function resolveBranchAccess(
  user: ScopeUser | null | undefined,
  requestedBranchId?: string | null
): BranchScopeDecision {
  if (!user) {
    return {
      allowed: false,
      status: 401,
      code: 'FORBIDDEN',
      message: 'Unauthorized: branch scope requires an authenticated user',
    };
  }

  const requested = requestedBranchId && String(requestedBranchId).trim() !== ''
    ? String(requestedBranchId)
    : null;

  if (user.role === PUSAT_ADMIN_ROLE) {
    return { allowed: true, branchId: requested, scope: 'pusat' };
  }

  if (user.role !== BRANCH_ADMIN_ROLE) {
    return {
      allowed: false,
      status: 403,
      code: 'FORBIDDEN',
      message: 'Forbidden: admin or branch_admin role required',
    };
  }

  const ownBranchId = branchIdOf(user);
  if (!ownBranchId) {
    return {
      allowed: false,
      status: 403,
      code: 'BRANCH_SCOPE_MISSING',
      message: 'Forbidden: branch_admin account is not linked to a branch',
    };
  }

  if (requested && requested !== ownBranchId) {
    return {
      allowed: false,
      status: 403,
      code: 'BRANCH_SCOPE_MISMATCH',
      message: 'Forbidden: branch_admin can only act on its own branch',
    };
  }

  return { allowed: true, branchId: ownBranchId, scope: 'branch' };
}
