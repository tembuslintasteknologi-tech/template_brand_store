/**
 * Flash sale persistence (FLS-001, FLS-002, FLS-004, FLS-005, FLS-006).
 *
 * The repository owns the database shape; the rules live in flashSaleService.ts. Every
 * mutation validates through the pure helpers first, so an invalid row can never reach
 * Postgres and a partial write cannot leave a sale without items.
 */

import { db } from '../../db/index.js';
import {
  flashSaleItems,
  flashSalePurchases,
  flashSales,
  productVariants,
  products,
} from '../../db/schema.js';
import { and, asc, desc, eq, gte, inArray, sql } from 'drizzle-orm';
import {
  FlashSaleError,
  assertFlashSaleItemInput,
  assertFlashSaleTitle,
  assertFlashSaleWindow,
  evaluateFlashSalePurchase,
  flashSaleCountdown,
  flashSaleStatus,
  isPubliclyVisibleFlashSale,
  normalizeFlashSaleQuantity,
  remainingFlashStock,
  resolveFlashSalePrice,
  sortFlashSalesForLanding,
  type FlashSaleStatus,
  type FlashSaleWindow,
} from './flashSaleService.js';

export interface FlashSaleRecord {
  id: string;
  title: string;
  startAt: Date;
  endAt: Date;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateFlashSaleItemInput {
  productId: string;
  variantId?: string | null;
  discountType: string;
  discountValue: number | string;
  stock: number | string;
  perUserLimit?: number | string | null;
}

export interface CreateFlashSaleInput {
  title: string;
  startAt: Date | string;
  endAt: Date | string;
  isActive?: boolean;
  items?: CreateFlashSaleItemInput[];
}

export interface UpdateFlashSaleItemInput {
  discountType?: string;
  discountValue?: number | string;
  stock?: number | string;
  perUserLimit?: number | string | null;
}

export interface FlashSaleLineView {
  id: string;
  productId: string;
  variantId: string | null;
  productTitle: string | null;
  variantName: string | null;
  discountType: string;
  discountValue: number;
  stock: number;
  sold: number;
  perUserLimit: number | null;
  remainingStock: number;
  soldOut: boolean;
  basePrice: number;
  finalPrice: number;
  discountAmount: number;
  discountPercent: number;
}

export interface FlashSaleView {
  id: string;
  title: string;
  startAt: string;
  endAt: string;
  isActive: boolean;
  status: FlashSaleStatus;
  serverTime: string;
  startsInMs: number | null;
  endsInMs: number | null;
  remainingMs: number;
  itemCount: number;
  items: FlashSaleLineView[];
}

interface JoinedItemRow {
  item: typeof flashSaleItems.$inferSelect;
  productTitle: string | null;
  productBasePrice: string | null;
  variantName: string | null;
  variantPrice: string | null;
}

function toLineView(row: JoinedItemRow): FlashSaleLineView {
  const basePrice = Number(row.variantPrice ?? row.productBasePrice ?? 0);
  const price = resolveFlashSalePrice(basePrice, {
    discountType: row.item.discountType,
    discountValue: row.item.discountValue,
  });
  const remainingStock = remainingFlashStock(row.item);

  return {
    id: row.item.id,
    productId: row.item.productId,
    variantId: row.item.variantId,
    productTitle: row.productTitle,
    variantName: row.variantName,
    discountType: row.item.discountType,
    discountValue: Number(row.item.discountValue),
    stock: row.item.stock,
    sold: row.item.sold,
    perUserLimit: row.item.perUserLimit ?? null,
    remainingStock,
    soldOut: remainingStock === 0,
    basePrice: price.basePrice,
    finalPrice: price.finalPrice,
    discountAmount: price.discountAmount,
    discountPercent: price.discountPercent,
  };
}

function toView(
  sale: FlashSaleRecord,
  items: FlashSaleLineView[],
  now: Date
): FlashSaleView {
  const countdown = flashSaleCountdown(sale, now);
  return {
    id: sale.id,
    title: sale.title,
    startAt: sale.startAt.toISOString(),
    endAt: sale.endAt.toISOString(),
    isActive: sale.isActive,
    status: countdown.status,
    serverTime: countdown.serverTime,
    startsInMs: countdown.startsInMs,
    endsInMs: countdown.endsInMs,
    remainingMs: countdown.remainingMs,
    itemCount: items.length,
    items,
  };
}

async function loadItems(saleIds: string[]): Promise<Map<string, FlashSaleLineView[]>> {
  const grouped = new Map<string, FlashSaleLineView[]>();
  if (saleIds.length === 0) return grouped;

  const rows = (await db
    .select({
      item: flashSaleItems,
      productTitle: products.title,
      productBasePrice: products.basePrice,
      variantName: productVariants.name,
      variantPrice: productVariants.price,
    })
    .from(flashSaleItems)
    .leftJoin(products, eq(flashSaleItems.productId, products.id))
    .leftJoin(productVariants, eq(flashSaleItems.variantId, productVariants.id))
    .where(inArray(flashSaleItems.flashSaleId, saleIds))
    .orderBy(asc(flashSaleItems.createdAt))) as JoinedItemRow[];

  for (const row of rows) {
    const list = grouped.get(row.item.flashSaleId) ?? [];
    list.push(toLineView(row));
    grouped.set(row.item.flashSaleId, list);
  }
  return grouped;
}

export async function getFlashSaleRecord(id: string): Promise<FlashSaleRecord> {
  const [sale] = await db.select().from(flashSales).where(eq(flashSales.id, id)).limit(1);
  if (!sale) {
    throw new FlashSaleError('SALE_NOT_FOUND', 'Flash sale tidak ditemukan', 404);
  }
  return sale as FlashSaleRecord;
}

export async function listAdminFlashSaleViews(now: Date = new Date()): Promise<FlashSaleView[]> {
  const sales = (await db
    .select()
    .from(flashSales)
    .orderBy(desc(flashSales.createdAt))) as FlashSaleRecord[];
  const itemsBySale = await loadItems(sales.map((sale) => sale.id));
  return sales.map((sale) => toView(sale, itemsBySale.get(sale.id) ?? [], now));
}

export async function getFlashSaleView(id: string, now: Date = new Date()): Promise<FlashSaleView> {
  const sale = await getFlashSaleRecord(id);
  const itemsBySale = await loadItems([sale.id]);
  return toView(sale, itemsBySale.get(sale.id) ?? [], now);
}

/** Storefront list: only running and upcoming sales, best placement first (FLS-004). */
export async function listPublicFlashSaleViews(now: Date = new Date()): Promise<FlashSaleView[]> {
  const sales = (await db
    .select()
    .from(flashSales)
    .where(and(eq(flashSales.isActive, true), gte(flashSales.endAt, now)))) as FlashSaleRecord[];

  const visible = sortFlashSalesForLanding(
    sales.filter((sale) => isPubliclyVisibleFlashSale(sale, now)),
    now
  );
  const itemsBySale = await loadItems(visible.map((sale) => sale.id));
  return visible.map((sale) => toView(sale, itemsBySale.get(sale.id) ?? [], now));
}

async function assertItemNotDuplicated(
  executor: any,
  saleId: string,
  productId: string,
  variantId: string | null
): Promise<void> {
  const conditions = [eq(flashSaleItems.flashSaleId, saleId), eq(flashSaleItems.productId, productId)];
  if (variantId) {
    conditions.push(eq(flashSaleItems.variantId, variantId));
  } else {
    conditions.push(sql`${flashSaleItems.variantId} IS NULL`);
  }

  const [existing] = await executor
    .select({ id: flashSaleItems.id })
    .from(flashSaleItems)
    .where(and(...conditions))
    .limit(1);

  if (existing) {
    throw new FlashSaleError(
      'ITEM_ALREADY_EXISTS',
      'Produk dan varian ini sudah ada di flash sale tersebut',
      409
    );
  }
}

export async function createFlashSale(input: CreateFlashSaleInput): Promise<FlashSaleView> {
  const title = assertFlashSaleTitle(input.title);
  const { startAt, endAt } = assertFlashSaleWindow(input);
  const isActive = input.isActive !== false;

  const items = (input.items ?? []).map((item) => ({
    ...item,
    ...assertFlashSaleItemInput(item),
  }));

  const duplicateKey = new Set<string>();
  for (const item of items) {
    const key = `${item.productId}:${item.variantId ?? 'base'}`;
    if (duplicateKey.has(key)) {
      throw new FlashSaleError('ITEM_ALREADY_EXISTS', 'Ada item duplikat di payload', 409);
    }
    duplicateKey.add(key);
  }

  const sale = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(flashSales)
      .values({ title, startAt, endAt, isActive })
      .returning();

    if (items.length > 0) {
      await tx.insert(flashSaleItems).values(
        items.map((item) => ({
          flashSaleId: created.id,
          productId: item.productId,
          variantId: item.variantId ?? null,
          discountType: item.discountType,
          discountValue: item.discountValue.toString(),
          stock: item.stock,
          perUserLimit: item.perUserLimit,
        }))
      );
    }

    return created;
  });

  return getFlashSaleView(sale.id);
}

