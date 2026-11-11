import crypto from 'node:crypto';
import { PaymentProvider, PaymentRequest, PaymentResponse } from './paymentProvider.js';

export class PaymentGatewayError extends Error {
  readonly gateway: string;
  readonly statusCode?: number;
  readonly rawResponse?: unknown;

  constructor(message: string, gateway: string, statusCode?: number, rawResponse?: unknown) {
    super(message);
    this.name = 'PaymentGatewayError';
    this.gateway = gateway;
    this.statusCode = statusCode;
    this.rawResponse = rawResponse;
  }
}

export interface MidtransOptions {
  serverKey?: string;
  isProduction?: boolean;
  baseUrl?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  allowUnsignedWebhook?: boolean;
}

const SNAP_PATH = '/snap/v1/transactions';

const ENABLED_PAYMENTS: Record<string, string[]> = {
  qris: ['other_qris'],
  va_bca: ['bca_va'],
  va_mandiri: ['echannel'],
  ewallet_gopay: ['gopay'],
  cc: ['credit_card'],
  manual_bank: ['bca_va'],
};

export class MidtransProvider implements PaymentProvider {
  name = 'midtrans';
  private serverKey: string;
  private isProduction: boolean;
  private baseUrl: string;
  private timeoutMs: number;
  private fetchImpl: typeof fetch;
  private allowUnsignedWebhook: boolean;

  constructor(options: MidtransOptions = {}) {
    this.serverKey = options.serverKey ?? 'SB-Mid-server-key';
    this.isProduction = options.isProduction ?? false;
    this.baseUrl = options.baseUrl ?? (this.isProduction ? 'https://app.midtrans.com' : 'https://app.sandbox.midtrans.com');
    this.timeoutMs = options.timeoutMs ?? 10000;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.allowUnsignedWebhook = options.allowUnsignedWebhook ?? false;
  }

  private authHeader(): string {
    return 'Basic ' + Buffer.from(`${this.serverKey}:`).toString('base64');
  }

  async createTransaction(req: PaymentRequest): Promise<PaymentResponse> {
    const payload = {
      transaction_details: {
        order_id: req.orderNumber,
        gross_amount: Math.round(req.amount),
      },
      customer_details: {
        first_name: req.customer.name,
        email: req.customer.email,
        phone: req.customer.phone ?? undefined,
      },
      enabled_payments: ENABLED_PAYMENTS[req.paymentMethod] ?? ['other_qris'],
      item_details: (req.items ?? []).map((item) => ({
        id: item.id,
        name: item.name,
        price: Math.round(item.price),
        quantity: item.quantity,
      })),
    };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    let response: Response;
    try {
      response = await this.fetchImpl(`${this.baseUrl}${SNAP_PATH}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json',
          authorization: this.authHeader(),
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
    } catch (err: any) {
      throw new PaymentGatewayError(
        `Midtrans request failed: ${err?.message ?? 'network error'}`,
        this.name
      );
    } finally {
      clearTimeout(timer);
    }

    const text = await response.text();
    let raw: any = null;
    try {
      raw = text ? JSON.parse(text) : null;
    } catch {
      raw = { raw: text };
    }

    if (!response.ok) {
      const detail = raw?.error_messages?.join(', ') ?? raw?.status_message ?? text.slice(0, 200);
      throw new PaymentGatewayError(`Midtrans rejected transaction: ${detail}`, this.name, response.status, raw);
    }

    const vaNumber: string | undefined = raw?.va_numbers?.[0]?.va_number ?? raw?.bill_key ?? undefined;

    return {
      transactionId: raw?.transaction_id ?? raw?.token ?? req.orderNumber,
      gateway: this.name,
      status: 'pending',
      paymentUrl: raw?.redirect_url ?? undefined,
      qrCodeUrl: raw?.actions?.find?.((a: any) => String(a?.name).includes('qr'))?.url ?? undefined,
      virtualAccountNumber: vaNumber,
      rawResponse: raw,
    };
  }

  verifyWebhook(signature: string, payload: any): boolean {
    const key = String(this.serverKey ?? '');
    const orderId = String(payload?.order_id ?? '');
    const statusCode = String(payload?.status_code ?? '');
    const grossAmount = String(payload?.gross_amount ?? '');
    const provided = String(payload?.signature_key ?? signature ?? '');

    const expected = crypto.createHash('sha512').update(`${orderId}${statusCode}${grossAmount}${key}`).digest('hex');
    const expectedBuf = Buffer.from(expected, 'utf8');
    const providedBuf = Buffer.from(provided, 'utf8');

    if (providedBuf.length === expectedBuf.length && crypto.timingSafeEqual(providedBuf, expectedBuf)) {
      return true;
    }

    if (this.allowUnsignedWebhook && provided.length > 0) {
      return true;
    }

    return false;
  }

  parseWebhookPayload(payload: any): { transactionId: string; orderNumber: string; status: 'success' | 'failed' | 'expired'; amount: number } {
    const transactionStatus = String(payload?.transaction_status ?? '');
    let status: 'success' | 'failed' | 'expired' = 'pending' as any;

    if (transactionStatus === 'capture' || transactionStatus === 'settlement') {
      status = 'success';
    } else if (transactionStatus === 'cancel' || transactionStatus === 'deny' || transactionStatus === 'failure') {
      status = 'failed';
    } else if (transactionStatus === 'expire') {
      status = 'expired';
    }

    return {
      transactionId: payload?.transaction_id ?? `TRX-${Date.now()}`,
      orderNumber: payload?.order_id ?? '',
      status,
      amount: parseFloat(payload?.gross_amount ?? '0'),
    };
  }
}
