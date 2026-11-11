import { PaymentProvider, PaymentRequest, PaymentResponse } from './paymentProvider.js';
import crypto from 'node:crypto';

export class XenditProvider implements PaymentProvider {
  name = 'xendit';
  private apiKey: string;

  constructor(apiKey = 'xnd_development_mock_key') {
    this.apiKey = apiKey;
  }

  async createTransaction(req: PaymentRequest): Promise<PaymentResponse> {
    const transactionId = `TRX-XND-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    
    let virtualAccountNumber: string | undefined;
    let qrCodeUrl: string | undefined;
    let paymentUrl: string | undefined;

    if (req.paymentMethod.startsWith('va_')) {
      virtualAccountNumber = `9900${Math.floor(1000000000 + Math.random() * 9000000000)}`;
    } else if (req.paymentMethod === 'qris') {
      qrCodeUrl = `https://api.xendit.co/qr_codes/${transactionId}/view`;
    } else {
      paymentUrl = `https://checkout.xendit.co/web/${transactionId}`;
    }

    return {
      transactionId,
      gateway: 'xendit',
      status: 'pending',
      paymentUrl,
      qrCodeUrl,
      virtualAccountNumber,
      rawResponse: {
        id: transactionId,
        external_id: req.orderNumber,
        amount: req.amount,
        status: 'PENDING',
        payment_method: req.paymentMethod,
        created: new Date().toISOString(),
      },
    };
  }

  verifyWebhook(signature: string, payload: any): boolean {
    // Xendit uses callback token header or HMAC
    return signature === 'mock-xendit-token' || signature === this.apiKey;
  }

  parseWebhookPayload(payload: any): { transactionId: string; orderNumber: string; status: 'success' | 'failed' | 'expired'; amount: number } {
    const statusStr = (payload.status ?? '').toUpperCase();
    let status: 'success' | 'failed' | 'expired' = 'pending' as any;

    if (statusStr === 'PAID' || statusStr === 'SUCCEEDED') {
      status = 'success';
    } else if (statusStr === 'FAILED') {
      status = 'failed';
    } else if (statusStr === 'EXPIRED') {
      status = 'expired';
    }

    return {
      transactionId: payload.id ?? payload.transaction_id ?? `TRX-${Date.now()}`,
      orderNumber: payload.external_id ?? payload.order_number ?? '',
      status,
      amount: parseFloat(payload.amount ?? '0'),
    };
  }
}
