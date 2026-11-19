import { Context, Next } from 'hono';
import { randomUUID } from 'node:crypto';
import { ensureRedisConnected } from '../config/redis.js';

export type RateLimitScope = 'auth' | 'api' | 'search' | 'webhook' | 'admin';

export interface RateLimitRule {
  limit: number;
  windowSeconds: number;
}

/**
 * Per-scope limits required by the platform checklist:
 * auth 5/min, API 100/min, search 30/min, webhook 1000/min.
 */
export const RATE_LIMITS: Record<RateLimitScope, RateLimitRule> = {
  auth: { limit: 5, windowSeconds: 60 },
  api: { limit: 100, windowSeconds: 60 },
  search: { limit: 30, windowSeconds: 60 },
  webhook: { limit: 1000, windowSeconds: 60 },
  admin: { limit: 300, windowSeconds: 60 },
};

export function clientIp(c: Context): string {
  const forwarded = c.req.header('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return c.req.header('cf-connecting-ip') || c.req.header('x-real-ip') || '127.0.0.1';
}

export function correlationIdMiddleware() {
  return async function correlationId(c: Context, next: Next) {
    const inbound = c.req.header('x-correlation-id') || c.req.header('x-request-id');
    const correlationId = inbound && inbound.length <= 200 ? inbound : randomUUID();
    c.set('correlationId', correlationId);
    c.set('requestId', correlationId);
    c.header('x-correlation-id', correlationId);
    c.header('x-request-id', correlationId);
    await next();
  };
}

export function securityHeadersMiddleware() {
  return async function securityHeaders(c: Context, next: Next) {
    c.header('X-Content-Type-Options', 'nosniff');
    c.header('X-Frame-Options', 'DENY');
    c.header('Referrer-Policy', 'no-referrer');
    c.header('X-XSS-Protection', '1; mode=block');
    c.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    c.header(
      'Content-Security-Policy',
      "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"
    );
    await next();
  };
}

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetSeconds: number;
}

/**
 * Redis backed fixed-window counter. Returns null when the store is unreachable so
 * the caller can decide whether to fail open or closed.
 */
export async function consumeRateLimit(
  scope: RateLimitScope | 'custom',
  identifier: string,
  override?: RateLimitRule
): Promise<RateLimitResult | null> {
  const rule = override ?? (scope === 'custom' ? RATE_LIMITS.api : RATE_LIMITS[scope]);
  const redis = await ensureRedisConnected();
  if (!redis) return null;

  const key = `ratelimit:${scope}:${identifier}`;
  try {
    const current = await redis.incr(key);
    if (current === 1) {
      await redis.expire(key, rule.windowSeconds);
    }
    const ttl = await redis.ttl(key);
    return {
      allowed: current <= rule.limit,
      limit: rule.limit,
      remaining: Math.max(0, rule.limit - current),
      resetSeconds: ttl > 0 ? ttl : rule.windowSeconds,
    };
  } catch {
    return null;
  }
}

export function rateLimiter(scope: RateLimitScope, override?: RateLimitRule) {
  return async function rateLimit(c: Context, next: Next) {
    const rule = override ?? RATE_LIMITS[scope];
    const result = await consumeRateLimit(scope, clientIp(c), rule);

    if (result === null) {
      // Fail open: availability beats throttling when Redis is down.
      await next();
      return;
    }

    c.header('X-RateLimit-Limit', String(result.limit));
    c.header('X-RateLimit-Remaining', String(result.remaining));
    c.header('X-RateLimit-Reset', String(result.resetSeconds));

    if (!result.allowed) {
      c.header('Retry-After', String(result.resetSeconds));
      return c.json(
        {
          success: false,
          error: {
            code: 'RATE_LIMITED',
            message: 'Too many requests, please retry later',
            requestId: c.get('requestId') ?? null,
          },
        },
        429
      );
    }

    await next();
  };
}