export async function updateFlashSale(
  id: string,
  patch: { title?: string; startAt?: Date | string; endAt?: Date | string; isActive?: boolean }
): Promise<FlashSaleView> {
  const current = await getFlashSaleRecord(id);

  const nextTitle = patch.title === undefined ? current.title : assertFlashSaleTitle(patch.title);
  const nextWindow = assertFlashSaleWindow({
    startAt: patch.startAt ?? current.startAt,
    endAt: patch.endAt ?? current.endAt,
    isActive: patch.isActive ?? current.isActive,
  });

  await db
    .update(flashSales)
    .set({
      title: nextTitle,
      startAt: nextWindow.startAt,
      endAt: nextWindow.endAt,
      isActive: patch.isActive ?? current.isActive,
      updatedAt: new Date(),
    })
    .where(eq(flashSales.id, id));

  return getFlashSaleView(id);
}

export async function deleteFlashSale(id: string): Promise<void> {
  await getFlashSaleRecord(id);
  await db.delete(flashSales).where(eq(flashSales.id, id));
}

export async function addFlashSaleItem(
  saleId: string,
  input: CreateFlashSaleItemInput
): Promise<FlashSaleView> {
  await getFlashSaleRecord(saleId);
  const parsed = assertFlashSaleItemInput(input);
  await assertItemNotDuplicated(db, saleId, input.productId, input.variantId ?? null);

  await db.insert(flashSaleItems).values({
    flashSaleId: saleId,
    productId: input.productId,
    variantId: input.variantId ?? null,
    discountType: parsed.discountType,
    discountValue: parsed.discountValue.toString(),
    stock: parsed.stock,
    perUserLimit: parsed.perUserLimit,
  });

  return getFlashSaleView(saleId);
}

