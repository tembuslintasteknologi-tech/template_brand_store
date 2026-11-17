/**
 * Cart persisten di database plus pemulihan lewat link.
 *
 * `cartService` lama tetap hidup karena checkout memakainya dan test-nya bergantung pada
 * perilaku in-memory itu. Modul ini adalah jalur baru untuk keranjang yang harus bertahan
 * melewati restart server, dan hanya jalur ini yang bisa mengirim pengingat karena hanya di
 * sini cart punya pemilik, timestamp aktivitas, dan isi yang bisa dibaca ulang.
 */

import { randomBytes } from 'node:crypto';
import { and, asc, eq, lte, sql } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { cartItems, carts, productVariants, products, users } from '../../db/schema.js';
import { notify } from '../notifications/notificationService.js';
import {
  buildRecoveryLink,
  classifyCartForRecovery,
  isRecoveryTokenExpired,
  type AbandonmentPolicy,
  type RecoveryState,
} from './cartRecoveryService.js';

export class CartPersistenceError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(message: string, status = 400, code = 'CART_ERROR') {
    super(message);
    this.name = 'CartPersistenceError';
    this.status = status;
    this.code = code;
  }
}

export const MAX_LINE_QUANTITY = 999;

export interface CartLine {
  id: string;
  productId: string;
  variantId: string | null;
  quantity: number;
  addedAt: Date;
  title: string | null;
  slug: string | null;
  variantName: string | null;
  unitPrice: number;
  lineTotal: number;
}

export interface CartView {
  id: string;
  userId: string;
  status: string;
  lastActivityAt: Date;
  recoveredAt: Date | null;
  items: CartLine[];
  itemCount: number;
  total: number;
}

