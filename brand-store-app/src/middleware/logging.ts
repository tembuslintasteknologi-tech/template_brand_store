import { Context, Next } from 'hono';
import { logHttpRequest } from '../config/logger.js';

export function requestLogger() {
  return async function requestLog(c: Context, next: Next) {
    const startedAt = Date.now();
    await next();
    logHttpRequest(c.req, c.res, Date.now() - startedAt);
  };
}

/** Backwards compatible alias used by earlier call sites. */
export const pinoHttpLogger = requestLogger;