/** Backwards compatible alias used by earlier call sites. */
export function tieredRateLimiter(tier: 'public' | 'auth' | 'admin' = 'public') {
  const scope: RateLimitScope = tier === 'auth' ? 'auth' : tier === 'admin' ? 'admin' : 'api';
  return rateLimiter(scope);
}

// ---------------------------------------------------------------------------
// IP allowlist untuk endpoint admin
// ---------------------------------------------------------------------------

export interface IpAllowlistConfig {
  /** Entri yang sudah dinormalisasi: IPv4, IPv6, atau CIDR IPv4. */
  entries: string[];
  /** Daftar kosong berarti allow all, supaya instalasi lokal tidak terkunci. */
  allowAll: boolean;
}

/**
 * Format `ADMIN_IP_ALLOWLIST`: daftar dipisah koma, misalnya
 * `10.0.0.0/8, 203.0.113.7, ::1`. Entri `*` juga berarti allow all.
 */
export function parseIpAllowlist(raw?: string): IpAllowlistConfig {
  const entries = String(raw ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

  if (entries.includes('*')) {
    return { entries: [], allowAll: true };
  }

  return { entries, allowAll: entries.length === 0 };
}

/** IPv4 dotted quad ke integer 32-bit, null kalau formatnya tidak valid. */
export function ipv4ToInt(value: string): number | null {
  const parts = String(value ?? '')
    .trim()
    .split('.');
  if (parts.length !== 4) return null;
  let result = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const octet = Number(part);
    if (octet < 0 || octet > 255) return null;
    result = result * 256 + octet;
  }
  return result >>> 0;
}

function normalizeIp(value: string): string {
  const ip = String(value ?? '').trim();
  // Node dan beberapa proxy mengirim alamat IPv4 sebagai ::ffff:10.0.0.1.
  if (ip.toLowerCase().startsWith('::ffff:') && ip.includes('.')) {
    return ip.slice(7);
  }
  return ip;
}

/** Cocokkan satu alamat IP dengan satu entri allowlist (exact, CIDR IPv4, atau IPv6 exact). */
export function ipMatchesEntry(ip: string, entry: string): boolean {
  const address = normalizeIp(ip);
  const rule = normalizeIp(entry);
  if (!address || !rule) return false;
  if (address === rule) return true;

  const slash = rule.indexOf('/');
  if (slash === -1) return false;
  if (address.includes(':')) return false;

  const base = rule.slice(0, slash);
  const prefixRaw = rule.slice(slash + 1);
  if (!/^\d{1,2}$/.test(prefixRaw)) return false;
  const prefix = Number(prefixRaw);
  if (prefix < 0 || prefix > 32) return false;

  const baseInt = ipv4ToInt(base);
  const addressInt = ipv4ToInt(address);
  if (baseInt === null || addressInt === null) return false;
  if (prefix === 0) return true;

  const mask = (0xffffffff << (32 - prefix)) >>> 0;
  return (baseInt & mask) === (addressInt & mask);
}

export function isIpAllowed(ip: string, config: IpAllowlistConfig): boolean {
  if (config.allowAll) return true;
  return config.entries.some((entry) => ipMatchesEntry(ip, entry));
}

/**
 * Penjaga endpoint admin. Kalau `ADMIN_IP_ALLOWLIST` tidak diisi, semua IP lolos supaya
 * pengembangan lokal dan test suite tidak pecah. Di produksi variabel ini wajib diisi.
 */
export function adminIpAllowlist(raw: string | undefined = process.env.ADMIN_IP_ALLOWLIST) {
  const config = parseIpAllowlist(raw);

  return async function adminIpGuard(c: Context, next: Next) {
    if (config.allowAll) {
      await next();
      return;
    }

    const ip = clientIp(c);
    if (isIpAllowed(ip, config)) {
      await next();
      return;
    }

    return c.json(
      {
        success: false,
        error: {
          code: 'IP_NOT_ALLOWED',
          message: 'This IP address is not allowed to access admin endpoints',
          requestId: c.get('requestId') ?? null,
        },
      },
      403
    );
  };
}
