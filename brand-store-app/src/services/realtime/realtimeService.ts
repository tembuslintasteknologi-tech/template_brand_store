import { EventEmitter } from 'node:events';

export interface ChatBroadcast {
  conversationId: string;
  branchId?: string | null;
  userId?: string | null;
  event?: 'message' | 'conversation_closed' | 'conversation_assigned';
  message?: Record<string, unknown>;
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
}

export const realtimeHub = new RealtimeHub();
