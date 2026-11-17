/**
 * Live chat customer ke admin atau cabang.
 *
 * Tiga keputusan yang tertanam di modul ini:
 * 1. Satu percakapan diarahkan ke satu cabang, dipilih sekali saat percakapan dibuat, lalu
 *    disimpan di `chat_conversations.branch_id`. Kalau nanti stok berubah, rute percakapan
 *    lama tidak ikut berpindah, karena memindahkan riwayat chat di tengah jalan membingungkan
 *    baik customer maupun admin yang sedang menangani.
 * 2. `routingReason` menyimpan alasan pemilihan cabang, jadi pertanyaan "kenapa chat ini masuk
 *    ke cabang A" bisa dijawab tanpa menebak isi stok pada saat itu.
 * 3. Pengiriman pesan tidak lewat WebSocket. Transportnya SSE untuk server ke client plus REST
 *    POST untuk client ke server, karena Hono sudah punya `streamSSE`, jalur REST otomatis
 *    mendapat auth, rate limit, dan audit yang sama dengan endpoint lain, dan tidak perlu
 *    menjaga state koneksi dua arah di server yang bisa di-scale horizontal.
 */

import { and, desc, eq, gt, lt, or, sql } from 'drizzle-orm';
import { db } from '../../db/index.js';
import {
  branchInventory,
  chatConversations,
  chatMessages,
  productVariants,
  products,
  storeLocations,
  users,
} from '../../db/schema.js';
import {
  buildCursorPage,
  clampPageSize,
  decodeCursor,
  encodeCursor,
  type CursorValue,
} from '../../utils/pagination.js';
import { describeChatHours, resolveChatSchedule, type ChatHoursState, type ChatSchedule } from './chatHours.js';
import { getSettingValue } from '../config/settings.js';
import { realtimeHub } from '../realtime/realtimeService.js';

export class ChatError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(message: string, status = 400, code = 'CHAT_ERROR') {
    super(message);
    this.name = 'ChatError';
    this.status = status;
    this.code = code;
  }
}

export type ChatStatus = 'open' | 'assigned' | 'closed';
export type ChatSenderRole = 'customer' | 'branch_admin' | 'admin' | 'system';
export type RoutingReason =
  | 'explicit_branch'
  | 'product_stock'
  | 'default_branch'
  | 'fallback_pusat'
  | 'unrouted';

export const MAX_MESSAGE_LENGTH = 4000;
export const MAX_SUBJECT_LENGTH = 200;

export interface BranchStockRow {
  branchId: string;
  available: number;
}

/**
 * Memilih cabang dengan stok tersedia terbanyak. Fungsi murni supaya aturan pemilihan bisa
 * diuji tanpa database: cabang tanpa stok tidak pernah menang, dan seri diputus oleh urutan
 * masukan yang sudah deterministik dari query.
 */
export function rankBranchesByStock(rows: BranchStockRow[]): BranchStockRow[] {
  return rows
    .filter((row) => Number.isFinite(row.available) && row.available > 0)
    .sort((a, b) => b.available - a.available);
}

export interface ResolveBranchInput {
  requestedBranchId?: string | null;
  stockRows?: BranchStockRow[];
  pusatBranchId?: string | null;
  firstBranchId?: string | null;
}

export interface ResolveBranchResult {
  branchId: string | null;
  reason: RoutingReason;
}

/**
 * Urutan prioritas: pilihan eksplisit customer, cabang yang benar-benar memegang stok produk,
 * cabang pusat, cabang mana pun yang ada, lalu tanpa cabang. `unrouted` bukan kegagalan: chat
 * tetap masuk antrean pusat dan admin bisa mengarahkan manual.
 */
export function resolveChatBranch(input: ResolveBranchInput): ResolveBranchResult {
  if (input.requestedBranchId) {
    return { branchId: input.requestedBranchId, reason: 'explicit_branch' };
  }

  const ranked = rankBranchesByStock(input.stockRows ?? []);
  if (ranked.length > 0) {
    return { branchId: ranked[0].branchId, reason: 'product_stock' };
  }

  if (input.pusatBranchId) {
    return { branchId: input.pusatBranchId, reason: 'default_branch' };
  }

  if (input.firstBranchId) {
    return { branchId: input.firstBranchId, reason: 'fallback_pusat' };
  }

  return { branchId: null, reason: 'unrouted' };
}

