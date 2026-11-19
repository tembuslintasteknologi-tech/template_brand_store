/**
 * Metrik in-process untuk four golden signals.
 *
 * Latency, traffic, errors, dan saturation dihitung tanpa dependensi eksternal supaya template
 * bisa dijalankan di mana saja. Angka ini hilang saat proses restart; untuk histori panjang
 * kirim `/metrics` ke Prometheus atau collector lain (lihat docs/OPERATIONS.md).
 */

export const LATENCY_BUCKETS_MS = [50, 100, 250, 500, 1000, 2500, 5000, 10000] as const;

export interface AlertThresholds {
  /** Rasio 5xx terhadap total request. */
  errorRate: number;
  /** Persentil 95 latency seluruh route, dalam milidetik. */
  p95LatencyMs: number;
  /** Persentase heap terpakai terhadap total heap. */
  memoryUsedPercent: number;
  /** Jumlah request minimum sebelum rasio error dianggap bermakna. */
  minSamples: number;
}

export const DEFAULT_ALERT_THRESHOLDS: AlertThresholds = {
  errorRate: 0.05,
  p95LatencyMs: 1500,
  memoryUsedPercent: 90,
  minSamples: 20,
};

interface RouteStats {
  count: number;
  errors: number;
  totalMs: number;
  maxMs: number;
  buckets: number[];
}

export interface Alert {
  signal: 'traffic' | 'latency' | 'errors' | 'saturation';
  severity: 'warning' | 'critical';
  message: string;
  value: number;
  threshold: number;
}

export interface RouteSnapshot {
  route: string;
  count: number;
  errors: number;
  errorRate: number;
  avgMs: number;
  p95Ms: number;
  maxMs: number;
}

export interface MetricsSnapshot {
  service: string;
  uptimeSeconds: number;
  totals: {
    requests: number;
    errors: number;
    errorRate: number;
    avgMs: number;
  };
  latency: {
    p50Ms: number;
    p95Ms: number;
    p99Ms: number;
    maxMs: number;
    buckets: Array<{ leMs: number; count: number }>;
  };
  saturation: {
    memoryUsedPercent: number;
    heapUsedBytes: number;
    heapTotalBytes: number;
    rssBytes: number;
  };
  routes: RouteSnapshot[];
  alerts: Alert[];
}

const globalStats: RouteStats = {
  count: 0,
  errors: 0,
  totalMs: 0,
  maxMs: 0,
  buckets: LATENCY_BUCKETS_MS.map(() => 0),
};

const routeStats = new Map<string, RouteStats>();
const startedAt = Date.now();

function emptyStats(): RouteStats {
  return {
    count: 0,
    errors: 0,
    totalMs: 0,
    maxMs: 0,
    buckets: LATENCY_BUCKETS_MS.map(() => 0),
  };
}

function bucketIndex(durationMs: number): number {
  for (let index = 0; index < LATENCY_BUCKETS_MS.length; index += 1) {
    if (durationMs <= LATENCY_BUCKETS_MS[index]) return index;
  }
  return LATENCY_BUCKETS_MS.length - 1;
}

function applySample(stats: RouteStats, status: number, durationMs: number) {
  const safeDuration = Number.isFinite(durationMs) && durationMs >= 0 ? durationMs : 0;
  stats.count += 1;
  if (status >= 500) stats.errors += 1;
  stats.totalMs += safeDuration;
  stats.maxMs = Math.max(stats.maxMs, safeDuration);
  stats.buckets[bucketIndex(safeDuration)] += 1;
}

/** Catat satu request selesai. `route` sebaiknya pola route, bukan URL mentah. */
export function recordRequest(input: { route: string; status: number; durationMs: number }): void {
  const route = String(input.route ?? 'unknown').split('?')[0] || 'unknown';
  const status = Number(input.status ?? 0);
  const durationMs = Number(input.durationMs ?? 0);

  applySample(globalStats, status, durationMs);

  const existing = routeStats.get(route);
  if (existing) {
    applySample(existing, status, durationMs);
    return;
  }
  const created = emptyStats();
  applySample(created, status, durationMs);
  routeStats.set(route, created);
}

/** Percentile dari histogram bucket (batas atas bucket terpilih). */
export function percentileFromBuckets(
  buckets: number[],
  total: number,
  percentile: number
): number {
  if (total <= 0) return 0;
  const target = Math.ceil((percentile / 100) * total);
  let cumulative = 0;
  for (let index = 0; index < buckets.length; index += 1) {
    cumulative += buckets[index];
    if (cumulative >= target) return LATENCY_BUCKETS_MS[index];
  }
  return LATENCY_BUCKETS_MS[LATENCY_BUCKETS_MS.length - 1];
}

