import test from 'node:test';
import assert from 'node:assert';
import {
  renderTemplate,
  buildDeepLink,
  decideChannels,
} from '../services/notifications/notificationService.js';
import { templateForOrderEvent } from '../services/notifications/orderNotifications.js';

test('renderTemplate replaces placeholders correctly', () => {
  const tpl = 'Pesanan {{orderNumber}} total {{totalAmount}}';
  const result = renderTemplate(tpl, { orderNumber: 'ORD-123', totalAmount: 'Rp 50.000' });
  assert.strictEqual(result, 'Pesanan ORD-123 total Rp 50.000');
});

test('buildDeepLink formats relative patterns correctly', () => {
  const link = buildDeepLink('/orders/{{orderNumber}}', { orderNumber: 'ORD-456' });
  assert.strictEqual(link, '/orders/ORD-456');

  const relativeLink = buildDeepLink('orders/{{id}}', { id: '99' });
  assert.strictEqual(relativeLink, '/orders/99');
});

test('decideChannels honors user preferences and template channel', () => {
  const prefBoth = decideChannels({ inApp: true, email: true }, 'both');
  assert.deepStrictEqual(prefBoth, { inApp: true, email: true });

  const prefInAppOnly = decideChannels({ inApp: true, email: false }, 'both');
  assert.deepStrictEqual(prefInAppOnly, { inApp: true, email: false });

  const templateInApp = decideChannels({ inApp: true, email: true }, 'in_app');
  assert.deepStrictEqual(templateInApp, { inApp: true, email: false });
});

test('templateForOrderEvent maps events correctly', () => {
  assert.strictEqual(templateForOrderEvent('created'), 'order.created');
  assert.strictEqual(templateForOrderEvent('paid'), 'order.paid');
  assert.strictEqual(templateForOrderEvent('shipped'), 'order.shipped');
  assert.strictEqual(templateForOrderEvent('delivered'), 'order.delivered');
  assert.strictEqual(templateForOrderEvent('payment_failed'), 'payment.failed');
  assert.strictEqual(templateForOrderEvent('unknown'), null);
});
