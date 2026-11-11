import { unifiedConfig } from '../config/unifiedConfig.js';
import { ensureRedisConnected } from '../config/redis.js';

export interface LockState {
  locked: boolean;
  failures: number;
  retryAfterSeconds: number;
}

const memoryFailures = new Map<string, { count: number; expiresAt: number }>();

function memoryKey(identifier: string): string {
  return identifier.toLowerCase();
}

function readMemory(identifier: string): number {
  const entry = memoryFailures.get(memoryKey(identifier));
  if (!entry) return 0;
  if (entry.expiresAt < Date.now()) {
    memoryFailures.delete(memoryKey(identifier));
    return 0;
  }
  return entry.count;
}

function failureKey(identifier: string): string {
  return `auth:fails:${memoryKey(identifier)}`;
}

function lockKey(identifier: string): string {
  return `auth:lock:${memoryKey(identifier)}`;
}

export async function getLockState(identifier: string): Promise<LockState> {
  const redis = await ensureRedisConnected();
  if (redis) {
    try {
      const [failures, lockTtl] = await Promise.all([
        redis.get(failureKey(identifier)),
        redis.ttl(lockKey(identifier)),
      ]);
      const count = failures ? parseInt(failures, 10) : 0;
      return { locked: lockTtl > 0, failures: count, retryAfterSeconds: lockTtl > 0 ? lockTtl : 0 };
    } catch {
      /* fall through to memory */
    }
  }

  const count = readMemory(identifier);
  return {
    locked: count >= unifiedConfig.auth.maxFailedAttempts,
    failures: count,
    retryAfterSeconds:
      count >= unifiedConfig.auth.maxFailedAttempts ? unifiedConfig.auth.lockTtlSeconds : 0,
  };
}

export async function recordFailure(identifier: string): Promise<LockState> {
  const redis = await ensureRedisConnected();
  if (redis) {
    try {
      const count = await redis.incr(failureKey(identifier));
      await redis.expire(failureKey(identifier), unifiedConfig.auth.lockTtlSeconds);
      if (count >= unifiedConfig.auth.maxFailedAttempts) {
        await redis.set(lockKey(identifier), '1', 'EX', unifiedConfig.auth.lockTtlSeconds);
        return {
          locked: true,
          failures: count,
          retryAfterSeconds: unifiedConfig.auth.lockTtlSeconds,
        };
      }
      return { locked: false, failures: count, retryAfterSeconds: 0 };
    } catch {
      /* fall through to memory */
    }
  }

  const previous = readMemory(identifier);
  const count = previous + 1;
  memoryFailures.set(memoryKey(identifier), {
    count,
    expiresAt: Date.now() + unifiedConfig.auth.lockTtlSeconds * 1000,
  });
  return {
    locked: count >= unifiedConfig.auth.maxFailedAttempts,
    failures: count,
    retryAfterSeconds:
      count >= unifiedConfig.auth.maxFailedAttempts ? unifiedConfig.auth.lockTtlSeconds : 0,
  };
}

export async function clearFailures(identifier: string): Promise<void> {
  memoryFailures.delete(memoryKey(identifier));
  const redis = await ensureRedisConnected();
  if (!redis) return;
  try {
    await redis.del(failureKey(identifier), lockKey(identifier));
  } catch {
    /* best effort */
  }
}

export function clearFailureCache(): void {
  memoryFailures.clear();
}