function toNumber(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function getOrCreateCart(userId: string) {
  const [existing] = await db.select().from(carts).where(eq(carts.userId, userId as any)).limit(1);
  if (existing) return existing;

  const [created] = await db
    .insert(carts)
    .values({ userId: userId as any, status: 'active', lastActivityAt: new Date(), updatedAt: new Date() })
    .onConflictDoNothing({ target: carts.userId })
    .returning();

  if (created) return created;

  // Dua request paralel bisa sama-sama tidak menemukan cart lalu sama-sama insert. Yang kalah
  // membaca baris yang dibuat pemenang, bukan melempar error ke client.
  const [row] = await db.select().from(carts).where(eq(carts.userId, userId as any)).limit(1);
  if (!row) {
    throw new CartPersistenceError('Gagal membuat keranjang', 500, 'CART_CREATE_FAILED');
  }
  return row;
}

async function loadLines(cartId: string): Promise<CartLine[]> {
  const rows = await db
    .select({
      id: cartItems.id,
      productId: cartItems.productId,
      variantId: cartItems.variantId,
      quantity: cartItems.quantity,
      addedAt: cartItems.addedAt,
      title: products.title,
      slug: products.slug,
      basePrice: products.basePrice,
      variantName: productVariants.name,
      variantPrice: productVariants.price,
    })
    .from(cartItems)
    .leftJoin(products, eq(products.id, cartItems.productId))
    .leftJoin(productVariants, eq(productVariants.id, cartItems.variantId))
    .where(eq(cartItems.cartId, cartId as any))
    .orderBy(asc(cartItems.addedAt));

  return rows.map((row) => {
    const unitPrice = toNumber(row.variantPrice ?? row.basePrice);
    const quantity = Number(row.quantity ?? 0);
    return {
      id: row.id,
      productId: row.productId,
      variantId: row.variantId,
      quantity,
      addedAt: row.addedAt,
      title: row.title,
      slug: row.slug,
      variantName: row.variantName,
      unitPrice,
      lineTotal: unitPrice * quantity,
    };
  });
}

export async function getCartView(userId: string): Promise<CartView> {
  const cart = await getOrCreateCart(userId);
  const items = await loadLines(cart.id);

  return {
    id: cart.id,
    userId: cart.userId,
    status: cart.status,
    lastActivityAt: cart.lastActivityAt,
    recoveredAt: cart.recoveredAt ?? null,
    items,
    itemCount: items.reduce((sum, item) => sum + item.quantity, 0),
    total: items.reduce((sum, item) => sum + item.lineTotal, 0),
  };
}

/**
 * Setiap perubahan isi keranjang memperbarui `lastActivityAt`. Tanpa ini, cart yang sedang
 * aktif diisi pelan-pelan akan dianggap ditinggalkan padahal pelanggan masih menambah barang.
 */
async function touchCart(cartId: string, extra: Record<string, unknown> = {}) {
  const now = new Date();
  await db
    .update(carts)
    .set({ lastActivityAt: now, updatedAt: now, ...extra })
    .where(eq(carts.id, cartId as any));
}

export interface AddItemInput {
  userId: string;
  productId: string;
  variantId?: string | null;
  quantity?: number;
}

export async function addItemToCart(input: AddItemInput) {
  const quantity = Math.floor(Number(input.quantity ?? 1));
  if (!Number.isFinite(quantity) || quantity < 1) {
    throw new CartPersistenceError('Jumlah barang minimal 1', 400, 'INVALID_QUANTITY');
  }
  if (quantity > MAX_LINE_QUANTITY) {
    throw new CartPersistenceError(`Jumlah barang maksimal ${MAX_LINE_QUANTITY} per baris`, 400, 'INVALID_QUANTITY');
  }

  const [product] = await db
    .select({ id: products.id, status: products.status })
    .from(products)
    .where(eq(products.id, input.productId as any))
    .limit(1);
  if (!product) {
    throw new CartPersistenceError(`Produk tidak ditemukan: ${input.productId}`, 404, 'PRODUCT_NOT_FOUND');
  }
  if (product.status === 'archived') {
    throw new CartPersistenceError('Produk sudah tidak dijual', 409, 'PRODUCT_ARCHIVED');
  }

  if (input.variantId) {
    const [variant] = await db
      .select({ id: productVariants.id })
      .from(productVariants)
      .where(and(eq(productVariants.id, input.variantId as any), eq(productVariants.productId, input.productId as any)))
      .limit(1);
    if (!variant) {
      throw new CartPersistenceError('Varian tidak cocok dengan produk ini', 400, 'VARIANT_MISMATCH');
    }
  }

  const cart = await getOrCreateCart(input.userId);

  await db
    .insert(cartItems)
    .values({
      cartId: cart.id as any,
      productId: input.productId as any,
      variantId: (input.variantId ?? null) as any,
      quantity,
    })
    .onConflictDoUpdate({
      target: [cartItems.cartId, cartItems.productId],
      set: {
        quantity: sql`${cartItems.quantity} + ${quantity}`,
        variantId: (input.variantId ?? null) as any,
      },
    });

  await touchCart(cart.id, { status: 'active' });
  return getCartView(input.userId);
}

export async function updateCartLine(userId: string, lineId: string, quantity: unknown) {
  const parsed = Math.floor(Number(quantity));
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new CartPersistenceError('Jumlah barang harus angka 0 atau lebih', 400, 'INVALID_QUANTITY');
  }
  if (parsed > MAX_LINE_QUANTITY) {
    throw new CartPersistenceError(`Jumlah barang maksimal ${MAX_LINE_QUANTITY}`, 400, 'INVALID_QUANTITY');
  }

  const cart = await getOrCreateCart(userId);
  const [line] = await db
    .select({ id: cartItems.id })
    .from(cartItems)
    .where(and(eq(cartItems.id, lineId as any), eq(cartItems.cartId, cart.id as any)))
    .limit(1);

  if (!line) {
    throw new CartPersistenceError(`Baris keranjang tidak ditemukan: ${lineId}`, 404, 'CART_LINE_NOT_FOUND');
  }

  if (parsed === 0) {
    await db.delete(cartItems).where(eq(cartItems.id, lineId as any));
  } else {
    await db.update(cartItems).set({ quantity: parsed }).where(eq(cartItems.id, lineId as any));
  }

  await touchCart(cart.id, { status: 'active' });
  return getCartView(userId);
}

export async function removeCartLine(userId: string, lineId: string) {
  const cart = await getOrCreateCart(userId);
  const rows = await db
    .delete(cartItems)
    .where(and(eq(cartItems.id, lineId as any), eq(cartItems.cartId, cart.id as any)))
    .returning({ id: cartItems.id });

  if (rows.length === 0) {
    throw new CartPersistenceError(`Baris keranjang tidak ditemukan: ${lineId}`, 404, 'CART_LINE_NOT_FOUND');
  }

  await touchCart(cart.id, { status: 'active' });
  return getCartView(userId);
}

