import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { authMiddleware } from '../middleware/auth.js';
import { resolveBranchAccess } from '../services/branch/branchScope.js';
import {
  ChatError,
  appendMessage,
  claimConversation,
  closeConversation,
  countOpenConversations,
  createConversation,
  getChatHours,
  getConversationForStaff,
  getConversationForUser,
  listConversationQueue,
  listConversationsForUser,
  listMessages,
  markConversationRead,
} from '../services/chat/chatService.js';
import { realtimeHub } from '../services/realtime/realtimeService.js';

export const chatRoutes = new Hono();
chatRoutes.use('*', authMiddleware);

export const chatAdminRoutes = new Hono();
chatAdminRoutes.use('*', authMiddleware);

interface ChatUser {
  id: string;
  role?: string;
  branchId?: string | null;
  branch_id?: string | null;
  email?: string;
}

function actorOf(c: any): ChatUser {
  return c.get('user') as ChatUser;
}

function isStaff(user: ChatUser): boolean {
  return user.role === 'admin' || user.role === 'branch_admin';
}

/**
 * Branch admin hanya boleh menyentuh percakapan cabangnya. Middleware `adminOnlyMiddleware` di
 * route lain hanya menerima role `admin`, jadi chat memakai `resolveBranchAccess` langsung
 * supaya `branch_admin` bisa ikut menangani antrean cabangnya sendiri (BR-002).
 */
function staffScope(c: any): { ok: true; branchIds: string[] | null } | { ok: false; response: Response } {
  const user = actorOf(c);
  if (user.role === 'admin') {
    return { ok: true, branchIds: null };
  }
  const decision = resolveBranchAccess(user, null);
  if (!decision.allowed) {
    return {
      ok: false,
      response: c.json({ success: false, error: { code: decision.code, message: decision.message } }, decision.status),
    };
  }
  return { ok: true, branchIds: decision.branchId ? [decision.branchId] : [] };
}

function chatFail(c: any, err: any) {
  if (err instanceof ChatError) {
    return c.json({ success: false, error: { code: err.code, message: err.message } }, err.status as any);
  }
  const status = Number((err as any)?.status) || 500;
  const code = (err as any)?.code ?? 'CHAT_ERROR';
  return c.json({ success: false, error: { code, message: err?.message ?? 'chat failed' } }, status as any);
}

// ---------------------------------------------------------------------------
// CUSTOMER
// ---------------------------------------------------------------------------

// GET /api/v1/chat/hours?branchId= - jam operasional yang berlaku untuk cabang itu
chatRoutes.get('/hours', async (c) => {
  try {
    const branchId = c.req.query('branchId') ?? null;
    const hours = await getChatHours(branchId);
    return c.json({ success: true, data: hours });
  } catch (err: any) {
    return chatFail(c, err);
  }
});

// GET /api/v1/chat/conversations
chatRoutes.get('/conversations', async (c) => {
  try {
    const user = actorOf(c);
    const page = await listConversationsForUser(user.id, {
      limit: Number(c.req.query('limit') ?? 20),
      cursor: c.req.query('cursor'),
      status: (c.req.query('status') as any) ?? null,
    });
    return c.json({ success: true, data: page.items, page: { nextCursor: page.nextCursor, hasMore: page.hasMore, limit: page.limit } });
  } catch (err: any) {
    return chatFail(c, err);
  }
});

// POST /api/v1/chat/conversations - buat percakapan, cabang dipilih otomatis
chatRoutes.post('/conversations', async (c) => {
  try {
    const user = actorOf(c);
    const body = await c.req.json().catch(() => ({}));
    const conversation = await createConversation({
      userId: user.id,
      subject: body?.subject ?? null,
      productId: body?.productId ?? null,
      requestedBranchId: body?.branchId ?? null,
      firstMessage: body?.message ?? null,
    });
    const hours = await getChatHours(conversation.branchId);
    return c.json({ success: true, data: { ...conversation, hours } }, 201);
  } catch (err: any) {
    return chatFail(c, err);
  }
});

// GET /api/v1/chat/conversations/:id
chatRoutes.get('/conversations/:id', async (c) => {
  try {
    const user = actorOf(c);
    const conversation = await getConversationForUser(c.req.param('id'), user.id);
    const messages = await listMessages(conversation.id, { limit: Number(c.req.query('limit') ?? 20), cursor: c.req.query('cursor') });
    return c.json({
      success: true,
      data: { ...conversation, messages: messages.items },
      page: { nextCursor: messages.nextCursor, hasMore: messages.hasMore, limit: messages.limit },
    });
  } catch (err: any) {
    return chatFail(c, err);
  }
});

