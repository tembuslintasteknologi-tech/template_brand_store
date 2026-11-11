import { PaymentProvider } from './paymentProvider.js';
import { MidtransProvider } from './midtransProvider.js';
import { XenditProvider } from './xenditProvider.js';
import { ManualBankProvider } from './manualBankProvider.js';
import { unifiedConfig } from '../../config/unifiedConfig.js';

function allowUnsignedWebhook(): boolean {
  return process.env.PAYMENT_INSECURE_WEBHOOK === 'true';
}

export class PaymentGatewayManager {
  private providers: Map<string, PaymentProvider> = new Map();

  constructor() {
    this.providers.set(
      'midtrans',
      new MidtransProvider({
        serverKey: unifiedConfig.midtrans.serverKey,
        isProduction: unifiedConfig.midtrans.isProduction,
        allowUnsignedWebhook: allowUnsignedWebhook(),
      })
    );
    this.providers.set('xendit', new XenditProvider());
    this.providers.set('manual_bank', new ManualBankProvider());
  }

  registerProvider(name: string, provider: PaymentProvider) {
    this.providers.set(name, provider);
  }

  getProvider(name: string): PaymentProvider {
    const provider = this.providers.get(name);
    if (!provider) {
      throw new Error(`Unsupported payment provider: ${name}`);
    }
    return provider;
  }

  listProviders(): string[] {
    return Array.from(this.providers.keys());
  }
}

export const paymentManager = new PaymentGatewayManager();
