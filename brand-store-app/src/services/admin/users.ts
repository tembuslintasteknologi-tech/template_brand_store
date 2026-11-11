import { db } from '../../db/index.js';
import { users } from '../../db/schema.js';
import { and, count, desc, eq } from 'drizzle-orm';
import { recordAdminAction } from './auditLog.js';

export class AdminUserError extends Error {
  readonly status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = 'AdminUserError';
    this.status = status;
  }
}

export interface ListCustomersOptions {
  limit?: number;
  offset?: number;
  search?: string;
}

export async function listCustomers(options: ListCustomersOptions = {}) {
  const limit = Math.min(Math.max(options.limit ?? 20, 1), 100);
  const offset = Math.max(options.offset ?? 0, 0);

  const baseQuery = db
    .select({
      id: users.id,
      email: users.email,
      fullName: users.fullName,
      phone: users.phone,
      role: users.role,
      status: users.status,
      emailVerified: users.emailVerified,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(eq(users.role, 'customer'))
    .orderBy(desc(users.createdAt))
    .limit(limit)
    .offset(offset);

  const rows = await baseQuery;
  const [totalRow] = await db.select({ total: count(users.id) }).from(users).where(eq(users.role, 'customer'));

  const filtered = options.search
    ? rows.filter((row) => {
        const needle = options.search!.toLowerCase();
        return row.email.toLowerCase().includes(needle) || row.fullName.toLowerCase().includes(needle);
      })
    : rows;

  return {
    customers: filtered,
    total: Number(totalRow?.total ?? 0),
    limit,
    offset,
  };
}

export async function getCustomerDetail(userId: string) {
  const [user] = await db.select().from(users).where(eq(users.id, userId as any)).limit(1);
  if (!user) {
    throw new AdminUserError(`User not found: ${userId}`, 404);
  }
  const { passwordHash, ...safe } = user;
  return safe;
}

export async function setCustomerStatus(actorId: string, userId: string, status: 'active' | 'suspended') {
  if (!['active', 'suspended'].includes(status)) {
    throw new AdminUserError('status must be active or suspended');
  }

  const [user] = await db.select().from(users).where(eq(users.id, userId as any)).limit(1);
  if (!user) {
    throw new AdminUserError(`User not found: ${userId}`, 404);
  }
  if (user.id === actorId && status === 'suspended') {
    throw new AdminUserError('Admin tidak boleh menangguhkan akunnya sendiri', 409);
  }

  const [updated] = await db
    .update(users)
    .set({ status, updatedAt: new Date() })
    .where(eq(users.id, user.id))
    .returning({ id: users.id, email: users.email, status: users.status });

  await recordAdminAction({
    actorId,
    action: status === 'suspended' ? 'customer.suspend' : 'customer.activate',
    targetType: 'user',
    targetId: user.id,
    metadata: { previousStatus: user.status, status },
  });

  return updated;
}

export async function countAdmins(): Promise<number> {
  const [row] = await db.select({ total: count(users.id) }).from(users).where(eq(users.role, 'admin'));
  return Number(row?.total ?? 0);
}

export async function setUserRole(
  actorId: string,
  userId: string,
  role: 'admin' | 'customer'
): Promise<{ id: string; email: string; role: string; adminsRemaining: number }> {
  if (!['admin', 'customer'].includes(role)) {
    throw new AdminUserError('role must be admin or customer');
  }

  const [user] = await db.select().from(users).where(eq(users.id, userId as any)).limit(1);
  if (!user) {
    throw new AdminUserError(`User not found: ${userId}`, 404);
  }

  if (user.role === 'admin' && role === 'customer') {
    const admins = await countAdmins();
    if (admins <= 1) {
      throw new AdminUserError('Admin terakhir tidak boleh diturunkan menjadi customer', 409);
    }
  }

  if (user.id === actorId && role === 'customer') {
    throw new AdminUserError('Admin tidak boleh menurunkan perannya sendiri', 409);
  }

  const [updated] = await db
    .update(users)
    .set({ role, updatedAt: new Date() })
    .where(eq(users.id, user.id))
    .returning({ id: users.id, email: users.email, role: users.role });

  await recordAdminAction({
    actorId,
    action: role === 'admin' ? 'user.promote_admin' : 'user.demote_admin',
    targetType: 'user',
    targetId: user.id,
    metadata: { previousRole: user.role, role },
  });

  return { ...updated, adminsRemaining: await countAdmins() };
}

export async function findUserByEmail(email: string) {
  const [user] = await db
    .select({ id: users.id, email: users.email, role: users.role })
    .from(users)
    .where(and(eq(users.email, email)))
    .limit(1);
  return user;
}