export async function updateFlashSaleItem(
  saleId: string,
  itemId: string,
  patch: UpdateFlashSaleItemInput
): Promise<FlashSaleView> {
  await getFlashSaleRecord(saleId);
  const [current] = await db
    .select()
    .from(flashSaleItems)
    .where(and(eq(flashSaleItems.id, itemId), eq(flashSaleItems.flashSaleId, saleId)))
    .limit(1);

  if (!current) {
    throw new FlashSaleError('ITEM_NOT_FOUND', 'Item flash sale tidak ditemukan', 404);
  }

  const merged = assertFlashSaleItemInput({
    discountType: patch.discountType ?? current.discountType,
    discountValue: patch.discountValue ?? current.discountValue,
    stock: patch.stock ?? current.stock,
    perUserLimit: patch.perUserLimit === undefined ? current.perUserLimit : patch.perUserLimit,
  });

  if (merged.stock < current.sold) {
    throw new FlashSaleError(
      'INVALID_STOCK',
      `stock tidak boleh lebih kecil dari jumlah terjual (${current.sold})`
    );
  }

  await db
    .update(flashSaleItems)
    .set({
      discountType: merged.discountType,
      discountValue: merged.discountValue.toString(),
      stock: merged.stock,
      perUserLimit: merged.perUserLimit,
    })
    .where(eq(flashSaleItems.id, itemId));

  return getFlashSaleView(saleId);
}

