/**
 * Pricing routes (PRC-002, PRC-003, PRC-004).
 *
 * Public: one quote endpoint that prices a cart for the signed-in buyer. The buyer identity comes
 * from the bearer token, never from the request body, because the customer group of a request
 * decides the price and must not be self-declared.
 *
 * Admin: rules and customer groups, guarded by `promos.view` and `promos.manage`. Pricing is a
 * commercial decision, so it sits behind the same scope as promotions instead of a new one.
 */

import { Hono } from 'hono';
import { adminOnlyMiddleware, authMiddleware, requirePermission, verifyJwt } from '../middleware/auth.js';
import { PricingError, quotePricing } from '../services/pricing/pricingRepository.js';
import {
  createCustomerGroup,
  createPricingRule,
  deleteCustomerGroup,
  deletePricingRule,
  addGroupMember,
  listCustomerGroups,
  listGroupMembers,
  listPricingRules,
  removeGroupMember,
  updateCustomerGroup,
  updatePricingRule,
} from '../services/pricing/pricingRepository.js';

export const pricingPublicRoutes = new Hono();

/** Reads a bearer token if present. A bad token is anonymous instead of a 401. */
function optionalUserId(c: any): string | null {
  const header = c.req.header('authorization') ?? c.req.header('Authorization');
  if (!header || !header.toLowerCase().startsWith('bearer ')) return null;
  const token = header.slice(7).trim();
  if (!token) return null;
  try {
    const payload = verifyJwt(token) as { id?: string; userId?: string; sub?: string } | null;
    return payload?.id ?? payload?.userId ?? payload?.sub ?? null;
  } catch {
    return null;
  }
}

function fail(c: any, err: any) {
  if (err instanceof PricingError) {
    return c.json({ success: false, error: err.message }, err.status as any);
  }
  console.error('[pricing]', err?.message);
  return c.json({ success: false, error: 'failed' }, 500);
}

// POST /api/v1/pricing/quote - price a cart with the active rules
pricingPublicRoutes.post('/pricing/quote', async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    if (!Array.isArray(body?.lines) || body.lines.length === 0) {
      throw new PricingError('lines wajib berisi minimal satu item');
    }

    const quoted = await quotePricing({
      lines: body.lines.map((line: any) => ({
        productId: String(line?.productId ?? ''),
        variantId: line?.variantId ? String(line.variantId) : null,
        quantity: Number(line?.quantity),
      })),
      userId: optionalUserId(c),
    });

    return c.json({
      success: true,
      data: {
        lines: quoted.lines,
        baseSubtotal: quoted.baseSubtotal,
        itemsTotal: quoted.itemsTotal,
        discountTotal: quoted.discountTotal,
        customerGroups: quoted.customerGroups,
      },
    });
  } catch (err: any) {
    return fail(c, err);
  }
});

export const pricingAdminRoutes = new Hono();
pricingAdminRoutes.use('*', authMiddleware, adminOnlyMiddleware);

function actorId(c: any): string {
  return (c.get('user') as { id: string }).id;
}

// GET /api/v1/admin/pricing/rules
pricingAdminRoutes.get('/pricing/rules', requirePermission('promos.view'), async (c) => {
  try {
    const rows = await listPricingRules(true);
    return c.json({ success: true, data: { rules: rows, count: rows.length } });
  } catch (err: any) {
    return fail(c, err);
  }
});

// POST /api/v1/admin/pricing/rules
pricingAdminRoutes.post('/pricing/rules', requirePermission('promos.manage'), async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const row = await createPricingRule(actorId(c), body);
    return c.json({ success: true, data: row }, 201);
  } catch (err: any) {
    return fail(c, err);
  }
});

// PATCH /api/v1/admin/pricing/rules/:id
pricingAdminRoutes.patch('/pricing/rules/:id', requirePermission('promos.manage'), async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const row = await updatePricingRule(actorId(c), c.req.param('id') as string, body);
    return c.json({ success: true, data: row });
  } catch (err: any) {
    return fail(c, err);
  }
});

// DELETE /api/v1/admin/pricing/rules/:id
pricingAdminRoutes.delete('/pricing/rules/:id', requirePermission('promos.manage'), async (c) => {
  try {
    const row = await deletePricingRule(c.req.param('id') as string);
    return c.json({ success: true, data: row });
  } catch (err: any) {
    return fail(c, err);
  }
});

// GET /api/v1/admin/pricing/groups
pricingAdminRoutes.get('/pricing/groups', requirePermission('promos.view'), async (c) => {
  try {
    const rows = await listCustomerGroups();
    return c.json({ success: true, data: { groups: rows, count: rows.length } });
  } catch (err: any) {
    return fail(c, err);
  }
});

// POST /api/v1/admin/pricing/groups
pricingAdminRoutes.post('/pricing/groups', requirePermission('promos.manage'), async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const row = await createCustomerGroup(body);
    return c.json({ success: true, data: row }, 201);
  } catch (err: any) {
    return fail(c, err);
  }
});

// PATCH /api/v1/admin/pricing/groups/:id
pricingAdminRoutes.patch('/pricing/groups/:id', requirePermission('promos.manage'), async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const row = await updateCustomerGroup(c.req.param('id') as string, body);
    return c.json({ success: true, data: row });
  } catch (err: any) {
    return fail(c, err);
  }
});

// DELETE /api/v1/admin/pricing/groups/:id
pricingAdminRoutes.delete('/pricing/groups/:id', requirePermission('promos.manage'), async (c) => {
  try {
    const row = await deleteCustomerGroup(c.req.param('id') as string);
    return c.json({ success: true, data: row });
  } catch (err: any) {
    return fail(c, err);
  }
});

// GET /api/v1/admin/pricing/groups/:id/members
pricingAdminRoutes.get('/pricing/groups/:id/members', requirePermission('promos.view'), async (c) => {
  try {
    const rows = await listGroupMembers(c.req.param('id') as string);
    return c.json({ success: true, data: { members: rows, count: rows.length } });
  } catch (err: any) {
    return fail(c, err);
  }
});

// POST /api/v1/admin/pricing/groups/:id/members
pricingAdminRoutes.post('/pricing/groups/:id/members', requirePermission('promos.manage'), async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    if (!body?.userId) throw new PricingError('userId wajib diisi');
    const row = await addGroupMember(c.req.param('id') as string, String(body.userId));
    return c.json({ success: true, data: row }, row.added ? 201 : 200);
  } catch (err: any) {
    return fail(c, err);
  }
});

// DELETE /api/v1/admin/pricing/groups/:id/members/:userId
pricingAdminRoutes.delete(
  '/pricing/groups/:id/members/:userId',
  requirePermission('promos.manage'),
  async (c) => {
    try {
      const row = await removeGroupMember(c.req.param('id') as string, c.req.param('userId') as string);
      return c.json({ success: true, data: row });
    } catch (err: any) {
      return fail(c, err);
    }
  }
);
