import test from 'node:test';
import assert from 'node:assert';
import http from 'node:http';
import crypto from 'node:crypto';
import { TembusOnDemandProvider } from '../services/logistics/tembusOnDemandProvider.js';
import { TembusAggregatorProvider } from '../services/logistics/tembusAggregatorProvider.js';
import { LogisticGatewayError } from '../services/logistics/logisticProvider.js';

interface Recorded {
  method?: string;
  url?: string;
  headers: http.IncomingHttpHeaders;
  body: any;
}

function startStub(handler: (recorded: Recorded) => { status: number; body: unknown }) {
  return new Promise<{ url: string; close: () => Promise<void>; received: Recorded[] }>((resolve) => {
    const received: Recorded[] = [];
    const server = http.createServer((req, res) => {
      let body = '';
      req.on('data', (chunk) => (body += chunk));
      req.on('end', () => {
        const entry: Recorded = {
          method: req.method,
          url: req.url,
          headers: req.headers,
          body: body ? JSON.parse(body) : null,
        };
        received.push(entry);
        const result = handler(entry);
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

const rateParams = {
  origin: { name: 'Gudang', phone: '0811', addressLine: 'Jl. A', city: 'Jakarta', latitude: -6.2, longitude: 106.8 },
  destination: { name: 'Buyer', phone: '0812', addressLine: 'Jl. B', city: 'Bandung', latitude: -6.9, longitude: 107.6 },
  weightGrams: 2000,
  dimensions: { lengthCm: 30, widthCm: 20, heightCm: 10 },
};

test('on-demand quote calls the developer quotes endpoint and maps the estimate', async () => {
  const stub = await startStub((recorded) => {
    if (recorded.url === '/quotes') {
      return { status: 200, body: { data: { estimate_id: 'est-123', total_price_idr: 25000, distance_km: 12.4 } } };
    }
    return { status: 404, body: { error: { message: 'not found' } } };
  });

  try {
    const provider = new TembusOnDemandProvider({ baseUrl: stub.url, apiKey: 'lcr-test-key', models: ['p2p'] });
    const rates = await provider.calculateRate(rateParams);

    assert.strictEqual(stub.received.length, 1);
    const request = stub.received[0];
    assert.strictEqual(request.method, 'POST');
    assert.strictEqual(request.url, '/quotes');
    assert.strictEqual(request.headers.authorization, 'Bearer lcr-test-key');
    assert.ok(String(request.headers['idempotency-key'] ?? '').length >= 12);
    assert.strictEqual(request.body.weight, 2);
    assert.deepStrictEqual(request.body.models, ['p2p']);
    assert.strictEqual(request.body.pickup_lat, -6.2);
    assert.strictEqual(request.body.dropoff_lng, 107.6);
    assert.strictEqual(request.body.length, 30);

    assert.strictEqual(rates.length, 1);
    assert.strictEqual(rates[0].cost, 25000);
    assert.strictEqual(rates[0].mode, 'ondemand');
    assert.strictEqual(rates[0].provider, 'tembus_ondemand');
  } finally {
    await stub.close();
  }
});

test('on-demand shipment quotes then creates an order and returns the order id as AWB', async () => {
  const stub = await startStub((recorded) => {
    if (recorded.url === '/quotes') {
      return { status: 200, body: { data: { estimate_id: 'est-9', total_price_idr: 31000 } } };
    }
    if (recorded.url === '/orders') {
      return { status: 201, body: { data: { order_id: 'ord-777', status: 'created', estimated_delivery: '2026-11-10T12:00:00Z' } } };
    }
    return { status: 404, body: { error: { message: 'not found' } } };
  });

  try {
    const provider = new TembusOnDemandProvider({ baseUrl: stub.url, apiKey: 'k', models: ['p2p'] });
    const result = await provider.createShipment({
      orderNumber: 'ORD-1',
      origin: { name: 'Gudang', phone: '0811', addressLine: 'Jl. A', city: 'Jakarta', latitude: -6.2, longitude: 106.8 },
      destination: { name: 'Buyer', phone: '0812', addressLine: 'Jl. B', city: 'Bandung', latitude: -6.9, longitude: 107.6 },
      service: 'p2p',
      weightGrams: 1000,
      items: [{ name: 'Kaos', quantity: 2, weightGrams: 500 }],
      deliveryInstructions: 'titip ke satpam',
    });

    assert.strictEqual(stub.received.length, 2);
    const orderRequest = stub.received[1];
    assert.strictEqual(orderRequest.url, '/orders');
    assert.strictEqual(orderRequest.body.estimate_id, 'est-9');
    assert.match(orderRequest.body.item_description, /Kaos x2/);
    assert.match(orderRequest.body.item_description, /titip ke satpam/);
    assert.strictEqual(orderRequest.body.model, 'p2p');

    assert.strictEqual(result.awb, 'ord-777');
    assert.strictEqual(result.mode, 'ondemand');
    assert.strictEqual(result.service, 'p2p');
    assert.strictEqual(result.cost, 31000);
  } finally {
    await stub.close();
  }
});

test('on-demand tracking maps canonical status and history', async () => {
  const stub = await startStub((recorded) => {
    if (recorded.url === '/orders/ord-1/track') {
      return {
        status: 200,
        body: {
          data: {
            status: 'in_transit',
            model: 'p2p',
            pickup_address: 'Jakarta',
            dropoff_address: 'Bandung',
            history: [
              { status: 'picked_up', timestamp: '2026-11-10T09:00:00Z', location: 'Jakarta' },
              { status: 'in transit', timestamp: '2026-11-10T11:00:00Z', location: 'Bandung' },
            ],
          },
        },
      };
    }
    return { status: 404, body: {} };
  });

  try {
    const provider = new TembusOnDemandProvider({ baseUrl: stub.url, apiKey: 'k' });
    const tracking = await provider.trackShipment('ord-1');
    assert.strictEqual(tracking.status, 'in_transit');
    assert.strictEqual(tracking.history.length, 2);
    assert.strictEqual(tracking.history[1].status, 'in_transit');
    assert.strictEqual(tracking.origin, 'Jakarta');
  } finally {
    await stub.close();
  }
});

test('on-demand cancel posts to the cancel endpoint', async () => {
  const stub = await startStub(() => ({ status: 200, body: { success: true } }));
  try {
    const provider = new TembusOnDemandProvider({ baseUrl: stub.url, apiKey: 'k' });
    await provider.cancelShipment('ord-9');
    assert.strictEqual(stub.received[0].method, 'POST');
    assert.strictEqual(stub.received[0].url, '/orders/ord-9/cancel');
  } finally {
    await stub.close();
  }
});

test('on-demand surfaces gateway failures as LogisticGatewayError', async () => {
  const stub = await startStub(() => ({ status: 429, body: { error: { message: 'quota exceeded' } } }));
  try {
    const provider = new TembusOnDemandProvider({ baseUrl: stub.url, apiKey: 'k' });
    await assert.rejects(
      () => provider.calculateRate(rateParams),
      (err: unknown) => {
        assert.ok(err instanceof LogisticGatewayError);
        assert.strictEqual(err.statusCode, 429);
        assert.match(err.message, /quota exceeded/);
        return true;
      }
    );
  } finally {
    await stub.close();
  }
});

test('on-demand webhook signature is HMAC sha256 over timestamp and raw body', () => {
  const secret = 'whsec_test';
  const provider = new TembusOnDemandProvider({ apiKey: 'k', webhookSecret: secret });
  const timestamp = '1794310000';
  const rawBody = JSON.stringify({ order_id: 'ord-1', status: 'delivered' });
  const signature =
    'sha256=' + crypto.createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex');

  assert.strictEqual(provider.verifyWebhook({ signature, timestamp, rawBody }), true);
  assert.strictEqual(provider.verifyWebhook({ signature, timestamp: '1794310001', rawBody }), false);
  assert.strictEqual(provider.verifyWebhook({ signature: 'sha256=deadbeef', timestamp, rawBody }), false);

  const withoutSecret = new TembusOnDemandProvider({ apiKey: 'k' });
  assert.strictEqual(withoutSecret.verifyWebhook({ signature, timestamp, rawBody }), false);

  const parsed = provider.parseWebhookPayload({ data: { order_id: 'ord-1', status: 'DELIVERED', location: 'Bandung' } });
  assert.strictEqual(parsed.awb, 'ord-1');
  assert.strictEqual(parsed.status, 'delivered');
  assert.strictEqual(parsed.location, 'Bandung');
});

test('aggregator tariff calls the logistics tariff endpoint per carrier', async () => {
  const stub = await startStub((recorded) => {
    if (String(recorded.url).startsWith('/api/v1/logistics/tariff')) {
      const url = new URL(`http://x${recorded.url}`);
      const carrier = url.searchParams.get('provider');
      return {
        status: 200,
        body: {
          success: true,
          data: {
            provider: carrier,
            origin: 'Jakarta',
            destination: 'Bandung',
            weight: 2,
            services: [
              {
                service_code: 'REG',
                service_name: `${String(carrier).toUpperCase()} Regular`,
                tariff_gross: 18000,
                tariff_net: 16000,
                customer_tariff_idr: 20000,
                etd: '2-3',
              },
            ],
          },
        },
      };
    }
    return { status: 404, body: {} };
  });

  try {
    const provider = new TembusAggregatorProvider({ baseUrl: stub.url, token: 'agg-token', providers: ['jne', 'jnt'] });
    const rates = await provider.calculateRate(rateParams);

    assert.strictEqual(stub.received.length, 2);
    assert.strictEqual(stub.received[0].headers.authorization, 'Bearer agg-token');
    const firstUrl = new URL(`http://x${stub.received[0].url}`);
    assert.strictEqual(firstUrl.pathname, '/api/v1/logistics/tariff');
    assert.strictEqual(firstUrl.searchParams.get('provider'), 'jne');
    assert.strictEqual(firstUrl.searchParams.get('origin_code'), 'Jakarta');
    assert.strictEqual(firstUrl.searchParams.get('destination_code'), 'Bandung');
    assert.strictEqual(firstUrl.searchParams.get('weight_kg'), '2');
    assert.strictEqual(firstUrl.searchParams.get('length_cm'), '30');

    assert.strictEqual(rates.length, 2);
    assert.strictEqual(rates[0].cost, 20000);
    assert.strictEqual(rates[0].service, 'JNE_REG');
    assert.strictEqual(rates[0].mode, 'aggregator');
  } finally {
    await stub.close();
  }
});

test('aggregator AWB creation requires a partner credential', async () => {
  const provider = new TembusAggregatorProvider({ baseUrl: 'http://127.0.0.1:1', token: '' });
  await assert.rejects(
    () =>
      provider.createShipment({
        orderNumber: 'ORD-1',
        origin: { name: 'A', phone: '1', addressLine: 'Jl A', city: 'Jakarta' },
        destination: { name: 'B', phone: '2', addressLine: 'Jl B', city: 'Bandung' },
        service: 'jne_REG',
        weightGrams: 1000,
        items: [{ name: 'Kaos', quantity: 1, weightGrams: 1000 }],
      }),
    (err: unknown) => {
      assert.ok(err instanceof LogisticGatewayError);
      assert.strictEqual(err.statusCode, 501);
      assert.match(err.message, /TEMBUS_AGGREGATOR_TOKEN/);
      return true;
    }
  );
});

test('aggregator AWB creation posts the carrier order payload', async () => {
  const stub = await startStub((recorded) => {
    if (recorded.url === '/api/internal/logistics/create-order') {
      return { status: 200, body: { success: true, data: { awb_number: 'JNE-123', status: 'created' } } };
    }
    return { status: 404, body: {} };
  });

  try {
    const provider = new TembusAggregatorProvider({ baseUrl: stub.url, token: 'agg-token', providers: ['jne'] });
    const result = await provider.createShipment({
      orderNumber: 'ORD-2',
      origin: { name: 'Gudang', phone: '0811', addressLine: 'Jl A', city: 'Jakarta', postalCode: '10110' },
      destination: { name: 'Buyer', phone: '0812', addressLine: 'Jl B', city: 'Bandung', postalCode: '40111' },
      service: 'jne_REG',
      weightGrams: 1500,
      items: [{ name: 'Kaos', quantity: 2, weightGrams: 750, value: 100000 }],
    });

    const request = stub.received[0];
    assert.strictEqual(request.method, 'POST');
    assert.strictEqual(request.body.provider, 'jne');
    assert.strictEqual(request.body.reference_id, 'ORD-2');
    assert.strictEqual(request.body.origin_code, 'Jakarta');
    assert.strictEqual(request.body.destination_code, 'Bandung');
    assert.strictEqual(request.body.weight_kg, 1.5);
    assert.strictEqual(request.body.service_type, 'REG');
    assert.strictEqual(request.body.item_value, 200000);

    assert.strictEqual(result.awb, 'JNE-123');
    assert.strictEqual(result.mode, 'aggregator');
  } finally {
    await stub.close();
  }
});

test('aggregator label uses the resi render endpoint and pickup stays unsupported', async () => {
  const provider = new TembusAggregatorProvider({ baseUrl: 'https://staging-api.bawain.my.id', token: 't' });
  const label = await provider.printLabel('JNE-1');
  assert.strictEqual(label.labelUrl, 'https://staging-api.bawain.my.id/api/resi/render/JNE-1');

  await assert.rejects(
    () =>
      provider.schedulePickup({
        origin: { name: 'Gudang', phone: '1', addressLine: 'Jl', city: 'Jakarta' },
        shipmentAwbs: ['JNE-1'],
        pickupDate: '2026-11-11',
      }),
    (err: unknown) => {
      assert.ok(err instanceof LogisticGatewayError);
      assert.strictEqual(err.statusCode, 501);
      return true;
    }
  );
});

test('on-demand pickup scheduling is explicitly unsupported', async () => {
  const provider = new TembusOnDemandProvider({ apiKey: 'k' });
  await assert.rejects(
    () =>
      provider.schedulePickup({
        origin: { name: 'Gudang', phone: '1', addressLine: 'Jl', city: 'Jakarta' },
        shipmentAwbs: ['ord-1'],
        pickupDate: '2026-11-11',
      }),
    (err: unknown) => {
      assert.ok(err instanceof LogisticGatewayError);
      assert.strictEqual(err.statusCode, 501);
      return true;
    }
  );
});
