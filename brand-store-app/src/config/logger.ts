import { maskPii, redactUrl, sanitizeLogMeta } from '../services/security/piiMasker.js';

function write(level: string, sink: (...args: unknown[]) => void, msg: string, meta?: unknown) {
  const safeMessage = maskPii(msg);
  if (meta === undefined) {
    sink(`[${level}] ${safeMessage}`);
    return;
  }
  sink(`[${level}] ${safeMessage}`, sanitizeLogMeta(meta));
}

export const logger = {
  info: (msg: string, meta?: any) => write('INFO', console.log, msg, meta),
  error: (msg: string, meta?: any) => write('ERROR', console.error, msg, meta),
  warn: (msg: string, meta?: any) => write('WARN', console.warn, msg, meta),
  debug: (msg: string, meta?: any) => write('DEBUG', console.debug, msg, meta),
};

/**
 * Satu baris per request. URL diredaksi dulu karena query string sering membawa email,
 * nomor HP, atau token reset yang tidak boleh masuk log aggregator.
 */
export function logHttpRequest(req: any, res: any, responseTime: number) {
  const method = String(req?.method ?? 'GET').toUpperCase();
  const url = redactUrl(String(req?.url ?? ''));
  const status = Number(res?.status ?? 0);
  console.log(`[HTTP] ${method} ${url} - ${status} (${responseTime}ms)`);
}