/** Stok tersedia per cabang untuk satu produk, dijumlahkan dari seluruh variannya. */
export async function loadProductStockByBranch(productId: string): Promise<BranchStockRow[]> {
  const rows = await db
    .select({
      branchId: branchInventory.branchId,
      stock: branchInventory.stock,
      reserved: branchInventory.reservedStock,
    })
    .from(branchInventory)
    .innerJoin(productVariants, eq(productVariants.id, branchInventory.variantId))
    .where(eq(productVariants.productId, productId as any));

  const totals = new Map<string, number>();
  for (const row of rows) {
    const available = Number(row.stock ?? 0) - Number(row.reserved ?? 0);
    totals.set(row.branchId, (totals.get(row.branchId) ?? 0) + available);
  }

  return [...totals.entries()].map(([branchId, available]) => ({ branchId, available }));
}

async function loadBranchFallbacks(): Promise<{ pusatBranchId: string | null; firstBranchId: string | null }> {
  const rows = await db
    .select({ id: storeLocations.id, type: storeLocations.type })
    .from(storeLocations)
    .orderBy(storeLocations.name);

  const pusat = rows.find((row) => row.type === 'pusat');
  return { pusatBranchId: pusat?.id ?? null, firstBranchId: rows[0]?.id ?? null };
}

export interface ResolveBranchForChatInput {
  userId: string;
  productId?: string | null;
  requestedBranchId?: string | null;
}

export async function resolveBranchForChat(input: ResolveBranchForChatInput): Promise<ResolveBranchResult> {
  if (input.requestedBranchId) {
    const [branch] = await db
      .select({ id: storeLocations.id })
      .from(storeLocations)
      .where(eq(storeLocations.id, input.requestedBranchId as any))
      .limit(1);
    if (!branch) {
      throw new ChatError(`Cabang tidak ditemukan: ${input.requestedBranchId}`, 404, 'BRANCH_NOT_FOUND');
    }
    return { branchId: branch.id, reason: 'explicit_branch' };
  }

  const stockRows = input.productId ? await loadProductStockByBranch(input.productId) : [];
  const fallbacks = await loadBranchFallbacks();
  return resolveChatBranch({ stockRows, ...fallbacks });
}

async function loadBranchSchedule(branchId: string | null): Promise<ChatSchedule> {
  const globalSchedule = await getSettingValue<unknown>('chat.hours', null);
  if (!branchId) return resolveChatSchedule(null, globalSchedule);

  const [branch] = await db
    .select({ operatingHours: storeLocations.operatingHours })
    .from(storeLocations)
    .where(eq(storeLocations.id, branchId as any))
    .limit(1);

  return resolveChatSchedule(branch?.operatingHours, globalSchedule);
}

export async function getChatHours(branchId: string | null, at: Date = new Date()): Promise<ChatHoursState> {
  const schedule = await loadBranchSchedule(branchId);
  return describeChatHours(schedule, at);
}

/** Dipakai saat membuat pesan system "di luar jam operasional" agar teksnya tidak dikarang route. */
export async function getChatScheduleForBranch(branchId: string | null): Promise<ChatSchedule> {
  return loadBranchSchedule(branchId);
}

function olderThanPairs(
  createdAtColumn: any,
  idColumn: any,
  cursor: CursorValue | null
) {
  if (!cursor) return undefined;
  const at = new Date(cursor.createdAt);
  return or(lt(createdAtColumn, at), and(eq(createdAtColumn, at), lt(idColumn, cursor.id)));
}

function pairPage<T extends { id: string }>(
  rows: T[],
  limit: number,
  cursorRow: (row: T) => { createdAt: Date | string | null; id: string | null }
) {
  const size = clampPageSize(limit);
  const hasMore = rows.length > size;
  const window = hasMore ? rows.slice(0, size) : rows;
  const last = window[window.length - 1];
  const nextCursor = hasMore && last ? encodeCursor(cursorRow(last)) : null;
  return { items: window, nextCursor, hasMore, limit: size };
}

export interface CreateConversationInput {
  userId: string;
  subject?: string | null;
  productId?: string | null;
  requestedBranchId?: string | null;
  firstMessage?: string | null;
}

