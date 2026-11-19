import test, { beforeEach } from 'node:test';
import assert from 'node:assert';
import { Hono } from 'hono';
import {
  DEFAULT_ALERT_THRESHOLDS,
  LATENCY_BUCKETS_MS,
  evaluateAlerts,
  percentileFromBuckets,
  recordRequest,
  resetMetrics,
  snapshot,
} from '../services/observability/metrics.js';
import { metricsMiddleware } from '../middleware/metrics.js';
import { isValidMetricsToken, metricsAccessMode, metricsRoutes } from '../routes/metrics.js';

beforeEach(() => {
  resetMetrics();
});

test('records traffic, errors, and latency per route', () => {
  recordRequest({ route: '/api/v1/products', status: 200, durationMs: 20 });
  recordRequest({ route: '/api/v1/products', status: 200, durationMs: 40 });
  recordRequest({ route: '/api/v1/products', status: 503, durationMs: 900 });
  recordRequest({ route: '/health', status: 200, durationMs: 5 });

  const data = snapshot();

  assert.strictEqual(data.totals.requests, 4);
  assert.strictEqual(data.totals.errors, 1);
  assert.strictEqual(data.totals.errorRate, 0.25);
  assert.strictEqual(data.routes.length, 2);

  const products = data.routes.find((route) => route.route === '/api/v1/products');
  assert.ok(products);
  assert.strictEqual(products.count, 3);
  assert.strictEqual(products.errors, 1);
  assert.ok(products.avgMs > 0);
  assert.strictEqual(products.maxMs, 900);
});

test('percentileFromBuckets picks the bucket upper bound', () => {
  const buckets = LATENCY_BUCKETS_MS.map(() => 0);
  const start = LATENCY_BUCKETS_MS.indexOf(250);
  buckets[start] = 95;
  buckets[LATENCY_BUCKETS_MS.length - 1] = 5;

  assert.strictEqual(percentileFromBuckets(buckets, 100, 50), 250);
  assert.strictEqual(percentileFromBuckets(buckets, 100, 95), 250);
  assert.strictEqual(percentileFromBuckets(buckets, 100, 99), LATENCY_BUCKETS_MS.at(-1));
  assert.strictEqual(percentileFromBuckets(buckets, 0, 95), 0);
});

test('snapshot carries all four golden signals', () => {
  recordRequest({ route: '/api/v1/cart', status: 200, durationMs: 15 });
  const data = snapshot();

  assert.ok(data.totals.requests >= 1);
  assert.ok(data.latency.p95Ms > 0);
  assert.ok(Array.isArray(data.latency.buckets));
  assert.ok(data.saturation.memoryUsedPercent >= 0);
  assert.ok(data.saturation.heapTotalBytes > 0);
  assert.ok(Array.isArray(data.alerts));
});

test('evaluateAlerts stays quiet below the minimum sample count', () => {
  const alerts = evaluateAlerts({
    totals: { requests: 5, errors: 5, errorRate: 1, avgMs: 10 },
    latency: { p50Ms: 10, p95Ms: 9000, p99Ms: 9000, maxMs: 9000, buckets: [] },
    saturation: { memoryUsedPercent: 10, heapUsedBytes: 1, heapTotalBytes: 10, rssBytes: 10 },
  });

  assert.deepStrictEqual(alerts, []);
});

test('evaluateAlerts raises errors, latency, and saturation above threshold', () => {
  const alerts = evaluateAlerts({
    totals: { requests: 100, errors: 30, errorRate: 0.3, avgMs: 1200 },
    latency: { p50Ms: 500, p95Ms: 4000, p99Ms: 6000, maxMs: 6000, buckets: [] },
    saturation: { memoryUsedPercent: 99, heapUsedBytes: 1, heapTotalBytes: 10, rssBytes: 10 },
  });

  const signals = alerts.map((alert) => alert.signal).sort();
  assert.deepStrictEqual(signals, ['errors', 'latency', 'saturation']);
  assert.ok(alerts.every((alert) => alert.value > alert.threshold));
});

test('default thresholds are documented values', () => {
  assert.strictEqual(DEFAULT_ALERT_THRESHOLDS.errorRate, 0.05);
  assert.strictEqual(DEFAULT_ALERT_THRESHOLDS.p95LatencyMs, 1500);
  assert.strictEqual(DEFAULT_ALERT_THRESHOLDS.memoryUsedPercent, 90);
});

test('metricsMiddleware records the resolved route pattern', async () => {
  const app = new Hono();
  app.use('*', metricsMiddleware());
  app.get('/orders/:id', (c) => c.json({ id: c.req.param('id') }));

  await app.request('/orders/abc');
  await app.request('/orders/def');

  const data = snapshot();
  assert.strictEqual(data.totals.requests, 2);
  assert.strictEqual(data.routes[0].route, '/orders/:id');
});

test('metricsAccessMode disables the endpoint in production without a token', () => {
  assert.strictEqual(metricsAccessMode({}), 'open');
  assert.strictEqual(metricsAccessMode({ NODE_ENV: 'development' }), 'open');
  assert.strictEqual(metricsAccessMode({ NODE_ENV: 'production' }), 'disabled');
  assert.strictEqual(
    metricsAccessMode({ NODE_ENV: 'production', METRICS_TOKEN: 'rahasia' }),
    'token'
  );
});

test('isValidMetricsToken compares the full token', () => {
  assert.strictEqual(isValidMetricsToken('abc', 'abc'), true);
  assert.strictEqual(isValidMetricsToken('abc', 'abd'), false);
  assert.strictEqual(isValidMetricsToken('', 'abc'), false);
  assert.strictEqual(isValidMetricsToken('abc', ''), false);
});

test('GET /metrics returns a snapshot when no token is configured', async () => {
  const app = new Hono();
  app.route('/metrics', metricsRoutes);
  recordRequest({ route: '/api/v1/products', status: 200, durationMs: 12 });

  const res = await app.request('/metrics');
  const body = (await res.json()) as any;

  assert.strictEqual(res.status, 200);
  assert.strictEqual(body.success, true);
  assert.strictEqual(body.data.service, 'brand-store-api');
  assert.ok(body.data.totals.requests >= 1);
});

test('GET /metrics/alerts exposes the alert decision', async () => {
  const app = new Hono();
  app.route('/metrics', metricsRoutes);

  const res = await app.request('/metrics/alerts');
  const body = (await res.json()) as any;

  assert.strictEqual(res.status, 200);
  assert.ok(['ok', 'warning', 'critical'].includes(body.data.status));
  assert.ok(Array.isArray(body.data.alerts));
});
