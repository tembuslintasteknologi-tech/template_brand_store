import { Context, Next } from 'hono';
import { logger } from '../config/logger.js';
import { randomUUID } from 'crypto';

export async function correlationIdMiddleware(c: Context, next: Next) {
  const existingId = c.req.header('x-request-id');
  const requestId = existingId || randomUUID();

  c.set('requestId', requestId);
  c.header('X-Request-ID', requestId);

  const start = Date.now();
  await next();
  const duration = Date.now() - start;

  logger.info({
    requestId,
    method: c.req.method,
    path: c.req.path,
    status: c.res.status,
    durationMs: duration,
  }, 'HTTP Request processed');
}
