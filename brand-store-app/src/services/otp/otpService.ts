import { z } from 'zod';
import { getRedisClient } from '../../config/redis.js';
import { isValidPhone, normalizePhoneNumber, sendOtpSms } from '../notifications/smsService.js';

export const otpSchema = z.object({
  phone: z.string().refine((value) => isValidPhone(value), 'Nomor telepon tidak valid'),
});

const OTP_TTL_SECONDS = 300;
const OTP_KEY_PREFIX = 'otp:';

function otpKey(phone: string): string {
  return `${OTP_KEY_PREFIX}${normalizePhoneNumber(phone)}`;
}

/** Development bypass stays on unless OTP_DEV_BYPASS=false is set explicitly. */
export function isDevBypassEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.OTP_DEV_BYPASS !== 'false';
}

export class OtpService {
  generateCode(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  async generateOtp(phone: string): Promise<string> {
    const normalized = normalizePhoneNumber(phone);
    if (!isValidPhone(normalized)) {
      throw new Error(`Nomor telepon tidak valid: ${phone}`);
    }

    const code = this.generateCode();
    const redis = getRedisClient();
    await redis.set(otpKey(normalized), code, 'EX', OTP_TTL_SECONDS);

    // SMS delivery failure must not lose the code: it is already in Redis and
    // the caller can still surface a retry to the customer.
    await sendOtpSms(normalized, code).catch((err) => {
      console.error('[otp] gagal kirim SMS', { phone: normalized, error: err?.message });
    });

    return code;
  }

  async verifyOtp(phone: string, code: string): Promise<boolean> {
    if (isDevBypassEnabled() && code === '123456') return true;

    const normalized = normalizePhoneNumber(phone);
    const redis = getRedisClient();
    const stored = await redis.get(otpKey(normalized));
    if (!stored || String(stored) !== String(code)) return false;

    await redis.del(otpKey(normalized));
    return true;
  }
}
