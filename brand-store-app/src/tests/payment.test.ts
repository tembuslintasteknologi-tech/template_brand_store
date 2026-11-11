import test from 'node:test';
import assert from 'node:assert';
import http from 'node:http';
import crypto from 'node:crypto';
import { paymentManager } from '../services/payment/paymentManager.js';
import { MidtransProvider, PaymentGatewayError } from '../services/payment/midtransProvider.js';
import { XenditProvider } from '../services/payment/xenditProvider.js';
import { ManualBankProvider } from '../services/payment/manualBankProvider.js';

function startStub(handler: (req: http.IncomingMessage, body: string) => { status: number; body: unknown }) {
  return new Promise<{ url: string; close: () => Promise<void>; received: Array<{ method?: string; url?: string; headers: http.IncomingHttpHeaders; body: any }> }>((resolve) => {
    const received: Array<{ method?: string; url?: string; headers: http.IncomingHttpHeaders; body: any }> = [];
    const server = http.createServer((req, res) => {
      let body = '';
      req.on('data', (chunk) => (body += chunk));
      req.on('end', () => {
        received.push({ method: req.method, url: req.url, headers: req.headers, body: body ? JSON.parse(body) : null });
        const result = handler(req, body);
        res.writeHead(result.status, { 'content-type': 'application/json' });
        res.end(JSON.stringify(result.body));
      });
    });
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      resolve({
        url: `http://127.0.0.1:${port}`,
        received,
        close: () => new Promise<void>((done) => server.close(() => done())),
      });
    });
  });
}

test('Payment Gateway Manager registers and returns providers', () => {
  const providers = paymentManager.listProviders();
  assert.ok(providers.includes('midtrans'));
  assert.ok(providers.includes('xendit'));
  assert.ok(providers.includes('manual_bank'));

  const midtrans = paymentManager.getProvider('midtrans');
  assert.strictEqual(midtrans.name, 'midtrans');
  assert.throws(() => paymentManager.getProvider('unknown-gateway'), /Unsupported payment provider/);
});

test('Midtrans sends a real Snap API request and maps the response', async () => {
  const stub = await startStub((req) => {
    if (req.url === '/snap/v1/transactions') {
      return {
        status: 201,
        body: {
          token: 'snap-token-123',
          redirect_url: 'https://app.sandbox.midtrans.com/snap/v4/redirection/snap-token-123',
          transaction_id: 'TRX-MID-1',
        },
      };
    }
    return { status: 404, body: { status_message: 'not found' } };
  });

  try {
    const provider = new MidtransProvider({ serverKey: 'SB-Mid-server-test', baseUrl: stub.url });
    const result = await provider.createTransaction({
      orderId: 'order-1',
      orderNumber: 'ORD-2026-001',
      amount: 150000.4,
      customer: { id: 'cust-1', name: 'Yogi', email: 'yogi@example.com', phone: '+62811' },
      paymentMethod: 'va_bca',
      items: [{ id: 'p1', name: 'Kaos', price: 75000, quantity: 2 }],
    });

    assert.strictEqual(stub.received.length, 1);
    const request = stub.received[0];
    assert.strictEqual(request.method, 'POST');
    assert.strictEqual(request.url, '/snap/v1/transactions');
    assert.strictEqual(
      request.headers.authorization,
      'Basic ' + Buffer.from('SB-Mid-server-test:').toString('base64')
    );
    assert.strictEqual(request.body.transaction_details.order_id, 'ORD-2026-001');
    assert.strictEqual(request.body.transaction_details.gross_amount, 150000);
    assert.deepStrictEqual(request.body.enabled_payments, ['bca_va']);
    assert.strictEqual(request.body.item_details.length, 1);
    assert.strictEqual(request.body.customer_details.email, 'yogi@example.com');

    assert.strictEqual(result.gateway, 'midtrans');
    assert.strictEqual(result.status, 'pending');
    assert.strictEqual(result.transactionId, 'TRX-MID-1');
    assert.strictEqual(result.paymentUrl, 'https://app.sandbox.midtrans.com/snap/v4/redirection/snap-token-123');
  } finally {
    await stub.close();
  }
});

test('Midtrans maps enabled payments for qris, gopay and card', async () => {
  const stub = await startStub(() => ({ status: 201, body: { token: 't', redirect_url: 'https://pay', transaction_id: 'x' } }));
  try {
    const provider = new MidtransProvider({ baseUrl: stub.url, serverKey: 'k' });
    for (const [method, expected] of [
      ['qris', ['other_qris']],
      ['ewallet_gopay', ['gopay']],
      ['cc', ['credit_card']],
      ['va_mandiri', ['echannel']],
    ] as const) {
      await provider.createTransaction({
        orderId: 'o',
        orderNumber: 'ORD-' + method,
        amount: 1000,
        customer: { id: 'c', name: 'N', email: 'e@x.com' },
        paymentMethod: method as any,
      });
      const sent = stub.received[stub.received.length - 1];
      assert.deepStrictEqual(sent.body.enabled_payments, expected, `enabled_payments for ${method}`);
    }
  } finally {
    await stub.close();
  }
});

