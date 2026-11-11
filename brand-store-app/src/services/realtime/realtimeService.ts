import { EventEmitter } from 'node:events';

class RealtimeHub extends EventEmitter {
  broadcastOrderStatus(orderId: string, status: string, trackingNumber?: string) {
    this.emit(`order:${orderId}`, { orderId, status, trackingNumber, updatedAt: new Date() });
  }

  broadcastGlobal(event: string, payload: any) {
    this.emit(event, payload);
  }
}

export const realtimeHub = new RealtimeHub();
