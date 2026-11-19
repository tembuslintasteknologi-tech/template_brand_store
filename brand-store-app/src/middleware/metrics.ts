import { Context, Next } from 'hono';
import { recordRequest } from '../services/observability/metrics.js';

/**
 * Mencatat four golden signals untuk setiap request.
 *
 * `routePath` dipakai kalau tersedia supaya kartu metrik tidak pecah per ID (/orders/123 dan
 * /orders/456 harus jadi satu baris). Fallback ke path mentah untuk route yang tidak cocok.
 */
export function metricsMiddleware() {
  return async function metrics(c: Context, next: Next) {
    const startedAt = process.hrtime.bigint();
    let failed = false;

    try {
      await next();
    } catch (err) {
      failed = true;
      throw err;
    } finally {
      const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
      const route = (c.req as any).routePath || c.req.path || 'unknown';
      const status = failed ? 500 : (c.res?.status ?? 500);
      recordRequest({ route, status, durationMs });
    }
  };
}
