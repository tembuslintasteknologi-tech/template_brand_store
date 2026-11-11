import { Hono } from 'hono';
import { authMiddleware } from '../middleware/auth.js';
import {
  WishlistError,
  addToWishlist,
  listWishlist,
  removeFromWishlist,
  updateWishlistPreferences,
} from '../services/wishlist/wishlistService.js';

export const wishlistRoutes = new Hono();
wishlistRoutes.use('*', authMiddleware);

function fail(c: any, err: any) {
  const status = err instanceof WishlistError ? err.status : err?.name === 'ZodError' ? 400 : 500;
  return c.json({ success: false, error: err?.message ?? 'failed' }, status as any);
}

function userIdOf(c: any): string {
  return (c.get('user') as { id: string }).id;
}

// GET /api/v1/wishlist - current customer wishlist (WSH-001)
wishlistRoutes.get('/', async (c) => {
  try {
    const items = await listWishlist(userIdOf(c));
    return c.json({ success: true, data: { items, count: items.length } });
  } catch (err: any) {
    return fail(c, err);
  }
});

// POST /api/v1/wishlist - add product, idempotent on (user, product)
wishlistRoutes.post('/', async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const row = await addToWishlist(userIdOf(c), body);
    return c.json({ success: true, data: row }, 201);
  } catch (err: any) {
    return fail(c, err);
  }
});

// PATCH /api/v1/wishlist/:productId - per-item alert preferences (WSH-004/005)
wishlistRoutes.patch('/:productId', async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const row = await updateWishlistPreferences(userIdOf(c), c.req.param('productId') as string, body);
    return c.json({ success: true, data: row });
  } catch (err: any) {
    return fail(c, err);
  }
});

// DELETE /api/v1/wishlist/:productId - remove product
wishlistRoutes.delete('/:productId', async (c) => {
  try {
    const removed = await removeFromWishlist(userIdOf(c), c.req.param('productId') as string);
    if (!removed) {
      return c.json({ success: false, error: 'Produk tidak ada di wishlist' }, 404);
    }
    return c.json({ success: true, data: { removed: true } });
  } catch (err: any) {
    return fail(c, err);
  }
});
