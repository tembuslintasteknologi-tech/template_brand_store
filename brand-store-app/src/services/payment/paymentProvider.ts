export interface PaymentRequest {
  orderId: string;
  orderNumber: string;
  amount: number;
  customer: {
    id: string;
    name: string;
    email: string;
    phone?: string;
  };
  paymentMethod: 'qris' | 'va_bca' | 'va_mandiri' | 'ewallet_gopay' | 'cc' | 'manual_bank';
  items?: Array<{ id: string; name: string; price: number; quantity: number }>;
}

export interface PaymentResponse {
  transactionId: string;
  gateway: string;
  status: 'pending' | 'success' | 'failed' | 'expired';
  paymentUrl?: string;
  qrCodeUrl?: string;
  virtualAccountNumber?: string;
  rawResponse?: any;
}

export interface PaymentProvider {
  name: string;
  createTransaction(req: PaymentRequest): Promise<PaymentResponse>;
  verifyWebhook(signature: string, payload: any): boolean;
  parseWebhookPayload(payload: any): { transactionId: string; orderNumber: string; status: 'success' | 'failed' | 'expired'; amount: number };
}