export async function clearCartForUser(userId: string) {
  const cart = await getOrCreateCart(userId);
  await db.delete(cartItems).where(eq(cartItems.cartId, cart.id as any));
  await touchCart(cart.id, { status: 'active' });
  return getCartView(userId);
}

/**
 * Dipanggil checkout setelah order dibuat. Cart berstatus `converted` tidak pernah diingatkan
 * lagi, dan token recovery lama dibuang supaya link yang tersebar tidak menghidupkan cart mati.
 */
export async function markCartConverted(userId: string) {
  const cart = await getOrCreateCart(userId);
  const now = new Date();
  await db
    .update(carts)
    .set({ status: 'converted', recoveryToken: null, lastActivityAt: now, updatedAt: now })
    .where(eq(carts.id, cart.id as any));
  return { cartId: cart.id, status: 'converted' as const };
}

function generateRecoveryToken(): string {
  return randomBytes(24).toString('base64url');
}

export interface RecoveryScanResult {
  scanned: number;
  sent: number;
  failed: number;
  skipped: number;
}

/**
 * Satu putaran scan. Tidak memakai scheduler bawaan karena paket cron belum ada di dependency.
 * Route admin `POST /admin/cart-recovery/scan` memanggil fungsi ini untuk scan manual, sedangkan
 * interval opsional dipasang di `src/index.ts` dan hanya aktif bila env
 * `CART_RECOVERY_INTERVAL_MINUTES` diisi.
 */
export async function runRecoveryScan(
  policy: AbandonmentPolicy,
  options: { now?: Date; limit?: number; baseUrl?: string } = {}
): Promise<RecoveryScanResult> {
  const now = options.now ?? new Date();
  const limit = Math.min(Math.max(Math.floor(Number(options.limit ?? 100)), 1), 500);
  const baseUrl = options.baseUrl ?? 'http://localhost:3000';

  if (!policy.enabled) {
    return { scanned: 0, sent: 0, failed: 0, skipped: 0 };
  }

  const cutoff = new Date(now.getTime() - policy.idleMinutes * 60_000);
  const candidates = await db
    .select()
    .from(carts)
    .where(and(sql`${carts.status} <> 'converted'`, lte(carts.lastActivityAt, cutoff)))
    .orderBy(asc(carts.lastActivityAt))
    .limit(limit);

  const result: RecoveryScanResult = { scanned: candidates.length, sent: 0, failed: 0, skipped: 0 };

  for (const cart of candidates) {
    const lines = await loadLines(cart.id);
    const itemCount = lines.reduce((sum, line) => sum + line.quantity, 0);
    const total = lines.reduce((sum, line) => sum + line.lineTotal, 0);

    const state = classifyCartForRecovery(
      {
        status: cart.status,
        lastActivityAt: cart.lastActivityAt,
        reminderSentAt: cart.reminderSentAt,
        reminderCount: cart.reminderCount,
        recoveredAt: cart.recoveredAt,
        itemCount,
      },
      policy,
      now
    );

    if (state !== 'reminder_due') {
      result.skipped += 1;
      continue;
    }

    const token = cart.recoveryToken ?? generateRecoveryToken();
    const link = buildRecoveryLink(baseUrl, token);

    try {
      await notify({
        userId: cart.userId,
        templateCode: 'cart.recovery',
        vars: {
          itemCount,
          cartTotal: total.toLocaleString('id-ID'),
          recoveryLink: link,
          recoveryToken: token,
        },
        data: { cartId: cart.id, recoveryToken: token, link, itemCount, total },
      });

      await db
        .update(carts)
        .set({
          status: 'abandoned',
          recoveryToken: token,
          reminderSentAt: now,
          reminderCount: Number(cart.reminderCount ?? 0) + 1,
          updatedAt: now,
        })
        .where(eq(carts.id, cart.id as any));

      result.sent += 1;
    } catch {
      // Template belum di-seed atau SMTP mati: cart tetap tercatat abandoned, tetapi counter
      // reminder tidak naik supaya percobaan berikutnya tetap dicoba.
      result.failed += 1;
    }
  }

  return result;
}

