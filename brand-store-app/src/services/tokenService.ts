import jwt from 'jsonwebtoken';
import { unifiedConfig } from '../config/unifiedConfig.js';
import { ensureRedisConnected } from '../config/redis.js';

export function generateToken(payload: object, expiresIn: string = unifiedConfig.jwt.expiresIn, type: 'access' | 'refresh' = 'access'): string {
  const pAny = payload as any;
  const sub = pAny.sub || pAny.id;
  const jti = pAny.jti || Math.random().toString(36).substring(2);
  const secret = type === 'access' ? unifiedConfig.jwt.secret : unifiedConfig.jwt.refreshSecret;
  return jwt.sign({ ...pAny, sub, typ: type, jti }, secret, { expiresIn: expiresIn as any });
}

export function verifyToken(token: string, type: 'access' | 'refresh' = 'access'): any {
  const secret = type === 'access' ? unifiedConfig.jwt.secret : unifiedConfig.jwt.refreshSecret;
  return jwt.verify(token, secret);
}

export function issueTokenPair(payload: object) {
  return {
    tokenType: 'Bearer',
    expiresIn: 900,
    refreshExpiresIn: 604800,
    token: generateToken(payload, unifiedConfig.jwt.expiresIn, 'access'),
    refreshToken: generateToken(payload, unifiedConfig.jwt.refreshExpiresIn, 'refresh'),
  };
}

export async function rotateTokenPair(refreshToken: string) {
  const decoded = verifyToken(refreshToken, 'refresh');
  const redis = await ensureRedisConnected();
  if (redis && decoded.jti) {
    const revoked = await redis.get(`revoked:${decoded.jti}`);
    if (revoked) {
      throw new Error('Token has already been used (reuse detected)');
    }
    await redis.set(`revoked:${decoded.jti}`, '1', 'EX', 604800);
  }
  delete (decoded as any).iat;
  delete (decoded as any).exp;
  delete (decoded as any).typ;
  delete (decoded as any).jti;
  const pair = issueTokenPair(decoded);
  return {
    pair,
    user: decoded,
  };
}

export async function revokeSession(token?: string, refreshToken?: string): Promise<void> {
  const redis = await ensureRedisConnected();
  if (!redis) return;
  if (token) {
    try {
      const decoded = verifyToken(token, 'access');
      if (decoded.jti) {
        await redis.set(`revoked:${decoded.jti}`, '1', 'EX', 900);
      }
    } catch {}
  }
  if (refreshToken) {
    try {
      const decoded = verifyToken(refreshToken, 'refresh');
      if (decoded.jti) {
        await redis.set(`revoked:${decoded.jti}`, '1', 'EX', 604800);
      }
    } catch {}
  }
}

