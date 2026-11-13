import { Hono } from 'hono';
import { authMiddleware } from '../middleware/auth.js';
import { OrderSourceError } from '../services/branch/orderSourceService.js';
import { listShippingOptions } from '../services/shipping/shippingOptionsService.js';

export const shippingRoutes = new Hono();

function truthy(value: string | undefined): boolean {
  if (!value) return false;
  return ['1', 'true', 'yes', 'y'].includes(value.trim().toLowerCase());
}

// GET /api/v1/shipping/options?branchId&addressId
//
// BR-010: what can carry this parcel from this branch. Distance decides which modes are
// allowed (BR-008), the providers decide whether they can actually quote the route, and only
// the survivors are returned. The response is never cached because stock and tariffs move.
shippingRoutes.get('/options', authMiddleware, async (c) => {
  try {
    const user = c.get('user') as { id: string; role: string; email: string };
    const addressId = c.req.query('addressId') || null;
    const valueParam = c.req.query('value');

    const result = await listShippingOptions({
      branchId: c.req.query('branchId') ?? '',
      addressId,
      // An address is personal, so it is only readable by its owner. Without an address id
      // there is nothing to scope and the destination comes from the query.
      customerId: addressId ? user.id : null,
      destination: {
        city: c.req.query('city') ?? null,
        postalCode: c.req.query('postalCode') ?? null,
        latitude: c.req.query('latitude') ?? null,
        longitude: c.req.query('longitude') ?? null,
      },
      weightGrams: c.req.query('weightGrams') ?? null,
      value: valueParam && Number.isFinite(Number(valueParam)) ? Number(valueParam) : null,
      cod: truthy(c.req.query('cod')),
    });

    c.header('Cache-Control', 'no-store');
    return c.json({ success: true, data: result });
  } catch (err: any) {
    if (err instanceof OrderSourceError) {
      return c.json(
        { success: false, error: { code: err.code, message: err.message } },
        err.status as any
      );
    }
    return c.json(
      { success: false, error: { code: 'SHIPPING_OPTIONS_FAILED', message: err.message } },
      500
    );
  }
});