// GET /api/v1/chat/conversations/:id/messages?cursor=&after=
chatRoutes.get('/conversations/:id/messages', async (c) => {
  try {
    const user = actorOf(c);
    const conversation = await getConversationForUser(c.req.param('id'), user.id);
    const page = await listMessages(conversation.id, {
      limit: Number(c.req.query('limit') ?? 20),
      cursor: c.req.query('cursor'),
      after: c.req.query('after'),
    });
    return c.json({ success: true, data: page.items, page: { nextCursor: page.nextCursor, hasMore: page.hasMore, limit: page.limit } });
  } catch (err: any) {
    return chatFail(c, err);
  }
});

// POST /api/v1/chat/conversations/:id/messages
chatRoutes.post('/conversations/:id/messages', async (c) => {
  try {
    const user = actorOf(c);
    const conversation = await getConversationForUser(c.req.param('id'), user.id);
    const body = await c.req.json().catch(() => ({}));
    const message = await appendMessage({
      conversationId: conversation.id,
      senderId: user.id,
      senderRole: 'customer',
      body: body?.body ?? body?.message ?? '',
    });
    return c.json({ success: true, data: message }, 201);
  } catch (err: any) {
    return chatFail(c, err);
  }
});

// POST /api/v1/chat/conversations/:id/read
chatRoutes.post('/conversations/:id/read', async (c) => {
  try {
    const user = actorOf(c);
    const conversation = await getConversationForUser(c.req.param('id'), user.id);
    const result = await markConversationRead(conversation.id, 'customer');
    return c.json({ success: true, data: result });
  } catch (err: any) {
    return chatFail(c, err);
  }
});

// POST /api/v1/chat/conversations/:id/close
chatRoutes.post('/conversations/:id/close', async (c) => {
  try {
    const user = actorOf(c);
    const conversation = await getConversationForUser(c.req.param('id'), user.id);
    const row = await closeConversation(conversation.id, { id: user.id, role: user.role ?? 'customer' });
    return c.json({ success: true, data: row });
  } catch (err: any) {
    return chatFail(c, err);
  }
});

// GET /api/v1/chat/stream - satu stream per user, bukan per percakapan
chatRoutes.get('/stream', async (c) => {
  const user = actorOf(c);
  const channel = `chat:user:${user.id}`;

  return streamSSE(c, async (stream) => {
    let open = true;

    const send = async (event: string, data: unknown) => {
      if (!open) return;
      try {
        await stream.writeSSE({ event, data: JSON.stringify(data), id: String(Date.now()) });
      } catch {
        open = false;
      }
    };

    await send('open', { channel: 'customer', userId: user.id, at: new Date().toISOString() });

    const listener = (payload: any) => {
      void send('chat', payload);
    };
    realtimeHub.on(channel, listener);

    // Heartbeat supaya proxy yang memutus koneksi idle tidak menutup stream tanpa jejak.
    const heartbeat = setInterval(() => {
      void send('ping', { at: new Date().toISOString() });
    }, 25_000);
    if (typeof (heartbeat as any).unref === 'function') (heartbeat as any).unref();

    await new Promise<void>((resolve) => {
      stream.onAbort(() => {
        open = false;
        clearInterval(heartbeat);
        realtimeHub.off(channel, listener);
        resolve();
      });
    });
  });
});

// ---------------------------------------------------------------------------
// ADMIN / BRANCH ADMIN
// ---------------------------------------------------------------------------

// GET /api/v1/admin/chat/queue
chatAdminRoutes.get('/queue', async (c) => {
  try {
    const scope = staffScope(c);
    if (!scope.ok) return scope.response;

    const requestedBranch = c.req.query('branchId') ?? null;
    if (requestedBranch && Array.isArray(scope.branchIds) && !scope.branchIds.includes(requestedBranch)) {
      return c.json(
        { success: false, error: { code: 'BRANCH_SCOPE_MISMATCH', message: 'branch_admin hanya bisa melihat cabangnya sendiri' } },
        403
      );
    }

    const page = await listConversationQueue({
      branchId: requestedBranch,
      branchIds: scope.branchIds,
      includeClosed: c.req.query('includeClosed') === 'true',
      limit: Number(c.req.query('limit') ?? 20),
      cursor: c.req.query('cursor'),
    });

    const openCount = await countOpenConversations(scope.branchIds);
    return c.json({
      success: true,
      data: page.items,
      page: { nextCursor: page.nextCursor, hasMore: page.hasMore, limit: page.limit },
      summary: { openConversations: openCount },
    });
  } catch (err: any) {
    return chatFail(c, err);
  }
});

// GET /api/v1/admin/chat/conversations/:id
chatAdminRoutes.get('/conversations/:id', async (c) => {
  try {
    const scope = staffScope(c);
    if (!scope.ok) return scope.response;

    const conversation = await getConversationForStaff(c.req.param('id'), scope.branchIds);

    const messages = await listMessages(conversation.id, {
      limit: Number(c.req.query('limit') ?? 50),
      cursor: c.req.query('cursor'),
    });
    return c.json({
      success: true,
      data: { ...conversation, messages: messages.items },
      page: { nextCursor: messages.nextCursor, hasMore: messages.hasMore, limit: messages.limit },
    });
  } catch (err: any) {
    return chatFail(c, err);
  }
});

