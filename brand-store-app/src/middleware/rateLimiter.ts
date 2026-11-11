import { Context, Next } from 'hono';
import { getRedisClient } from '../config/redis.js';

// Enterprise Rate Limiter using Redis sliding window / token bucket approximation
export async function rateLimiterMiddleware(c: Context, next: Next) {
  try {
    const redis = getRedisClient();
    const ip = c.req.header('x-forwarded-for') || c.req.header('cf-connecting-ip') || '127.0.0.1';
    const key = `ratelimit:${ip}`;
    
    // Allow 100 requests per 60 seconds per IP
    const requests = await redis.incr(key);
    if (requests === 1) {
      await redis.expire(key, 60);
    }

    c.header('X-RateLimit-Limit', '100');
    c.header('X-RateLimit-Remaining', Math.max(0, 100 - requests).toString());

    if (requests > 100) {
      return c.json({ success: false, error: 'Too Many Requests: Rate limit exceeded. Please try again later.' }, 429);
    }

    await next();
  } catch (err) {
    // Fail-open strategy if Redis goes down momentarily to prevent total downtime
    console.error('Rate limiter error (fail-open):', err);
    await next();
  }
}