test('Midtrans raises PaymentGatewayError when the gateway rejects the transaction', async () => {
  const stub = await startStub(() => ({
    status: 401,
    body: { status_message: 'Unauthorized', error_messages: ['Invalid server key'] },
  }));
  try {
    const provider = new MidtransProvider({ baseUrl: stub.url, serverKey: 'wrong' });
    await assert.rejects(
      () =>
        provider.createTransaction({
          orderId: 'o',
          orderNumber: 'ORD-ERR',
          amount: 1000,
          customer: { id: 'c', name: 'N', email: 'e@x.com' },
          paymentMethod: 'qris',
        }),
      (err: unknown) => {
        assert.ok(err instanceof PaymentGatewayError);
        assert.strictEqual(err.statusCode, 401);
        assert.match(err.message, /Invalid server key/);
        return true;
      }
    );
  } finally {
    await stub.close();
  }
});

test('Midtrans webhook signature uses sha512 of order, status, amount and server key', () => {
  const provider = new MidtransProvider({ serverKey: 'server-key-abc' });
  const payload = {
    order_id: 'ORD-2026-001',
    status_code: '200',
    gross_amount: '150000.00',
    transaction_status: 'settlement',
    transaction_id: 'TRX-123',
  };
  const signature = crypto
    .createHash('sha512')
    .update('ORD-2026-001' + '200' + '150000.00' + 'server-key-abc')
    .digest('hex');

  assert.strictEqual(provider.verifyWebhook(signature, payload), true);
  assert.strictEqual(provider.verifyWebhook('deadbeef', payload), false);
  assert.strictEqual(provider.verifyWebhook(signature, { ...payload, signature_key: signature }), true);

  const parsed = provider.parseWebhookPayload(payload);
  assert.strictEqual(parsed.status, 'success');
  assert.strictEqual(parsed.orderNumber, 'ORD-2026-001');
  assert.strictEqual(parsed.amount, 150000);
});

test('Midtrans webhook honours the explicit insecure flag only', () => {
  const strict = new MidtransProvider({ serverKey: 'k' });
  assert.strictEqual(strict.verifyWebhook('mock-valid-signature', { order_id: 'A' }), false);

  const permissive = new MidtransProvider({ serverKey: 'k', allowUnsignedWebhook: true });
  assert.strictEqual(permissive.verifyWebhook('mock-valid-signature', { order_id: 'A' }), true);
});

test('Midtrans parses expire and deny webhook states', () => {
  const provider = new MidtransProvider({ serverKey: 'k' });
  assert.strictEqual(
    provider.parseWebhookPayload({ transaction_status: 'expire', order_id: 'A', gross_amount: '1.00' }).status,
    'expired'
  );
  assert.strictEqual(
    provider.parseWebhookPayload({ transaction_status: 'deny', order_id: 'A', gross_amount: '1.00' }).status,
    'failed'
  );
});

test('Xendit provider creates transaction and parses webhook', async () => {
  const provider = new XenditProvider();

  const tx = await provider.createTransaction({
    orderId: 'test-order-id-3',
    orderNumber: 'ORD-2026-003',
    amount: 500000,
    customer: { id: 'cust-2', name: 'Budi', email: 'budi@example.com' },
    paymentMethod: 'va_mandiri',
  });

  assert.strictEqual(tx.gateway, 'xendit');
  assert.ok(tx.virtualAccountNumber);

  const parsed = provider.parseWebhookPayload({
    id: 'xnd-tx-1',
    external_id: 'ORD-2026-003',
    status: 'PAID',
    amount: '500000',
  });

  assert.strictEqual(parsed.status, 'success');
  assert.strictEqual(parsed.orderNumber, 'ORD-2026-003');
});

test('Manual Bank provider creates instructions', async () => {
  const provider = new ManualBankProvider();
  const tx = await provider.createTransaction({
    orderId: 'test-order-id-4',
    orderNumber: 'ORD-2026-004',
    amount: 75000,
    customer: { id: 'cust-3', name: 'Siti', email: 'siti@example.com' },
    paymentMethod: 'manual_bank',
  });

  assert.strictEqual(tx.gateway, 'manual_bank');
  assert.ok(tx.virtualAccountNumber?.includes('BCA'));
});
