/**
 * Keranjang persisten dan pemulihan abandoned cart.
 *
 * Route customer berada di `/cart`, route admin di `/admin/cart-recovery`. Keduanya sengaja
 * dipisah file ini dari `cartService` lama yang dipakai checkout, karena jalur lama tidak
 * menyimpan pemilik cart sehingga tidak mungkin dihubungi lagi lewat email.
 */

import { Hono } from 'hono';
import { authMiddleware, adminOnlyMiddleware } from '../middleware/auth.js';
import { getSettingValue } from '../services/config/settings.js';
import {
  CartPersistenceError,
  addItemToCart,
  clearCartForUser,
  getCartView,
  listRecoveryCarts,
  markCartConverted,
  recoverCartByToken,
  removeCartLine,
  runRecoveryScan,
  updateCartLine,
} from '../services/cart/cartPersistence.js';
import {
  DEFAULT_ABANDONMENT_POLICY,
  buildRecoveryLink,
  resolveAbandonmentPolicy,
  summarizeRecovery,
  type AbandonmentPolicy,
} from '../services/cart/cartRecoveryService.js';
import type { RecoveryState } from '../services/cart/cartRecoveryService.js';

export const cartRoutes = new Hono();
cartRoutes.use('*', authMiddleware);

export const cartAdminRoutes = new Hono();
cartAdminRoutes.use('*', authMiddleware);
cartAdminRoutes.use('*', adminOnlyMiddleware);

function cartFail(c: any, err: any) {
  const status = err instanceof CartPersistenceError ? err.status : Number(err?.status) || 500;
  const code = err instanceof CartPersistenceError ? err.code : (err?.code ?? 'CART_ERROR');
  return c.json({ success: false, error: { code, message: err?.message ?? 'cart failed' } }, status as any);
}

function userIdOf(c: any): string {
  return (c.get('user') as { id: string }).id;
}

export async function loadAbandonmentPolicy(): Promise<AbandonmentPolicy> {
  const raw = await getSettingValue<unknown>('cart.abandonment', null);
  return raw ? resolveAbandonmentPolicy(raw) : { ...DEFAULT_ABANDONMENT_POLICY };
}

/**
 * Base URL untuk link pemulihan. Diambil dari setting supaya admin bisa mengubahnya tanpa
 * deploy ulang, lalu env sebagai fallback saat setting belum pernah diisi.
 */
export async function loadRecoveryBaseUrl(): Promise<string> {
  const stored = await getSettingValue<{ url?: string } | null>('cart.recoveryBaseUrl', null);
  if (stored?.url) return stored.url;
  return process.env.STORE_BASE_URL ?? 'http://localhost:3000';
}

// ---------------------------------------------------------------------------
// CUSTOMER
// ---------------------------------------------------------------------------

// GET /api/v1/cart
cartRoutes.get('/', async (c) => {
  try {
    const cart = await getCartView(userIdOf(c));
    return c.json({ success: true, data: cart });
  } catch (err: any) {
    return cartFail(c, err);
  }
});

// POST /api/v1/cart/items
cartRoutes.post('/items', async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    if (!body?.productId) {
      return c.json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'productId wajib diisi' } }, 400);
    }
    const cart = await addItemToCart({
      userId: userIdOf(c),
      productId: String(body.productId),
      variantId: body.variantId ? String(body.variantId) : null,
      quantity: body.quantity ?? 1,
    });
    return c.json({ success: true, data: cart }, 201);
  } catch (err: any) {
    return cartFail(c, err);
  }
});

// PATCH /api/v1/cart/items/:lineId - quantity 0 menghapus baris
cartRoutes.patch('/items/:lineId', async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const cart = await updateCartLine(userIdOf(c), c.req.param('lineId'), body?.quantity);
    return c.json({ success: true, data: cart });
  } catch (err: any) {
    return cartFail(c, err);
  }
});

