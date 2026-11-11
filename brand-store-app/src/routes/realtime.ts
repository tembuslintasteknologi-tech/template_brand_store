import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { realtimeHub } from '../services/realtime/realtimeService.js';

const realtimeRoutes = new Hono();

realtimeRoutes.get('/orders/:orderId/stream', async (c) => {
  const orderId = c.req.param('orderId');

  return streamSSE(c, async (stream) => {
    await stream.writeSSE({
      data: JSON.stringify({ type: 'CONNECTED', orderId }),
      event: 'open',
      id: String(Date.now()),
    });

    const listener = async (data: any) => {
      await stream.writeSSE({
        data: JSON.stringify(data),
        event: 'order_status_update',
        id: String(Date.now()),
      });
    };

    realtimeHub.on(`order:${orderId}`, listener);

    // Keep connection alive / wait until client disconnects
    await new Promise<void>((resolve) => {
      stream.onAbort(() => {
        realtimeHub.off(`order:${orderId}`, listener);
        resolve();
      });
    });
  });
});

export { realtimeRoutes };