export interface RecoverCartResult {
  cartId: string;
  userId: string;
  items: CartLine[];
  itemCount: number;
  total: number;
}

/**
 * Token recovery sekali pakai. TTL dihitung dari `updatedAt` karena itulah waktu token
 * diterbitkan; setiap perubahan isi keranjang setelahnya membatalkan token lama.
 */
export async function recoverCartByToken(
  token: string,
  policy: AbandonmentPolicy,
  now: Date = new Date()
): Promise<RecoverCartResult> {
  const clean = String(token ?? '').trim();
  if (!clean) {
    throw new CartPersistenceError('Token recovery kosong', 400, 'INVALID_RECOVERY_TOKEN');
  }

  const [cart] = await db.select().from(carts).where(eq(carts.recoveryToken, clean as any)).limit(1);
  if (!cart) {
    throw new CartPersistenceError('Link pemulihan tidak dikenal atau sudah dipakai', 404, 'RECOVERY_NOT_FOUND');
  }
  if (cart.status === 'converted') {
    throw new CartPersistenceError('Keranjang ini sudah menjadi pesanan', 409, 'CART_CONVERTED');
  }
  if (isRecoveryTokenExpired(cart.updatedAt, policy, now)) {
    throw new CartPersistenceError('Link pemulihan sudah kedaluwarsa', 410, 'RECOVERY_EXPIRED');
  }

  const lines = await loadLines(cart.id);
  await db
    .update(carts)
    .set({
      status: 'active',
      recoveryToken: null,
      recoveredAt: now,
      lastActivityAt: now,
      reminderSentAt: null,
      reminderCount: 0,
      updatedAt: now,
    })
    .where(eq(carts.id, cart.id as any));

  return {
    cartId: cart.id,
    userId: cart.userId,
    items: lines,
    itemCount: lines.reduce((sum, line) => sum + line.quantity, 0),
    total: lines.reduce((sum, line) => sum + line.lineTotal, 0),
  };
}

export interface RecoveryCartRow {
  cartId: string;
  userId: string;
  email: string | null;
  fullName: string | null;
  status: string;
  lastActivityAt: Date;
  reminderCount: number;
  reminderSentAt: Date | null;
  recoveredAt: Date | null;
  itemCount: number;
  total: number;
  state: RecoveryState;
}

export async function listRecoveryCarts(
  policy: AbandonmentPolicy,
  options: { limit?: number; state?: RecoveryState | null; now?: Date } = {}
): Promise<RecoveryCartRow[]> {
  const now = options.now ?? new Date();
  const limit = Math.min(Math.max(Math.floor(Number(options.limit ?? 50)), 1), 200);

  const rows = await db
    .select({
      cart: carts,
      email: users.email,
      fullName: users.fullName,
    })
    .from(carts)
    .leftJoin(users, eq(users.id, carts.userId))
    .orderBy(asc(carts.lastActivityAt))
    .limit(limit);

  const withLines = await Promise.all(
    rows.map(async (row) => {
      const lines = await loadLines(row.cart.id);
      const itemCount = lines.reduce((sum, line) => sum + line.quantity, 0);
      const total = lines.reduce((sum, line) => sum + line.lineTotal, 0);
      const state = classifyCartForRecovery(
        {
          status: row.cart.status,
          lastActivityAt: row.cart.lastActivityAt,
          reminderSentAt: row.cart.reminderSentAt,
          reminderCount: row.cart.reminderCount,
          recoveredAt: row.cart.recoveredAt,
          itemCount,
        },
        policy,
        now
      );

      return {
        cartId: row.cart.id,
        userId: row.cart.userId,
        email: row.email,
        fullName: row.fullName,
        status: row.cart.status,
        lastActivityAt: row.cart.lastActivityAt,
        reminderCount: Number(row.cart.reminderCount ?? 0),
        reminderSentAt: row.cart.reminderSentAt ?? null,
        recoveredAt: row.cart.recoveredAt ?? null,
        itemCount,
        total,
        state,
      } satisfies RecoveryCartRow;
    })
  );

  return options.state ? withLines.filter((row) => row.state === options.state) : withLines;
}