// DELETE /api/v1/cart/items/:lineId
cartRoutes.delete('/items/:lineId', async (c) => {
  try {
    const cart = await removeCartLine(userIdOf(c), c.req.param('lineId'));
    return c.json({ success: true, data: cart });
  } catch (err: any) {
    return cartFail(c, err);
  }
});

// DELETE /api/v1/cart - kosongkan keranjang
cartRoutes.delete('/', async (c) => {
  try {
    const cart = await clearCartForUser(userIdOf(c));
    return c.json({ success: true, data: cart });
  } catch (err: any) {
    return cartFail(c, err);
  }
});

// POST /api/v1/cart/convert - dipanggil checkout setelah order dibuat
cartRoutes.post('/convert', async (c) => {
  try {
    const result = await markCartConverted(userIdOf(c));
    return c.json({ success: true, data: result });
  } catch (err: any) {
    return cartFail(c, err);
  }
});

/**
 * POST /api/v1/cart/recover/:token
 *
 * Butuh login. Token yang bocor tidak boleh membuka isi keranjang akun lain, jadi pemilik
 * cart dari token harus sama dengan user yang sedang login. Kalau beda, jawabannya 403 tanpa
 * membocorkan apakah token itu ada.
 */
cartRoutes.post('/recover/:token', async (c) => {
  try {
    const policy = await loadAbandonmentPolicy();
    const result = await recoverCartByToken(c.req.param('token'), policy);
    const userId = userIdOf(c);
    if (result.userId !== userId) {
      return c.json(
        { success: false, error: { code: 'RECOVERY_FORBIDDEN', message: 'Link pemulihan ini bukan untuk akun Anda' } },
        403
      );
    }
    return c.json({ success: true, data: result });
  } catch (err: any) {
    return cartFail(c, err);
  }
});

// ---------------------------------------------------------------------------
// ADMIN
// ---------------------------------------------------------------------------

// GET /api/v1/admin/cart-recovery/summary
cartAdminRoutes.get('/summary', async (c) => {
  try {
    const policy = await loadAbandonmentPolicy();
    const rows = await listRecoveryCarts(policy, { limit: 200 });
    const summary = summarizeRecovery(rows, policy);
    return c.json({
      success: true,
      data: {
        policy,
        summary,
        recoveryBaseUrl: await loadRecoveryBaseUrl(),
      },
    });
  } catch (err: any) {
    return cartFail(c, err);
  }
});

// GET /api/v1/admin/cart-recovery/carts?state=&limit=
cartAdminRoutes.get('/carts', async (c) => {
  try {
    const policy = await loadAbandonmentPolicy();
    const state = (c.req.query('state') as RecoveryState | undefined) ?? null;
    const rows = await listRecoveryCarts(policy, { limit: Number(c.req.query('limit') ?? 50), state });
    return c.json({ success: true, data: rows, summary: summarizeRecovery(rows, policy) });
  } catch (err: any) {
    return cartFail(c, err);
  }
});

/**
 * POST /api/v1/admin/cart-recovery/scan
 *
 * Satu putaran scan manual. Interval otomatis tidak dipasang di sini karena repo ini belum
 * membawa scheduler; jalankan endpoint ini dari cron eksternal atau aktifkan lewat
 * `CART_RECOVERY_INTERVAL_MINUTES` di sisi proses.
 */
cartAdminRoutes.post('/scan', async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const policy = await loadAbandonmentPolicy();
    const baseUrl = body?.baseUrl ? String(body.baseUrl) : await loadRecoveryBaseUrl();

    // Fail fast: link yang tidak bisa dibentuk akan membuat setiap pengiriman gagal dan
    // menaikkan counter `failed` tanpa sebab yang jelas bagi admin.
    buildRecoveryLink(baseUrl, 'probe');

    const result = await runRecoveryScan(policy, {
      limit: Number(body?.limit ?? 100),
      baseUrl,
    });
    return c.json({ success: true, data: { ...result, policy, baseUrl } });
  } catch (err: any) {
    return cartFail(c, err);
  }
});
