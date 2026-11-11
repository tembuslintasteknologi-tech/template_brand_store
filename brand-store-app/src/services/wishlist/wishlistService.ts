import { z } from 'zod';
import { db } from '../../db/index.js';
import { notifications, products, wishlists } from '../../db/schema.js';
import { and, eq } from 'drizzle-orm';
import { sendPush } from '../notifications/pushService.js';

export class WishlistError extends Error {
  readonly status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = 'WishlistError';
    this.status = status;
  }
}

export const wishlistAddSchema = z.object({
  productId: z.string().uuid(),
  notifyPriceDrop: z.boolean().optional(),
  notifyBackInStock: z.boolean().optional(),
});

export const wishlistPreferenceSchema = z.object({
  notifyPriceDrop: z.boolean().optional(),
  notifyBackInStock: z.boolean().optional(),
});

export interface PriceDropInput {
  notifyPriceDrop?: boolean | null;
  lastNotifiedPrice?: string | number | null;
}

/**
 * Price drop fires only when the price actually moves down and the customer has
 * not already been told about this exact price. That guards against re-sending
 * the same alert on every catalog sync.
 */
export function shouldNotifyPriceDrop(
  item: PriceDropInput,
  previousPrice: number,
  currentPrice: number
): boolean {
  if (item.notifyPriceDrop === false) return false;
  if (!Number.isFinite(previousPrice) || !Number.isFinite(currentPrice)) return false;
  if (currentPrice >= previousPrice) return false;

  const last = item.lastNotifiedPrice === null || item.lastNotifiedPrice === undefined
    ? null
    : Number(item.lastNotifiedPrice);
  if (last !== null && Number.isFinite(last) && Math.abs(last - currentPrice) < 0.005) return false;

  return true;
}

export interface BackInStockInput {
  notifyBackInStock?: boolean | null;
}

export function shouldNotifyBackInStock(item: BackInStockInput, previousStock: number, currentStock: number): boolean {
  if (item.notifyBackInStock === false) return false;
  return previousStock <= 0 && currentStock > 0;
}

export function formatPrice(value: number | string): string {
  const amount = Number(value ?? 0);
  return `Rp ${Math.round(amount).toLocaleString('id-ID')}`;
}

export function discountPercent(previousPrice: number, currentPrice: number): number {
  if (!Number.isFinite(previousPrice) || previousPrice <= 0) return 0;
  if (currentPrice >= previousPrice) return 0;
  return Math.round(((previousPrice - currentPrice) / previousPrice) * 100);
}

export function dedupeProductIds(ids: string[]): string[] {
  return [...new Set(ids.filter((id) => typeof id === 'string' && id.length > 0))];
}

export async function listWishlist(userId: string) {
  return db
    .select({
      id: wishlists.id,
      productId: wishlists.productId,
      createdAt: wishlists.createdAt,
      notifyPriceDrop: wishlists.notifyPriceDrop,
      notifyBackInStock: wishlists.notifyBackInStock,
      lastNotifiedPrice: wishlists.lastNotifiedPrice,
      title: products.title,
      slug: products.slug,
      basePrice: products.basePrice,
      compareAtPrice: products.compareAtPrice,
      stock: products.stock,
      status: products.status,
      images: products.images,
    })
    .from(wishlists)
    .leftJoin(products, eq(products.id, wishlists.productId))
    .where(eq(wishlists.userId, userId as any));
}

export async function addToWishlist(userId: string, input: unknown) {
  const parsed = wishlistAddSchema.parse(input);

  const [product] = await db
    .select({ id: products.id })
    .from(products)
    .where(eq(products.id, parsed.productId as any))
    .limit(1);
  if (!product) throw new WishlistError('Produk tidak ditemukan', 404);

  const [row] = await db
    .insert(wishlists)
    .values({
      userId: userId as any,
      productId: parsed.productId as any,
      notifyPriceDrop: parsed.notifyPriceDrop ?? true,
      notifyBackInStock: parsed.notifyBackInStock ?? true,
    })
    .onConflictDoUpdate({
      target: [wishlists.userId, wishlists.productId],
      set: {
        notifyPriceDrop: parsed.notifyPriceDrop ?? true,
        notifyBackInStock: parsed.notifyBackInStock ?? true,
      },
    })
    .returning();

  return row;
}

export async function removeFromWishlist(userId: string, productId: string) {
  const [row] = await db
    .delete(wishlists)
    .where(and(eq(wishlists.userId, userId as any), eq(wishlists.productId, productId as any)))
    .returning({ id: wishlists.id });
  return Boolean(row);
}

