import { Hono } from 'hono';
import { timingSafeEqual } from 'node:crypto';
import {
  DEFAULT_ALERT_THRESHOLDS,
  snapshot,
  type AlertThresholds,
} from '../services/observability/metrics.js';

export type MetricsAccessMode = 'open' | 'token' | 'disabled';

export const METRICS_TOKEN_ENV = 'METRICS_TOKEN';

/**
 * Endpoint metrik adalah target scrape internal, bukan endpoint publik.
 *
 * - `METRICS_TOKEN` diisi: wajib header `x-metrics-token` atau Bearer token.
 * - Kosong di production: endpoint dimatikan supaya statistik route tidak bocor.
 * - Kosong di development: terbuka supaya `curl localhost:3000/metrics` langsung berguna.
 */
export function metricsAccessMode(env: NodeJS.ProcessEnv = process.env): MetricsAccessMode {
  if (String(env[METRICS_TOKEN_ENV] ?? '').trim().length > 0) return 'token';
  return env.NODE_ENV === 'production' ? 'disabled' : 'open';
}

export function isValidMetricsToken(provided: string, expected: string): boolean {
  const left = Buffer.from(String(provided ?? ''), 'utf8');
  const right = Buffer.from(String(expected ?? ''), 'utf8');
  if (left.length === 0 || right.length === 0 || left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

function readToken(c: any): string {
  const direct = c.req.header('x-metrics-token');
  if (direct) return direct;
  const authorization = c.req.header('authorization') || '';
  const match = /^Bearer\s+(.+)$/i.exec(authorization);
  return match ? match[1] : '';
}

function thresholdsFromEnv(env: NodeJS.ProcessEnv = process.env): AlertThresholds {
  const parse = (value: string | undefined, fallback: number) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  };
  return {
    errorRate: parse(env.ALERT_ERROR_RATE, DEFAULT_ALERT_THRESHOLDS.errorRate),
    p95LatencyMs: parse(env.ALERT_P95_LATENCY_MS, DEFAULT_ALERT_THRESHOLDS.p95LatencyMs),
    memoryUsedPercent: parse(
      env.ALERT_MEMORY_USED_PERCENT,
      DEFAULT_ALERT_THRESHOLDS.memoryUsedPercent
    ),
    minSamples: parse(env.ALERT_MIN_SAMPLES, DEFAULT_ALERT_THRESHOLDS.minSamples),
  };
}

export const metricsRoutes = new Hono();

metricsRoutes.use('*', async (c, next) => {
  const mode = metricsAccessMode();
  if (mode === 'disabled') {
    return c.json(
      {
        success: false,
        error: {
          code: 'METRICS_DISABLED',
          message: `Set ${METRICS_TOKEN_ENV} to enable the metrics endpoint in production`,
        },
      },
      503
    );
  }
  if (mode === 'token') {
    const expected = String(process.env[METRICS_TOKEN_ENV] ?? '').trim();
    if (!isValidMetricsToken(readToken(c), expected)) {
      return c.json(
        {
          success: false,
          error: { code: 'METRICS_UNAUTHORIZED', message: 'Invalid metrics token' },
        },
        401
      );
    }
  }
  await next();
});

metricsRoutes.get('/', (c) => {
  return c.json({ success: true, data: snapshot('brand-store-api', thresholdsFromEnv()) });
});

metricsRoutes.get('/alerts', (c) => {
  const data = snapshot('brand-store-api', thresholdsFromEnv());
  return c.json({
    success: true,
    data: {
      status: data.alerts.some((alert) => alert.severity === 'critical')
        ? 'critical'
        : data.alerts.length > 0
          ? 'warning'
          : 'ok',
      alerts: data.alerts,
      evaluatedAt: new Date().toISOString(),
    },
  });
});
