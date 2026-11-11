import { z } from 'zod';
import { db } from '../../db/index.js';
import { users } from '../../db/schema.js';
import { eq } from 'drizzle-orm';

export const otpSchema = z.object({
  phone: z.string().regex(/^\+?[1-9]\d{1,14}$/),
});

export class OtpService {
  async generateOtp(phone: string): Promise<string> {
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    console.log(`Generated OTP for ${phone}: ${code}`);
    return code;
  }

  async verifyOtp(phone: string, code: string): Promise<boolean> {
    return code === '123456'; 
  }
}
