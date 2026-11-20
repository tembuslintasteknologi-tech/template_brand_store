import type { Context, Next } from 'hono';
import { context, propagation, SpanKind, SpanStatusCode, trace } from '@opentelemetry/api';
import {
  formatTraceparent,
  getTracer,
  TRACE_ID_HEADER,
  TRACEPARENT_HEADER,
} from '../services/observability/tracing.js';

export { TRACE_ID_HEADER, TRACEPARENT_HEADER };

/**
 * Server span untuk setiap request.
 *
 * Dipasang paling awal supaya trace ID sudah ada ketika logger, metrics, dan route berjalan.
 * Header `traceparent` dari upstream diekstrak dengan propagator W3C, jadi request yang datang
 * dari gateway tetap menjadi anak span gateway, bukan trace baru.
 *
 * `traceparent` juga dikembalikan di response supaya klien dan log aggregator bisa menyambung
 * request yang sama tanpa harus menebak dari timestamp.
 */
export function tracingMiddleware() {
  return async function tracing(c: Context, next: Next) {
    // Tracer global dipanggil per request, bukan saat modul dimuat, supaya provider yang
    // diinisialisasi setelah `createApp()` tetap terpakai.
    const tracer = getTracer();
    const method = c.req.method.toUpperCase();
    const path = c.req.path || '/';

    const parentContext = propagation.extract(context.active(), c.req.header());
    const span = tracer.startSpan(
      `${method} ${path}`,
      {
        kind: SpanKind.SERVER,
        attributes: {
          'http.request.method': method,
          'url.path': path,
          'url.scheme': new URL(c.req.url).protocol.replace(':', ''),
          'server.address': c.req.header('host') ?? undefined,
          'user_agent.original': c.req.header('user-agent') ?? undefined,
        },
      },
      parentContext
    );

    const spanContext = span.spanContext();
    c.set('traceId', spanContext.traceId);
    c.set('spanId', spanContext.spanId);
    // Ditulis sebelum `next()` karena Hono menyimpan header yang dipasang lebih awal dan
    // menyertakannya saat route membentuk Response.
    c.header(TRACE_ID_HEADER, spanContext.traceId);
    c.header(TRACEPARENT_HEADER, formatTraceparent(spanContext));

    return context.with(trace.setSpan(parentContext, span), async () => {
      try {
        await next();
        const status = c.res?.status ?? 0;
        if (status > 0) span.setAttribute('http.response.status_code', status);
        if (status >= 500) {
          span.setStatus({ code: SpanStatusCode.ERROR, message: `HTTP ${status}` });
        }
      } catch (err) {
        span.recordException(err as Error);
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: err instanceof Error ? err.message : 'unhandled error',
        });
        throw err;
      } finally {
        span.end();
      }
    });
  };
}