export async function createConversation(input: CreateConversationInput) {
  const [user] = await db
    .select({ id: users.id, role: users.role })
    .from(users)
    .where(eq(users.id, input.userId as any))
    .limit(1);

  if (!user) {
    throw new ChatError('User tidak ditemukan untuk percakapan ini', 404, 'USER_NOT_FOUND');
  }

  if (input.productId) {
    const [product] = await db
      .select({ id: products.id })
      .from(products)
      .where(eq(products.id, input.productId as any))
      .limit(1);
    if (!product) {
      throw new ChatError(`Produk tidak ditemukan: ${input.productId}`, 404, 'PRODUCT_NOT_FOUND');
    }
  }

  const routing = await resolveBranchForChat({
    userId: input.userId,
    productId: input.productId ?? null,
    requestedBranchId: input.requestedBranchId ?? null,
  });

  const now = new Date();
  const [conversation] = await db
    .insert(chatConversations)
    .values({
      userId: input.userId as any,
      branchId: (routing.branchId ?? null) as any,
      productId: (input.productId ?? null) as any,
      subject: input.subject ? String(input.subject).slice(0, MAX_SUBJECT_LENGTH) : null,
      status: 'open',
      routingReason: routing.reason,
      lastMessageAt: now,
      updatedAt: now,
    })
    .returning();

  if (input.firstMessage && String(input.firstMessage).trim()) {
    await appendMessage({
      conversationId: conversation.id,
      senderId: input.userId,
      senderRole: 'customer',
      body: String(input.firstMessage),
    });
  }

  return conversation;
}

export async function listConversationsForUser(
  userId: string,
  options: { limit?: number; cursor?: unknown; status?: ChatStatus | null } = {}
) {
  const limit = clampPageSize(options.limit);
  const cursor = decodeCursor(options.cursor);

  const filters: any[] = [eq(chatConversations.userId, userId as any)];
  if (options.status) filters.push(eq(chatConversations.status, options.status));
  const cursorFilter = olderThanPairs(chatConversations.lastMessageAt, chatConversations.id, cursor);
  if (cursorFilter) filters.push(cursorFilter);

  const rows = await db
    .select()
    .from(chatConversations)
    .where(and(...filters))
    .orderBy(desc(chatConversations.lastMessageAt), desc(chatConversations.id))
    .limit(limit + 1);

  return pairPage(rows, limit, (row) => ({ createdAt: row.lastMessageAt, id: row.id }));
}

export async function getConversationForUser(conversationId: string, userId: string) {
  const [row] = await db
    .select()
    .from(chatConversations)
    .where(eq(chatConversations.id, conversationId as any))
    .limit(1);

  if (!row) {
    throw new ChatError(`Percakapan tidak ditemukan: ${conversationId}`, 404, 'CONVERSATION_NOT_FOUND');
  }
  if (row.userId !== userId) {
    throw new ChatError('Percakapan ini bukan milik akun Anda', 403, 'CONVERSATION_FORBIDDEN');
  }
  return row;
}

/**
 * Guard untuk staf. `branchIds === null` berarti admin pusat dan boleh melihat semuanya.
 * `branchIds` kosong berarti akun cabang tanpa cabang yang valid, jadi tidak boleh apa pun.
 */
export async function getConversationForStaff(conversationId: string, branchIds: string[] | null) {
  const [row] = await db
    .select()
    .from(chatConversations)
    .where(eq(chatConversations.id, conversationId as any))
    .limit(1);

  if (!row) {
    throw new ChatError(`Percakapan tidak ditemukan: ${conversationId}`, 404, 'CONVERSATION_NOT_FOUND');
  }

  if (branchIds !== null) {
    if (branchIds.length === 0 || !row.branchId || !branchIds.includes(row.branchId)) {
      throw new ChatError('Percakapan ini bukan milik cabang Anda', 403, 'CONVERSATION_FORBIDDEN');
    }
  }

  return row;
}

