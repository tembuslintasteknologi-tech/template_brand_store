import Redis from 'ioredis-mock';
import { unifiedConfig } from './unifiedConfig.js';

let redisClient: any = null;

export function getRedisClient() {
  if (!redisClient) {
    redisClient = new Redis(unifiedConfig.redis.url);
  }
  return redisClient;
}

export async function redisPing(): Promise<string> {
  const client = getRedisClient();
  return await client.ping();
}

export async function ensureRedisConnected(): Promise<any> {
  return getRedisClient();
}

export async function closeRedis(): Promise<void> {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
  }
}