export async function removeFlashSaleItem(saleId: string, itemId: string): Promise<FlashSaleView> {
  await getFlashSaleRecord(saleId);
  const deleted = await db
    .delete(flashSaleItems)
    .where(and(eq(flashSaleItems.id, itemId), eq(flashSaleItems.flashSaleId, saleId)))
    .returning({ id: flashSaleItems.id });

  if (deleted.length === 0) {
    throw new FlashSaleError('ITEM_NOT_FOUND', 'Item flash sale tidak ditemukan', 404);
  }

  return getFlashSaleView(saleId);
}

/** Total quantity a user already took from one flash sale line. */
export async function getPurchasedQuantity(itemId: string, userId: string): Promise<number> {
  const [row] = await db
    .select({ total: sql<number>`coalesce(sum(${flashSalePurchases.quantity}), 0)` })
    .from(flashSalePurchases)
    .where(
      and(
        eq(flashSalePurchases.flashSaleItemId, itemId),
        eq(flashSalePurchases.userId, userId)
      )
    );

  return Number(row?.total ?? 0);
}

export interface FlashSalePurchaseInput {
  flashSaleItemId: string;
  userId: string;
  quantity: number | string;
  orderId?: string | null;
  now?: Date;
}

export interface FlashSalePurchaseResult {
  item: FlashSaleLineView;
  quantity: number;
  purchasedByUser: number;
  userRemaining: number | null;
}

/**
 * Accepts a flash sale purchase (FLS-002, FLS-006).
 *
 * Two guards run before the ledger row is written:
 *   1. The pure evaluation checks window, remaining stock, and the per-user cap.
 *   2. The UPDATE uses `sold + quantity <= stock` in the WHERE clause, so two concurrent
 *      buyers cannot both pass the read-side check and oversell the allocation.
 * Both run inside one transaction, so a failed insert rolls the stock bump back.
 */
export async function recordFlashSalePurchase(
  input: FlashSalePurchaseInput
): Promise<FlashSalePurchaseResult> {
  const quantity = normalizeFlashSaleQuantity(input.quantity);
  const now = input.now ?? new Date();

  return db.transaction(async (tx) => {
    const [row] = await tx
      .select({ item: flashSaleItems, sale: flashSales })
      .from(flashSaleItems)
      .innerJoin(flashSales, eq(flashSaleItems.flashSaleId, flashSales.id))
      .where(eq(flashSaleItems.id, input.flashSaleItemId))
      .limit(1);

    if (!row) {
      throw new FlashSaleError('ITEM_NOT_FOUND', 'Item flash sale tidak ditemukan', 404);
    }

    const [purchaseAgg] = await tx
      .select({ total: sql<number>`coalesce(sum(${flashSalePurchases.quantity}), 0)` })
      .from(flashSalePurchases)
      .where(
        and(
          eq(flashSalePurchases.flashSaleItemId, input.flashSaleItemId),
          eq(flashSalePurchases.userId, input.userId)
        )
      );

    const purchasedByUser = Number(purchaseAgg?.total ?? 0);
    const decision = evaluateFlashSalePurchase({
      sale: row.sale as FlashSaleWindow,
      item: row.item,
      quantity,
      purchasedByUser,
      now,
    });

    if (!decision.allowed) {
      const status =
        decision.reason === 'OUT_OF_STOCK' || decision.reason === 'PER_USER_LIMIT_REACHED'
          ? 409
          : 403;
      throw new FlashSaleError(
        decision.reason as any,
        flashSaleRejectionMessage(decision.reason),
        status
      );
    }

    const updated = await tx
      .update(flashSaleItems)
      .set({ sold: sql`${flashSaleItems.sold} + ${quantity}` })
      .where(
        and(
          eq(flashSaleItems.id, input.flashSaleItemId),
          sql`${flashSaleItems.sold} + ${quantity} <= ${flashSaleItems.stock}`
        )
      )
      .returning();

    if (updated.length === 0) {
      throw new FlashSaleError('OUT_OF_STOCK', 'Stok flash sale sudah habis', 409);
    }

    await tx.insert(flashSalePurchases).values({
      flashSaleItemId: input.flashSaleItemId,
      userId: input.userId,
      orderId: input.orderId ?? null,
      quantity,
    });

    const [productRow] = await tx
      .select({
        item: flashSaleItems,
        productTitle: products.title,
        productBasePrice: products.basePrice,
        variantName: productVariants.name,
        variantPrice: productVariants.price,
      })
      .from(flashSaleItems)
      .leftJoin(products, eq(flashSaleItems.productId, products.id))
      .leftJoin(productVariants, eq(flashSaleItems.variantId, productVariants.id))
      .where(eq(flashSaleItems.id, input.flashSaleItemId))
      .limit(1);

    const item = productRow
      ? toLineView(productRow as JoinedItemRow)
      : toLineView({
          item: updated[0],
          productTitle: null,
          productBasePrice: null,
          variantName: null,
          variantPrice: null,
        });

    return {
      item,
      quantity,
      purchasedByUser: purchasedByUser + quantity,
      userRemaining:
        decision.userLimit === null
          ? null
          : Math.max(0, decision.userLimit - (purchasedByUser + quantity)),
    };
  });
}