export async function listMessages(
  conversationId: string,
  options: { limit?: number; cursor?: unknown; after?: unknown } = {}
) {
  const limit = clampPageSize(options.limit);

  // `after` dipakai klien yang baru reconnect SSE: ambil pesan baru tanpa mengunduh ulang
  // seluruh riwayat. Ia memakai id pesan terakhir yang sudah dilihat, bukan timestamp, supaya
  // dua pesan pada detik yang sama tidak saling menimpa.
  if (options.after) {
    const [anchor] = await db
      .select({ createdAt: chatMessages.createdAt })
      .from(chatMessages)
      .where(eq(chatMessages.id, String(options.after) as any))
      .limit(1);

    if (!anchor) {
      throw new ChatError('Pesan acuan untuk parameter after tidak ditemukan', 400, 'INVALID_AFTER');
    }

    const rows = await db
      .select()
      .from(chatMessages)
      .where(and(eq(chatMessages.conversationId, conversationId as any), gt(chatMessages.createdAt, anchor.createdAt)))
      .orderBy(chatMessages.createdAt, chatMessages.id)
      .limit(limit);

    return { items: rows, nextCursor: null, hasMore: false, limit };
  }

  const cursor = decodeCursor(options.cursor);
  const filters: any[] = [eq(chatMessages.conversationId, conversationId as any)];
  const cursorFilter = olderThanPairs(chatMessages.createdAt, chatMessages.id, cursor);
  if (cursorFilter) filters.push(cursorFilter);

  const rows = await db
    .select()
    .from(chatMessages)
    .where(and(...filters))
    .orderBy(desc(chatMessages.createdAt), desc(chatMessages.id))
    .limit(limit + 1);

  return pairPage(rows, limit, (row) => ({ createdAt: row.createdAt, id: row.id }));
}

export interface AppendMessageInput {
  conversationId: string;
  senderId: string | null;
  senderRole: ChatSenderRole;
  body: string;
}

export async function appendMessage(input: AppendMessageInput) {
  const body = String(input.body ?? '').trim();
  if (!body) {
    throw new ChatError('Isi pesan tidak boleh kosong', 400, 'EMPTY_MESSAGE');
  }
  if (body.length > MAX_MESSAGE_LENGTH) {
    throw new ChatError(`Pesan maksimal ${MAX_MESSAGE_LENGTH} karakter`, 400, 'MESSAGE_TOO_LONG');
  }

  const [conversation] = await db
    .select()
    .from(chatConversations)
    .where(eq(chatConversations.id, input.conversationId as any))
    .limit(1);

  if (!conversation) {
    throw new ChatError(`Percakapan tidak ditemukan: ${input.conversationId}`, 404, 'CONVERSATION_NOT_FOUND');
  }
  if (conversation.status === 'closed') {
    throw new ChatError('Percakapan sudah ditutup. Buat percakapan baru untuk melanjutkan.', 409, 'CONVERSATION_CLOSED');
  }

  const now = new Date();
  const [message] = await db
    .insert(chatMessages)
    .values({
      conversationId: input.conversationId as any,
      senderId: (input.senderId ?? null) as any,
      senderRole: input.senderRole,
      body,
    })
    .returning();

  await db
    .update(chatConversations)
    .set({
      lastMessageAt: now,
      updatedAt: now,
      // Pesan pertama dari admin memindahkan percakapan dari antrean ke status ditangani.
      ...(input.senderRole !== 'customer' && conversation.status === 'open'
        ? { status: 'assigned', assignedTo: input.senderId as any }
        : {}),
    })
    .where(eq(chatConversations.id, input.conversationId as any));

  realtimeHub.broadcastChat({
    conversationId: conversation.id,
    branchId: conversation.branchId,
    userId: conversation.userId,
    message: {
      id: message.id,
      conversationId: message.conversationId,
      senderId: message.senderId,
      senderRole: message.senderRole,
      body: message.body,
      createdAt: message.createdAt,
    },
  });

  return message;
}

/** Menandai pesan lawan bicara sebagai sudah dibaca. Aman dipanggil berulang. */
export async function markConversationRead(conversationId: string, viewerRole: ChatSenderRole) {
  const [conversation] = await db
    .select({ id: chatConversations.id })
    .from(chatConversations)
    .where(eq(chatConversations.id, conversationId as any))
    .limit(1);
  if (!conversation) {
    throw new ChatError(`Percakapan tidak ditemukan: ${conversationId}`, 404, 'CONVERSATION_NOT_FOUND');
  }

  const rows = await db
    .update(chatMessages)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(chatMessages.conversationId, conversationId as any),
        sql`${chatMessages.readAt} IS NULL`,
        viewerRole === 'customer' ? sql`${chatMessages.senderRole} <> 'customer'` : eq(chatMessages.senderRole, 'customer')
      )
    )
    .returning({ id: chatMessages.id });

  return { marked: rows.length };
}

