import test from 'node:test';
import assert from 'node:assert';
import { createApp } from '../app.js';

test('Checkout API Endpoints', async (t) => {
  const app = createApp();

  await t.test('POST /api/v1/checkout/quote', async () => {
    const res = await app.request('/api/v1/checkout/quote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: [{ productId: 'p1', quantity: 2, price: 50000, name: 'Item 1' }],
        shippingAmount: 20000,
      }),
    });
    assert.strictEqual(res.status, 200);
    const json: any = await res.json();
    assert.strictEqual(json.success, true);
    assert.strictEqual(json.data.subtotal, 100000);
    assert.strictEqual(json.data.shippingAmount, 20000);
    assert.strictEqual(json.data.grandTotal, 131000); // 100k + 11% tax (11k) + 20k shipping
  });

  await t.test('POST /api/v1/checkout/shipping-rates', async () => {
    const res = await app.request('/api/v1/checkout/shipping-rates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ destinationCity: 'Surabaya', weightKg: 2 }),
    });
    assert.strictEqual(res.status, 200);
    const json: any = await res.json();
    assert.strictEqual(json.success, true);
    assert.strictEqual(json.data.destinationCity, 'Surabaya');
    assert.ok(json.data.services.length > 0);
  });

  await t.test('POST /api/v1/checkout/process and GET status', async () => {
    const processRes = await app.request('/api/v1/checkout/process', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: 'user-123',
        items: [{ productId: 'p1', quantity: 1, price: 75000, name: 'P1' }],
        shippingAddress: { city: 'Jakarta', address: 'Jl. Merdeka 1' },
      }),
    });
    assert.strictEqual(processRes.status, 200);
    const processJson: any = await processRes.json();
    assert.strictEqual(processJson.success, true);
    assert.ok(processJson.data.orderNumber);

    const orderId = processJson.data.orderId;
    const statusRes = await app.request(`/api/v1/checkout/${orderId}/status`);
    assert.strictEqual(statusRes.status, 200);
    const statusJson: any = await statusRes.json();
    assert.strictEqual(statusJson.success, true);
    assert.strictEqual(statusJson.data.orderId, orderId);
  });
});
