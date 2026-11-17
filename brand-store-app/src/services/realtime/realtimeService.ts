import { EventEmitter } from 'node:events';

export interface ChatBroadcast {
  conversationId: string;
  branchId?: string | null;
  userId?: string | null;
  event?: 'message' | 'conversation_closed' | 'conversation_assigned';
  message?: Record<string, unknown>;
}

export interface TypingBroadcast {
  conversationId: string;
  branchId?: string | null;
  /** Pemilik percakapan, dipakai sebagai kanal tujuan saat yang mengetik adalah staf. */
  userId?: string | null;
  /** Siapa yang mengetik, supaya stream miliknya sendiri bisa mengabaikan event ini. */
  actorId: string;
  actorRole: 'customer' | 'admin' | 'branch_admin';
  state: 'start' | 'stop';
  expiresAt?: string | null;
}

export interface PresenceBroadcast {
  branchId?: string | null;
  userId: string;
  role: string;
  label?: string | null;
  status: 'online' | 'away' | 'offline';
  lastSeenAt?: string | null;
}

class RealtimeHub extends EventEmitter {
  broadcastOrderStatus(orderId: string, status: string, trackingNumber?: string) {
    this.emit(`order:${orderId}`, { orderId, status, trackingNumber, updatedAt: new Date() });
  }

  broadcastGlobal(event: string, payload: any) {
    this.emit(event, payload);
  }

  /**
   * Satu pesan chat disiarkan ke tiga kanal: pelanggan pemilik percakapan, cabang yang
   * menanganinya, dan kanal admin pusat. SSE handler tinggal berlangganan kanal yang relevan
   * dengan perannya, jadi tidak perlu memfilter cabang di sisi klien.
   */
  broadcastChat(input: ChatBroadcast) {
    const payload = {
      conversationId: input.conversationId,
      branchId: input.branchId ?? null,
      event: input.event ?? 'message',
      message: input.message ?? null,
      updatedAt: new Date(),
    };

    if (input.userId) this.emit(`chat:user:${input.userId}`, payload);
    if (input.branchId) this.emit(`chat:branch:${input.branchId}`, payload);
    this.emit('chat:admin', payload);
  }

  /**
   * Indikator mengetik tidak di-echo ke pengirim. Pelanggan yang mengetik disiarkan ke kanal
   * cabang dan admin pusat, sedangkan staf yang mengetik juga disiarkan ke kanal pelanggan
   * pemilik percakapan. Setiap stream tetap menyaring `actorId` miliknya sendiri sebagai
   * pengaman kedua, jadi tidak ada klien yang menerima gemanya sendiri.
   */
  broadcastTyping(input: TypingBroadcast) {
    const payload = {
      conversationId: input.conversationId,
      branchId: input.branchId ?? null,
      actorId: input.actorId,
      actorRole: input.actorRole,
      event: 'typing' as const,
      typingState: input.state,
      expiresAt: input.expiresAt ?? null,
      updatedAt: new Date(),
    };

    if (input.actorRole === 'customer') {
      if (input.branchId) this.emit(`chat:branch:${input.branchId}`, payload);
      this.emit('chat:admin', payload);
      return;
    }

    if (input.userId) this.emit(`chat:user:${input.userId}`, payload);
    if (input.branchId) this.emit(`chat:branch:${input.branchId}`, payload);
    this.emit('chat:admin', payload);
  }

  /**
   * Perubahan kehadiran agen. Hanya disiarkan saat status berubah, bukan tiap heartbeat, supaya
   * stream tidak dibanjiri event yang isinya sama. `branchId` ikut dikirim karena listener admin
   * menyaring payload tanpa cabang yang cocok dengan cakupannya.
   */
  broadcastPresence(input: PresenceBroadcast) {
    const payload = {
      branchId: input.branchId ?? null,
      userId: input.userId,
      role: input.role,
      label: input.label ?? null,
      status: input.status,
      lastSeenAt: input.lastSeenAt ?? null,
      event: 'presence' as const,
      updatedAt: new Date(),
    };

    if (input.branchId) this.emit(`chat:branch:${input.branchId}`, payload);
    this.emit('chat:admin', payload);
  }
}

export const realtimeHub = new RealtimeHub();