// GET /api/v1/admin/chat/conversations/:id/messages
chatAdminRoutes.get('/conversations/:id/messages', async (c) => {
  try {
    const scope = staffScope(c);
    if (!scope.ok) return scope.response;

    const conversation = await getConversationForStaff(c.req.param('id'), scope.branchIds);

    const messages = await listMessages(conversation.id, {
      limit: Number(c.req.query('limit') ?? 50),
      cursor: c.req.query('cursor'),
      after: c.req.query('after'),
    });
    return c.json({
      success: true,
      data: messages.items,
      page: { nextCursor: messages.nextCursor, hasMore: messages.hasMore, limit: messages.limit },
    });
  } catch (err: any) {
    return chatFail(c, err);
  }
});

// POST /api/v1/admin/chat/conversations/:id/claim
chatAdminRoutes.post('/conversations/:id/claim', async (c) => {
  try {
    const scope = staffScope(c);
    if (!scope.ok) return scope.response;
    const user = actorOf(c);

    // Cek cakupan sebelum mutasi supaya branch_admin tidak bisa "mengklaim lalu ditolak",
    // yang meninggalkan percakapan cabang lain sudah berubah statusnya.
    await getConversationForStaff(c.req.param('id'), scope.branchIds);
    const row = await claimConversation(c.req.param('id'), user.id);
    return c.json({ success: true, data: row });
  } catch (err: any) {
    return chatFail(c, err);
  }
});

// POST /api/v1/admin/chat/conversations/:id/messages
chatAdminRoutes.post('/conversations/:id/messages', async (c) => {
  try {
    const scope = staffScope(c);
    if (!scope.ok) return scope.response;
    const user = actorOf(c);

    const conversation = await getConversationForStaff(c.req.param('id'), scope.branchIds);

    const body = await c.req.json().catch(() => ({}));
    const message = await appendMessage({
      conversationId: conversation.id,
      senderId: user.id,
      senderRole: (user.role === 'branch_admin' ? 'branch_admin' : 'admin') as any,
      body: body?.body ?? body?.message ?? '',
    });
    return c.json({ success: true, data: message }, 201);
  } catch (err: any) {
    return chatFail(c, err);
  }
});

// POST /api/v1/admin/chat/conversations/:id/read
chatAdminRoutes.post('/conversations/:id/read', async (c) => {
  try {
    const scope = staffScope(c);
    if (!scope.ok) return scope.response;

    const conversation = await getConversationForStaff(c.req.param('id'), scope.branchIds);

    const result = await markConversationRead(conversation.id, 'admin');
    return c.json({ success: true, data: result });
  } catch (err: any) {
    return chatFail(c, err);
  }
});

// POST /api/v1/admin/chat/conversations/:id/close
chatAdminRoutes.post('/conversations/:id/close', async (c) => {
  try {
    const scope = staffScope(c);
    if (!scope.ok) return scope.response;
    const user = actorOf(c);

    const conversation = await getConversationForStaff(c.req.param('id'), scope.branchIds);

    const row = await closeConversation(conversation.id, { id: user.id, role: user.role ?? 'admin' });
    return c.json({ success: true, data: row });
  } catch (err: any) {
    return chatFail(c, err);
  }
});

// GET /api/v1/admin/chat/stream - admin pusat menerima semua, branch_admin hanya cabangnya
chatAdminRoutes.get('/stream', async (c) => {
  const scope = staffScope(c);
  if (!scope.ok) return scope.response;

  const channels = ['chat:admin'];
  return streamSSE(c, async (stream) => {
    let open = true;

    const send = async (event: string, data: unknown) => {
      if (!open) return;
      try {
        await stream.writeSSE({ event, data: JSON.stringify(data), id: String(Date.now()) });
      } catch {
        open = false;
      }
    };

    await send('open', { channel: 'admin', branchIds: scope.branchIds, at: new Date().toISOString() });

    const listener = (payload: any) => {
      if (Array.isArray(scope.branchIds)) {
        if (!payload?.branchId || !scope.branchIds.includes(payload.branchId)) return;
      }
      void send('chat', payload);
    };

    for (const channel of channels) realtimeHub.on(channel, listener);

    const heartbeat = setInterval(() => {
      void send('ping', { at: new Date().toISOString() });
    }, 25_000);
    if (typeof (heartbeat as any).unref === 'function') (heartbeat as any).unref();

    await new Promise<void>((resolve) => {
      stream.onAbort(() => {
        open = false;
        clearInterval(heartbeat);
        for (const channel of channels) realtimeHub.off(channel, listener);
        resolve();
      });
    });
  });
});
