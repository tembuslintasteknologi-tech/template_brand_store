/**
 * OpenTelemetry tracing untuk brand store API.
 *
 * Tracer selalu dibuat, termasuk saat `OTEL_ENABLED` tidak diset. Alasannya: trace ID dipakai
 * untuk korelasi log (`x-trace-id`) walaupun tidak ada collector yang menerima span. Tanpa
 * provider nyata, `trace.getTracer()` mengembalikan noop tracer dan setiap trace ID jadi
 * `0000...`, sehingga log tidak bisa disambungkan ke request.
 *
 * Export span ke collector hanya aktif saat `OTEL_ENABLED=true`. Endpoint OTLP HTTP mengikuti
 * konvensi standar (`OTEL_EXPORTER_OTLP_TRACES_ENDPOINT` menang atas
 * `OTEL_EXPORTER_OTLP_ENDPOINT`), default ke Jaeger/collector lokal di port 4318.
 */

import { context, propagation, trace, type Tracer } from '@opentelemetry/api';
import {
  CompositePropagator,
  W3CBaggagePropagator,
  W3CTraceContextPropagator,
} from '@opentelemetry/core';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { Resource } from '@opentelemetry/resources';
import {
  BatchSpanProcessor,
  ParentBasedSampler,
  SimpleSpanProcessor,
  TraceIdRatioBasedSampler,
  type SpanExporter,
  type SpanProcessor,
} from '@opentelemetry/sdk-trace-base';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';

export const TRACER_NAME = 'brand-store-api';
export const TRACE_ID_HEADER = 'x-trace-id';
export const TRACEPARENT_HEADER = 'traceparent';

const DEFAULT_SERVICE_NAME = 'brand-store-api';
const DEFAULT_SERVICE_VERSION = '2.0.0';
const DEFAULT_OTLP_BASE_URL = 'http://localhost:4318';

export interface TracingInitOptions {
  /** Paksa aktif/nonaktif, menimpa `OTEL_ENABLED`. */
  enabled?: boolean;
  serviceName?: string;
  serviceVersion?: string;
  /** Rasio sampling root span, 0 sampai 1. Default dari env atau 1. */
  sampleRatio?: number;
  /** Exporter eksplisit, dipakai test dengan `InMemorySpanExporter`. */
  exporter?: SpanExporter;
  /** Processor eksplisit; menang atas `exporter`. */
  spanProcessor?: SpanProcessor;
}

let provider: NodeTracerProvider | undefined;

export function isTracingInitialized(): boolean {
  return provider !== undefined;
}

function readEnabledFlag(): boolean {
  const raw = (process.env.OTEL_ENABLED ?? '').trim().toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on';
}

function readSampleRatio(explicit?: number): number {
  const candidate = explicit ?? Number.parseFloat(process.env.OTEL_TRACES_SAMPLER_ARG ?? '');
  if (!Number.isFinite(candidate)) return 1;
  return Math.min(1, Math.max(0, candidate));
}

/** URL OTLP HTTP lengkap, selalu berakhiran `/v1/traces`. */
export function resolveOtlpTracesUrl(): string {
  const explicit = process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT?.trim();
  const base = explicit || process.env.OTEL_EXPORTER_OTLP_ENDPOINT?.trim() || DEFAULT_OTLP_BASE_URL;
  const trimmed = base.replace(/\/+$/, '');
  return trimmed.endsWith('/v1/traces') ? trimmed : `${trimmed}/v1/traces`;
}

/** Header OTLP dalam format `key=value,key2=value2`. */
function parseOtlpHeaders(raw?: string): Record<string, string> | undefined {
  if (!raw) return undefined;
  const headers: Record<string, string> = {};
  for (const pair of raw.split(',')) {
    const separator = pair.indexOf('=');
    if (separator <= 0) continue;
    const key = pair.slice(0, separator).trim();
    const value = pair.slice(separator + 1).trim();
    if (key) headers[key] = value;
  }
  return Object.keys(headers).length > 0 ? headers : undefined;
}

function buildSpanProcessors(enabled: boolean, options: TracingInitOptions): SpanProcessor[] {
  if (options.spanProcessor) return [options.spanProcessor];
  if (options.exporter) return [new SimpleSpanProcessor(options.exporter)];
  if (!enabled) return [];

  const exporter = new OTLPTraceExporter({
    url: resolveOtlpTracesUrl(),
    headers: parseOtlpHeaders(process.env.OTEL_EXPORTER_OTLP_HEADERS),
  });
  return [new BatchSpanProcessor(exporter)];
}

/**
 * Inisialisasi global tracer provider. Idempotent: pemanggilan kedua mengembalikan provider
 * yang sama supaya test dan hot reload tidak mendaftarkan provider ganda.
 */
export function initTracing(options: TracingInitOptions = {}): NodeTracerProvider {
  if (provider) return provider;

  const enabled = options.enabled ?? readEnabledFlag();
  const resource = new Resource({
    'service.name': options.serviceName ?? process.env.OTEL_SERVICE_NAME ?? DEFAULT_SERVICE_NAME,
    'service.version':
      options.serviceVersion ?? process.env.OTEL_SERVICE_VERSION ?? DEFAULT_SERVICE_VERSION,
    'deployment.environment':
      process.env.DEPLOYMENT_ENVIRONMENT ?? process.env.NODE_ENV ?? 'development',
  });

  const sampler = new ParentBasedSampler({
    root: new TraceIdRatioBasedSampler(readSampleRatio(options.sampleRatio)),
  });

  provider = new NodeTracerProvider({
    resource,
    sampler,
    spanProcessors: buildSpanProcessors(enabled, options),
  });

  provider.register({
    propagator: new CompositePropagator({
      propagators: [new W3CTraceContextPropagator(), new W3CBaggagePropagator()],
    }),
  });

  return provider;
}

/** Flush dan hentikan provider. Aman dipanggil walau tracing belum pernah diinisialisasi. */
export async function shutdownTracing(): Promise<void> {
  const current = provider;
  if (!current) return;
  provider = undefined;
  await current.shutdown();
  trace.disable();
  propagation.disable();
  context.disable();
}

/** Tracer global. Noop sebelum `initTracing()` dipanggil. */
export function getTracer(): Tracer {
  return trace.getTracer(TRACER_NAME);
}

/**
 * Format header W3C `traceparent` dari span context aktif.
 * Versi `00`, flag sampled mengikuti bit terakhir traceFlags.
 */
export function formatTraceparent(spanContext: {
  traceId: string;
  spanId: string;
  traceFlags: number;
}): string {
  const flags = (spanContext.traceFlags & 0x01).toString(16).padStart(2, '0');
  return `00-${spanContext.traceId}-${spanContext.spanId}-${flags}`;
}