function memorySaturation(): MetricsSnapshot['saturation'] {
  const usage = process.memoryUsage();
  const heapTotal = usage.heapTotal || 1;
  return {
    memoryUsedPercent: Number(((usage.heapUsed / heapTotal) * 100).toFixed(2)),
    heapUsedBytes: usage.heapUsed,
    heapTotalBytes: usage.heapTotal,
    rssBytes: usage.rss,
  };
}

export function evaluateAlerts(
  snapshot: Pick<MetricsSnapshot, 'totals' | 'latency' | 'saturation'>,
  thresholds: AlertThresholds = DEFAULT_ALERT_THRESHOLDS
): Alert[] {
  const alerts: Alert[] = [];

  if (snapshot.totals.requests >= thresholds.minSamples) {
    if (snapshot.totals.errorRate > thresholds.errorRate) {
      alerts.push({
        signal: 'errors',
        severity: snapshot.totals.errorRate >= thresholds.errorRate * 2 ? 'critical' : 'warning',
        message: `Error rate ${(snapshot.totals.errorRate * 100).toFixed(1)}% melewati batas ${(
          thresholds.errorRate * 100
        ).toFixed(1)}%`,
        value: snapshot.totals.errorRate,
        threshold: thresholds.errorRate,
      });
    }

    if (snapshot.latency.p95Ms > thresholds.p95LatencyMs) {
      alerts.push({
        signal: 'latency',
        severity: snapshot.latency.p95Ms >= thresholds.p95LatencyMs * 2 ? 'critical' : 'warning',
        message: `p95 latency ${snapshot.latency.p95Ms}ms melewati batas ${thresholds.p95LatencyMs}ms`,
        value: snapshot.latency.p95Ms,
        threshold: thresholds.p95LatencyMs,
      });
    }
  }

  if (snapshot.saturation.memoryUsedPercent > thresholds.memoryUsedPercent) {
    alerts.push({
      signal: 'saturation',
      severity:
        snapshot.saturation.memoryUsedPercent >= thresholds.memoryUsedPercent + 5
          ? 'critical'
          : 'warning',
      message: `Heap terpakai ${snapshot.saturation.memoryUsedPercent}% melewati batas ${thresholds.memoryUsedPercent}%`,
      value: snapshot.saturation.memoryUsedPercent,
      threshold: thresholds.memoryUsedPercent,
    });
  }

  return alerts;
}

export function snapshot(
  service = 'brand-store-api',
  thresholds: AlertThresholds = DEFAULT_ALERT_THRESHOLDS
): MetricsSnapshot {
  const total = globalStats.count;
  const saturation = memorySaturation();
  const latency = {
    p50Ms: percentileFromBuckets(globalStats.buckets, total, 50),
    p95Ms: percentileFromBuckets(globalStats.buckets, total, 95),
    p99Ms: percentileFromBuckets(globalStats.buckets, total, 99),
    maxMs: globalStats.maxMs,
    buckets: LATENCY_BUCKETS_MS.map((leMs, index) => ({
      leMs,
      count: globalStats.buckets[index],
    })),
  };
  const totals = {
    requests: total,
    errors: globalStats.errors,
    errorRate: total > 0 ? Number((globalStats.errors / total).toFixed(4)) : 0,
    avgMs: total > 0 ? Number((globalStats.totalMs / total).toFixed(2)) : 0,
  };

  const routes: RouteSnapshot[] = [...routeStats.entries()]
    .map(([route, stats]) => ({
      route,
      count: stats.count,
      errors: stats.errors,
      errorRate: stats.count > 0 ? Number((stats.errors / stats.count).toFixed(4)) : 0,
      avgMs: stats.count > 0 ? Number((stats.totalMs / stats.count).toFixed(2)) : 0,
      p95Ms: percentileFromBuckets(stats.buckets, stats.count, 95),
      maxMs: stats.maxMs,
    }))
    .sort((left, right) => right.count - left.count);

  return {
    service,
    uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
    totals,
    latency,
    saturation,
    routes,
    alerts: evaluateAlerts({ totals, latency, saturation }, thresholds),
  };
}

/** Hanya untuk test: mengosongkan akumulator tanpa mengubah waktu mulai proses. */
export function resetMetrics(): void {
  globalStats.count = 0;
  globalStats.errors = 0;
  globalStats.totalMs = 0;
  globalStats.maxMs = 0;
  globalStats.buckets = LATENCY_BUCKETS_MS.map(() => 0);
  routeStats.clear();
}
