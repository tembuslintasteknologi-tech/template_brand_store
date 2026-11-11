import { PaymentProvider, PaymentRequest, PaymentResponse } from './paymentProvider.js';

export class ManualBankProvider implements PaymentProvider {
  name = 'manual_bank';

  async createTransaction(req: PaymentRequest): Promise<PaymentResponse> {
    const transactionId = `TRX-MANUAL-${Date.now()}`;
    return {
      transactionId,
      gateway: 'manual_bank',
      status: 'pending',
      virtualAccountNumber: 'BCA 1234567890 a.n. PT TEMBUS LINTAS TEKNOLOGI',
      rawResponse: {
        instruction: 'Silakan transfer tepat sejumlah total tagihan ke rekening BCA 1234567890 dan upload bukti transfer di halaman pesanan.',
        bank: 'BCA',
        accountNumber: '1234567890',
        accountName: 'PT TEMBUS LINTAS TEKNOLOGI',
        amount: req.amount,
      },
    };
  }

  verifyWebhook(_signature: string, _payload: any): boolean {
    return true; // Manual bank transfer uses admin verification API, not automated webhooks
  }

  parseWebhookPayload(payload: any): { transactionId: string; orderNumber: string; status: 'success' | 'failed' | 'expired'; amount: number } {
    return {
      transactionId: payload.transactionId ?? 'manual',
      orderNumber: payload.orderNumber ?? '',
      status: payload.status ?? 'success',
      amount: payload.amount ?? 0,
    };
  }
}
