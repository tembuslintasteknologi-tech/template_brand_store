import test, { after, before } from 'node:test';
import assert from 'node:assert';
import { Hono } from 'hono';
import { SpanKind, SpanStatusCode } from '@opentelemetry/api';
import { InMemorySpanExporter } from '@opentelemetry/sdk-trace-base';
import { tracingMiddleware } from '../middleware/tracing.js';
import {
  formatTraceparent,
  initTracing,
  isTracingInitialized,
  resolveOtlpTracesUrl,
  shutdownTracing,
} from '../services/observability/tracing.js';

const exporter = new InMemorySpanExporter();

before(() => {
  initTracing({ exporter, sampleRatio: 1, serviceName: 'brand-store-api-test' });
});

after(async () => {
  await shutdownTracing();
});

function buildApp() {
  const app = new Hono();
  app.use('*', tracingMiddleware());
  app.get('/hello', (c) => c.json({ ok: true }));
  app.get('/boom', () => {
    throw new Error('boom');
  });
  return app;
}

function isHex(value: string | null, length: number): boolean {
  return typeof value === 'string' && value.length === length && /^[0-9a-f]+$/.test(value);
}

test('initTracing idempotent dan provider terdaftar', () => {
  const first = initTracing({ exporter });
  const second = initTracing({ exporter });
  assert.strictEqual(first, second);
  assert.strictEqual(isTracingInitialized(), true);
});

test('formatTraceparent mengikuti format W3C versi 00', () => {
  const header = formatTraceparent({
    traceId: '4bf92f3577b34da6a3ce929d0e0e4736',
    spanId: '00f067aa0ba902b7',
    traceFlags: 1,
  });
  assert.strictEqual(header, '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01');
});

test('resolveOtlpTracesUrl menambahkan /v1/traces dan menghormati override', (t) => {
  const original = {
    traces: process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT,
    base: process.env.OTEL_EXPORTER_OTLP_ENDPOINT,
  };
  t.after(() => {
    if (original.traces === undefined) delete process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT;
    else process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT = original.traces;
    if (original.base === undefined) delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
    else process.env.OTEL_EXPORTER_OTLP_ENDPOINT = original.base;
  });

  delete process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT;
  delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  assert.strictEqual(resolveOtlpTracesUrl(), 'http://localhost:4318/v1/traces');

  process.env.OTEL_EXPORTER_OTLP_ENDPOINT = 'http://collector:4318/';
  assert.strictEqual(resolveOtlpTracesUrl(), 'http://collector:4318/v1/traces');

  process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT = 'http://jaeger:4318/v1/traces';
  assert.strictEqual(resolveOtlpTracesUrl(), 'http://jaeger:4318/v1/traces');
});

test('request tanpa traceparent mendapat trace ID baru dan span server', async () => {
  exporter.reset();
  const app = buildApp();
  const res = await app.request('/hello');

  assert.strictEqual(res.status, 200);
  const traceId = res.headers.get('x-trace-id');
  assert.ok(isHex(traceId, 32), `x-trace-id harus 32 hex, dapat ${traceId}`);
  assert.notStrictEqual(traceId, '0'.repeat(32));

  const traceparent = res.headers.get('traceparent');
  assert.ok(traceparent?.startsWith('00-'), 'traceparent harus versi 00');
  assert.strictEqual(traceparent?.split('-')[1], traceId);

  const spans = exporter.getFinishedSpans();
  assert.strictEqual(spans.length, 1);
  const span = spans[0];
  assert.strictEqual(span.name, 'GET /hello');
  assert.strictEqual(span.kind, SpanKind.SERVER);
  assert.strictEqual(span.spanContext().traceId, traceId);
  assert.strictEqual(span.attributes['http.request.method'], 'GET');
  assert.strictEqual(span.attributes['url.path'], '/hello');
  assert.strictEqual(span.attributes['http.response.status_code'], 200);
  assert.strictEqual(span.status.code, SpanStatusCode.UNSET);
});

test('traceparent dari upstream dipakai sebagai parent span', async () => {
  exporter.reset();
  const app = buildApp();
  const parentTraceId = '4bf92f3577b34da6a3ce929d0e0e4736';
  const parentSpanId = '00f067aa0ba902b7';

  const res = await app.request('/hello', {
    headers: { traceparent: `00-${parentTraceId}-${parentSpanId}-01` },
  });

  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.headers.get('x-trace-id'), parentTraceId);

  const spans = exporter.getFinishedSpans();
  assert.strictEqual(spans.length, 1);
  assert.strictEqual(spans[0].spanContext().traceId, parentTraceId);
  assert.strictEqual(spans[0].parentSpanId, parentSpanId);
});

test('traceparent rusak diabaikan dan diganti trace baru', async () => {
  exporter.reset();
  const app = buildApp();
  const res = await app.request('/hello', {
    headers: { traceparent: '00-not-a-trace-id-zzzz' },
  });

  const traceId = res.headers.get('x-trace-id');
  assert.ok(isHex(traceId, 32), 'harus fallback ke trace ID valid');
  assert.notStrictEqual(traceId, '0'.repeat(32));

  const spans = exporter.getFinishedSpans();
  assert.strictEqual(spans.length, 1);
  assert.strictEqual(spans[0].parentSpanId, undefined);
});

test('error yang ditangani Hono tetap menandai span ERROR', async () => {
  exporter.reset();
  const app = buildApp();

  const res = await app.request('/boom');
  assert.strictEqual(res.status, 500);

  const spans = exporter.getFinishedSpans();
  assert.strictEqual(spans.length, 1);
  assert.strictEqual(spans[0].status.code, SpanStatusCode.ERROR);
  assert.strictEqual(spans[0].attributes['http.response.status_code'], 500);
});

test('handler yang melempar error mencatat status ERROR dan exception', async () => {
  exporter.reset();
  const app = new Hono();
  app.use('*', tracingMiddleware());
  // onError yang melempar ulang memaksa error keluar dari Hono, sehingga jalur catch
  // middleware tracing ikut terlatih.
  app.onError((err) => {
    throw err;
  });
  app.get('/boom', () => {
    throw new Error('boom');
  });

  await assert.rejects(async () => {
    await app.request('/boom');
  }, /boom/);

  const spans = exporter.getFinishedSpans();
  assert.strictEqual(spans.length, 1);
  assert.strictEqual(spans[0].status.code, SpanStatusCode.ERROR);
  assert.ok(
    spans[0].events.some((event) => event.name === 'exception'),
    'span harus menyimpan event exception'
  );
});