function flashSaleRejectionMessage(reason: string | undefined): string {
  switch (reason) {
    case 'SALE_INACTIVE':
      return 'Flash sale sedang dinonaktifkan';
    case 'SALE_NOT_STARTED':
      return 'Flash sale belum dimulai';
    case 'SALE_ENDED':
      return 'Flash sale sudah berakhir';
    case 'OUT_OF_STOCK':
      return 'Stok flash sale sudah habis';
    case 'PER_USER_LIMIT_REACHED':
      return 'Batas pembelian per user sudah tercapai';
    default:
      return 'Flash sale tidak bisa dipakai';
  }
}

/**
 * Read-only availability check used by the storefront before checkout. It never writes, so a
 * detail page can show "sisa 3" without reserving anything.
 */
export async function checkFlashSaleAvailability(input: {
  flashSaleItemId: string;
  userId?: string | null;
  quantity: number | string;
  now?: Date;
}): Promise<{
  allowed: boolean;
  reason?: string;
  status: FlashSaleStatus;
  remainingStock: number;
  userRemaining: number | null;
  finalPrice: number | null;
}> {
  const now = input.now ?? new Date();
  const [row] = await db
    .select({ item: flashSaleItems, sale: flashSales })
    .from(flashSaleItems)
    .innerJoin(flashSales, eq(flashSaleItems.flashSaleId, flashSales.id))
    .where(eq(flashSaleItems.id, input.flashSaleItemId))
    .limit(1);

  if (!row) {
    throw new FlashSaleError('ITEM_NOT_FOUND', 'Item flash sale tidak ditemukan', 404);
  }

  const purchasedByUser = input.userId
    ? await getPurchasedQuantity(input.flashSaleItemId, input.userId)
    : 0;

  const decision = evaluateFlashSalePurchase({
    sale: row.sale as FlashSaleWindow,
    item: row.item,
    quantity: input.quantity,
    purchasedByUser,
    now,
  });

  const [priceRow] = await db
    .select({
      productBasePrice: products.basePrice,
      variantPrice: productVariants.price,
    })
    .from(flashSaleItems)
    .leftJoin(products, eq(flashSaleItems.productId, products.id))
    .leftJoin(productVariants, eq(flashSaleItems.variantId, productVariants.id))
    .where(eq(flashSaleItems.id, input.flashSaleItemId))
    .limit(1);

  const basePrice = Number(priceRow?.variantPrice ?? priceRow?.productBasePrice ?? 0);
  const price = resolveFlashSalePrice(basePrice, {
    discountType: row.item.discountType,
    discountValue: row.item.discountValue,
  });

  return {
    allowed: decision.allowed,
    reason: decision.reason,
    status: flashSaleStatus(row.sale, now),
    remainingStock: decision.remainingStock,
    userRemaining: decision.userRemaining,
    finalPrice: price.finalPrice,
  };
}
