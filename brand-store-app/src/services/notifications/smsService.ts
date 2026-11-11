import { z } from 'zod';

export type SmsProvider = 'twilio' | 'fonnte' | 'log';

export class SmsError extends Error {
  readonly status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = 'SmsError';
    this.status = status;
  }
}

export const phoneSchema = z.string().min(8).max(20);

/**
 * Normalises Indonesian numbers to E.164. Accepts 08xx, 8xx, 628xx, +628xx and
 * bare +<country><number>. Anything else is returned trimmed, so the caller can
 * decide whether to reject it.
 */
export function normalizePhoneNumber(input: string): string {
  const raw = String(input ?? '').replace(/[\s\-().]/g, '').trim();
  if (raw === '') return '';

  if (raw.startsWith('+')) {
    return `+${raw.slice(1).replace(/\D/g, '')}`;
  }

  const digits = raw.replace(/\D/g, '');
  if (digits.startsWith('62')) return `+${digits}`;
  if (digits.startsWith('0')) return `+62${digits.slice(1)}`;
  if (digits.startsWith('8')) return `+62${digits}`;
  return digits.startsWith('+') ? digits : `+${digits}`;
}

export function isValidPhone(input: string): boolean {
  const normalized = normalizePhoneNumber(input);
  return /^\+[1-9]\d{7,14}$/.test(normalized);
}

export function maskPhone(input: string): string {
  const normalized = normalizePhoneNumber(input);
  if (normalized.length <= 6) return '*'.repeat(normalized.length);
  const head = normalized.slice(0, 4);
  const tail = normalized.slice(-3);
  return `${head}${'*'.repeat(Math.max(normalized.length - 7, 1))}${tail}`;
}

export function renderOtpMessage(code: string, options: { brand?: string; minutes?: number } = {}): string {
  const brand = options.brand ?? 'TEMBUS';
  const minutes = options.minutes ?? 5;
  return `Kode OTP ${brand} kamu: ${code}. Berlaku ${minutes} menit. Jangan bagikan kode ini ke siapa pun.`;
}

export interface SmsConfig {
  provider: SmsProvider;
  twilioAccountSid: string | null;
  twilioAuthToken: string | null;
  twilioFrom: string | null;
  fonnteToken: string | null;
}

export function readSmsConfig(env: NodeJS.ProcessEnv = process.env): SmsConfig {
  const twilioReady = Boolean(env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.TWILIO_FROM_NUMBER);
  const fonnteReady = Boolean(env.FONNTE_TOKEN);
  const provider: SmsProvider = twilioReady ? 'twilio' : fonnteReady ? 'fonnte' : 'log';

  return {
    provider,
    twilioAccountSid: env.TWILIO_ACCOUNT_SID ?? null,
    twilioAuthToken: env.TWILIO_AUTH_TOKEN ?? null,
    twilioFrom: env.TWILIO_FROM_NUMBER ?? null,
    fonnteToken: env.FONNTE_TOKEN ?? null,
  };
}

export function selectSmsProvider(env: NodeJS.ProcessEnv = process.env): SmsProvider {
  return readSmsConfig(env).provider;
}

export interface SmsResponse {
  sent: boolean;
  provider: SmsProvider;
  to: string;
  reason?: string;
  messageId?: string | null;
}

export async function sendSms(
  phone: string,
  message: string,
  config: SmsConfig = readSmsConfig()
): Promise<SmsResponse> {
  const to = normalizePhoneNumber(phone);
  if (!isValidPhone(to)) {
    throw new SmsError(`Nomor telepon tidak valid: ${phone}`, 400);
  }
  if (!message.trim()) {
    throw new SmsError('Isi pesan SMS kosong', 400);
  }

  if (config.provider === 'log') {
    console.log(`[sms:log] to=${maskPhone(to)} body=${message}`);
    return { sent: false, provider: 'log', to, reason: 'sms_not_configured' };
  }

  try {
    if (config.provider === 'twilio') {
      const credentials = Buffer.from(`${config.twilioAccountSid}:${config.twilioAuthToken}`).toString('base64');
      const body = new URLSearchParams({ To: to, From: String(config.twilioFrom), Body: message });
      const res = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${config.twilioAccountSid}/Messages.json`,
        {
          method: 'POST',
          headers: {
            Authorization: `Basic ${credentials}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body,
        }
      );
      const payload: any = await res.json().catch(() => ({}));
      return {
        sent: res.ok,
        provider: 'twilio',
        to,
        reason: res.ok ? undefined : `twilio_http_${res.status}`,
        messageId: payload?.sid ?? null,
      };
    }

    const res = await fetch('https://api.fonnte.com/send', {
      method: 'POST',
      headers: {
        Authorization: String(config.fonnteToken),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ target: to, message }),
    });
    const payload: any = await res.json().catch(() => ({}));
    return {
      sent: res.ok,
      provider: 'fonnte',
      to,
      reason: res.ok ? undefined : `fonnte_http_${res.status}`,
      messageId: payload?.id ?? null,
    };
  } catch (err: any) {
    return { sent: false, provider: config.provider, to, reason: err?.message ?? 'sms_send_failed' };
  }
}

export async function sendOtpSms(phone: string, code: string, options: { brand?: string; minutes?: number } = {}) {
  const message = renderOtpMessage(code, options);
  return sendSms(phone, message);
}