export async function updateWishlistPreferences(userId: string, productId: string, input: unknown) {
  const parsed = wishlistPreferenceSchema.parse(input);

  const [existing] = await db
    .select()
    .from(wishlists)
    .where(and(eq(wishlists.userId, userId as any), eq(wishlists.productId, productId as any)))
    .limit(1);
  if (!existing) throw new WishlistError('Produk tidak ada di wishlist', 404);

  const [row] = await db
    .update(wishlists)
    .set({
      notifyPriceDrop: parsed.notifyPriceDrop ?? existing.notifyPriceDrop,
      notifyBackInStock: parsed.notifyBackInStock ?? existing.notifyBackInStock,
    })
    .where(eq(wishlists.id, existing.id as any))
    .returning();

  return row;
}

async function deliverWishlistAlert(input: {
  userId: string;
  templateCode: string;
  title: string;
  body: string;
  deepLink: string;
  data: Record<string, unknown>;
}) {
  const [row] = await db
    .insert(notifications)
    .values({
      userId: input.userId as any,
      templateCode: input.templateCode,
      channel: 'in_app',
      category: 'promo',
      title: input.title,
      body: input.body,
      deepLink: input.deepLink,
      data: input.data as any,
      deliveryStatus: 'delivered',
      isRead: false,
    })
    .returning();

  const push = await sendPush(input.userId, input.title, input.body, {
    ...input.data,
    templateCode: input.templateCode,
    deepLink: input.deepLink,
  }).catch(() => ({ sent: false as const, reason: 'push_error' }));

  return { notification: row, push };
}

export async function notifyPriceDrop(productId: string, previousPrice: number, currentPrice: number) {
  const [product] = await db
    .select({ id: products.id, title: products.title, slug: products.slug })
    .from(products)
    .where(eq(products.id, productId as any))
    .limit(1);
  if (!product) throw new WishlistError('Produk tidak ditemukan', 404);

  const watchers = await db
    .select({
      id: wishlists.id,
      userId: wishlists.userId,
      notifyPriceDrop: wishlists.notifyPriceDrop,
      lastNotifiedPrice: wishlists.lastNotifiedPrice,
    })
    .from(wishlists)
    .where(eq(wishlists.productId, productId as any));

  const targeted = watchers.filter((row) => shouldNotifyPriceDrop(row, previousPrice, currentPrice));
  const percent = discountPercent(previousPrice, currentPrice);

  const deliveries = [];
  for (const watcher of targeted) {
    const delivery = await deliverWishlistAlert({
      userId: String(watcher.userId),
      templateCode: 'wishlist.price_drop',
      title: `Harga ${product.title} turun ${percent}%`,
      body: `Sekarang ${formatPrice(currentPrice)}, sebelumnya ${formatPrice(previousPrice)}.`,
      deepLink: `/products/${product.slug}`,
      data: { productId, previousPrice, currentPrice, discountPercent: percent },
    });

    await db
      .update(wishlists)
      .set({ lastNotifiedPrice: String(currentPrice) as any })
      .where(eq(wishlists.id, watcher.id as any));

    deliveries.push({ userId: String(watcher.userId), ...delivery });
  }

  return { productId, notified: deliveries.length, deliveries };
}

export async function notifyBackInStock(productId: string, previousStock: number, currentStock: number) {
  const [product] = await db
    .select({ id: products.id, title: products.title, slug: products.slug, stock: products.stock })
    .from(products)
    .where(eq(products.id, productId as any))
    .limit(1);
  if (!product) throw new WishlistError('Produk tidak ditemukan', 404);

  if (!shouldNotifyBackInStock({ notifyBackInStock: true }, previousStock, currentStock)) {
    return { productId, notified: 0, deliveries: [] };
  }

  const watchers = await db
    .select({
      id: wishlists.id,
      userId: wishlists.userId,
      notifyBackInStock: wishlists.notifyBackInStock,
      lastBackInStockNotifiedAt: wishlists.lastBackInStockNotifiedAt,
    })
    .from(wishlists)
    .where(eq(wishlists.productId, productId as any));

  const targeted = watchers.filter((row) => shouldNotifyBackInStock(row, previousStock, currentStock));

  const deliveries = [];
  for (const watcher of targeted) {
    const delivery = await deliverWishlistAlert({
      userId: String(watcher.userId),
      templateCode: 'wishlist.back_in_stock',
      title: `${product.title} sudah tersedia lagi`,
      body: `Stok bertambah ${currentStock}. Pesan sekarang sebelum habis.`,
      deepLink: `/products/${product.slug}`,
      data: { productId, stock: currentStock },
    });

    await db
      .update(wishlists)
      .set({ lastBackInStockNotifiedAt: new Date() })
      .where(eq(wishlists.id, watcher.id as any));

    deliveries.push({ userId: String(watcher.userId), ...delivery });
  }

  return { productId, notified: deliveries.length, deliveries };
}