export async function closeConversation(conversationId: string, actor: { id: string; role: string }) {
  const [conversation] = await db
    .select()
    .from(chatConversations)
    .where(eq(chatConversations.id, conversationId as any))
    .limit(1);

  if (!conversation) {
    throw new ChatError(`Percakapan tidak ditemukan: ${conversationId}`, 404, 'CONVERSATION_NOT_FOUND');
  }

  const isStaff = actor.role === 'admin' || actor.role === 'branch_admin';
  if (!isStaff && conversation.userId !== actor.id) {
    throw new ChatError('Percakapan ini bukan milik akun Anda', 403, 'CONVERSATION_FORBIDDEN');
  }
  if (conversation.status === 'closed') {
    return conversation;
  }

  const now = new Date();
  const [row] = await db
    .update(chatConversations)
    .set({ status: 'closed', closedAt: now, updatedAt: now })
    .where(eq(chatConversations.id, conversationId as any))
    .returning();

  realtimeHub.broadcastChat({
    conversationId: conversation.id,
    branchId: conversation.branchId,
    userId: conversation.userId,
    event: 'conversation_closed',
  });

  return row;
}

export async function claimConversation(conversationId: string, actorId: string) {
  const [conversation] = await db
    .select()
    .from(chatConversations)
    .where(eq(chatConversations.id, conversationId as any))
    .limit(1);

  if (!conversation) {
    throw new ChatError(`Percakapan tidak ditemukan: ${conversationId}`, 404, 'CONVERSATION_NOT_FOUND');
  }
  if (conversation.status === 'closed') {
    throw new ChatError('Percakapan sudah ditutup', 409, 'CONVERSATION_CLOSED');
  }
  if (conversation.assignedTo && conversation.assignedTo !== actorId) {
    throw new ChatError('Percakapan ini sedang ditangani admin lain', 409, 'CONVERSATION_TAKEN');
  }

  const now = new Date();
  const [row] = await db
    .update(chatConversations)
    .set({ assignedTo: actorId as any, status: 'assigned', updatedAt: now })
    .where(eq(chatConversations.id, conversationId as any))
    .returning();

  return row;
}

export interface QueueFilter {
  branchId?: string | null;
  branchIds?: string[] | null;
  includeClosed?: boolean;
  limit?: number;
  cursor?: unknown;
}

/**
 * Antrean admin. `branch_admin` hanya melihat cabangnya sendiri, `admin` pusat melihat semua.
 * `branchIds` kosong berarti tidak ada cabang yang boleh dilihat, jadi hasilnya kosong, bukan
 * seluruh antrean.
 */
export async function listConversationQueue(options: QueueFilter = {}) {
  const limit = clampPageSize(options.limit);
  const cursor = decodeCursor(options.cursor);

  const filters: any[] = [];
  if (!options.includeClosed) {
    filters.push(sql`${chatConversations.status} <> 'closed'`);
  }
  if (options.branchId) {
    filters.push(eq(chatConversations.branchId, options.branchId as any));
  } else if (Array.isArray(options.branchIds)) {
    if (options.branchIds.length === 0) {
      return { items: [], nextCursor: null, hasMore: false, limit };
    }
    filters.push(sql`${chatConversations.branchId} IN ${options.branchIds}`);
  }

  const cursorFilter = olderThanPairs(chatConversations.lastMessageAt, chatConversations.id, cursor);
  if (cursorFilter) filters.push(cursorFilter);

  const rows = await db
    .select({
      conversation: chatConversations,
      customerEmail: users.email,
      customerName: users.fullName,
      branchName: storeLocations.name,
    })
    .from(chatConversations)
    .leftJoin(users, eq(users.id, chatConversations.userId))
    .leftJoin(storeLocations, eq(storeLocations.id, chatConversations.branchId))
    .where(filters.length > 0 ? and(...filters) : undefined)
    .orderBy(desc(chatConversations.lastMessageAt), desc(chatConversations.id))
    .limit(limit + 1);

  return pairPage(
    rows.map((row) => ({
      ...row.conversation,
      customerEmail: row.customerEmail,
      customerName: row.customerName,
      branchName: row.branchName,
    })),
    limit,
    (row) => ({ createdAt: row.lastMessageAt, id: row.id })
  );
}

export async function countOpenConversations(branchIds: string[] | null = null): Promise<number> {
  const filters: any[] = [sql`${chatConversations.status} <> 'closed'`];
  if (branchIds) {
    if (branchIds.length === 0) return 0;
    filters.push(sql`${chatConversations.branchId} IN ${branchIds}`);
  }

  const [row] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(chatConversations)
    .where(and(...filters));

  return Number(row?.total ?? 0);
}
