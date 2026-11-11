import test from 'node:test';
import assert from 'node:assert';
import {
  LogisticProvider,
  RateCalculationParams,
  ShippingService,
  TrackingInfo,
} from '../services/logistics/logisticProvider.js';
import { LogisticAggregator, maxDays } from '../services/logistics/logisticAggregator.js';
import {
  normalizeShipmentStatus,
  shipmentStatusToOrderStatus,
  isTerminalShipmentStatus,
  resolveDeliveryFailure,
} from '../services/logistics/statusMap.js';

const params: RateCalculationParams = {
  origin: { name: 'Gudang', phone: '0811', addressLine: 'Jl. A', city: 'Jakarta' },
  destination: { name: 'Buyer', phone: '0812', addressLine: 'Jl. B', city: 'Bandung' },
  weightGrams: 1000,
};

function makeProvider(
  name: string,
  mode: 'ondemand' | 'aggregator',
  rates: ShippingService[],
  options: { failRates?: boolean; failTrack?: boolean } = {}
): LogisticProvider {
  return {
    name,
    mode,
    async getServices() {
      return rates;
    },
    async calculateRate() {
      if (options.failRates) throw new Error('provider down');
      return rates;
    },
    async createShipment() {
      return { awb: `${name.toUpperCase()}-1`, provider: name, mode, service: 'REG', status: 'created' as const };
    },
    async cancelShipment() {},
    async printLabel(awb: string) {
      return { awb, labelUrl: `https://label.test/${awb}.pdf` };
    },
    async trackShipment(awb: string): Promise<TrackingInfo> {
      if (options.failTrack) throw new Error('not found');
      return { awb, provider: name, status: 'in_transit', history: [] };
    },
    async schedulePickup() {
      return { pickupId: 'pickup-1', scheduledAt: '2026-11-11T09:00:00Z', status: 'scheduled' as const };
    },
    verifyWebhook() {
      return true;
    },
    parseWebhookPayload(payload: any) {
      return {
        awb: String(payload?.awb ?? ''),
        status: normalizeShipmentStatus(payload?.status),
        rawStatus: String(payload?.status ?? ''),
        timestamp: '2026-11-11T09:00:00Z',
      };
    },
  };
}

test('normalizeShipmentStatus maps known raw statuses and falls back to created', () => {
  assert.strictEqual(normalizeShipmentStatus('PICKED_UP'), 'picked_up');
  assert.strictEqual(normalizeShipmentStatus('in transit'), 'in_transit');
  assert.strictEqual(normalizeShipmentStatus('Out-For-Delivery'), 'out_for_delivery');
  assert.strictEqual(normalizeShipmentStatus('DELIVERED'), 'delivered');
  assert.strictEqual(normalizeShipmentStatus('delivery_failed'), 'failed');
  assert.strictEqual(normalizeShipmentStatus('returned'), 'returned');
  assert.strictEqual(normalizeShipmentStatus('something-unknown'), 'created');
  assert.strictEqual(normalizeShipmentStatus(undefined), 'created');
});

test('shipmentStatusToOrderStatus maps shipment states onto order states', () => {
  assert.strictEqual(shipmentStatusToOrderStatus('created'), 'processing');
  assert.strictEqual(shipmentStatusToOrderStatus('picked_up'), 'processing');
  assert.strictEqual(shipmentStatusToOrderStatus('in_transit'), 'shipped');
  assert.strictEqual(shipmentStatusToOrderStatus('out_for_delivery'), 'shipped');
  assert.strictEqual(shipmentStatusToOrderStatus('delivered'), 'delivered');
  assert.strictEqual(shipmentStatusToOrderStatus('cancelled'), 'cancelled');
  assert.strictEqual(shipmentStatusToOrderStatus('returned'), 'cancelled');
  assert.strictEqual(shipmentStatusToOrderStatus('failed'), null);
});

test('isTerminalShipmentStatus only for delivered, cancelled and returned', () => {
  assert.strictEqual(isTerminalShipmentStatus('delivered'), true);
  assert.strictEqual(isTerminalShipmentStatus('cancelled'), true);
  assert.strictEqual(isTerminalShipmentStatus('returned'), true);
  assert.strictEqual(isTerminalShipmentStatus('in_transit'), false);
  assert.strictEqual(isTerminalShipmentStatus('failed'), false);
});

test('maxDays reads the largest day number from the estimate string', () => {
  assert.strictEqual(maxDays('3-5'), 5);
  assert.strictEqual(maxDays('1-2'), 2);
  assert.strictEqual(maxDays('0-1'), 1);
  assert.strictEqual(maxDays('same day'), Number.POSITIVE_INFINITY);
});

test('aggregator compares rates across providers sorted by cost', async () => {
  const aggregator = new LogisticAggregator();
  aggregator.register(
    makeProvider('tembus_ondemand', 'ondemand', [
      { provider: 'tembus_ondemand', mode: 'ondemand', service: 'SAME_DAY', name: 'Same Day', estimatedDays: '0-1', cost: 55000, isAvailable: true },
    ])
  );
  aggregator.register(
    makeProvider('tembus_aggregator', 'aggregator', [
      { provider: 'tembus_aggregator', mode: 'aggregator', service: 'REG', name: 'Regular', estimatedDays: '3-5', cost: 15000, isAvailable: true },
      { provider: 'tembus_aggregator', mode: 'aggregator', service: 'EXP', name: 'Express', estimatedDays: '1-2', cost: 35000, isAvailable: true },
    ])
  );

  const rates = await aggregator.compareRates(params);
  assert.deepStrictEqual(
    rates.map((rate) => [rate.provider, rate.service, rate.cost]),
    [
      ['tembus_aggregator', 'REG', 15000],
      ['tembus_aggregator', 'EXP', 35000],
      ['tembus_ondemand', 'SAME_DAY', 55000],
    ]
  );
});

test('aggregator picks cheapest and fastest available service', async () => {
  const aggregator = new LogisticAggregator();
  aggregator.register(
    makeProvider('ondemand', 'ondemand', [
      { provider: 'ondemand', mode: 'ondemand', service: 'SAME_DAY', name: 'Same Day', estimatedDays: '0-1', cost: 55000, isAvailable: true },
    ])
  );
  aggregator.register(
    makeProvider('aggregator', 'aggregator', [
      { provider: 'aggregator', mode: 'aggregator', service: 'REG', name: 'Regular', estimatedDays: '3-5', cost: 15000, isAvailable: true },
      { provider: 'aggregator', mode: 'aggregator', service: 'EXP', name: 'Express', estimatedDays: '1-2', cost: 35000, isAvailable: true },
    ])
  );

  const cheapest = await aggregator.pickCheapest(params);
  assert.strictEqual(cheapest?.service, 'REG');
  assert.strictEqual(cheapest?.cost, 15000);

  const fastest = await aggregator.pickFastest(params);
  assert.strictEqual(fastest?.service, 'SAME_DAY');
  assert.strictEqual(fastest?.cost, 55000);
});

test('aggregator keeps going when one provider fails (failover)', async () => {
  const aggregator = new LogisticAggregator();
  aggregator.register(makeProvider('broken', 'aggregator', [], { failRates: true }));
  aggregator.register(
    makeProvider('healthy', 'aggregator', [
      { provider: 'healthy', mode: 'aggregator', service: 'REG', name: 'Regular', estimatedDays: '2-3', cost: 20000, isAvailable: true },
    ])
  );

  const rates = await aggregator.compareRates(params);
  assert.strictEqual(rates.length, 1);
  assert.strictEqual(rates[0].provider, 'healthy');
});

test('aggregator throws when every provider fails', async () => {
  const aggregator = new LogisticAggregator();
  aggregator.register(makeProvider('a', 'aggregator', [], { failRates: true }));
  aggregator.register(makeProvider('b', 'aggregator', [], { failRates: true }));
  await assert.rejects(() => aggregator.compareRates(params), /All logistics providers failed/);
});

test('aggregator resolves tracking across providers and rejects unknown provider', async () => {
  const aggregator = new LogisticAggregator();
  aggregator.register(makeProvider('first', 'aggregator', [], { failTrack: true }));
  aggregator.register(makeProvider('second', 'ondemand', []));

  const tracked = await aggregator.trackAny('AWB-123');
  assert.strictEqual(tracked.provider, 'second');
  assert.strictEqual(tracked.awb, 'AWB-123');

  assert.throws(() => aggregator.get('nope'), /Unknown logistics provider/);
});

test('aggregator registers providers and lists their names', () => {
  const aggregator = new LogisticAggregator();
  aggregator.register(makeProvider('tembus_aggregator', 'aggregator', []));
  aggregator.register(makeProvider('tembus_ondemand', 'ondemand', []));

  assert.deepStrictEqual(aggregator.names().sort(), ['tembus_aggregator', 'tembus_ondemand']);
  assert.deepStrictEqual(
    aggregator.list().map((entry) => [entry.name, entry.mode]).sort(),
    [
      ['tembus_aggregator', 'aggregator'],
      ['tembus_ondemand', 'ondemand'],
    ]
  );
});


test('resolveDeliveryFailure maps admin actions to shipment and order status', () => {
  assert.deepStrictEqual(resolveDeliveryFailure('retry'), { shipmentStatus: 'in_transit', orderStatus: 'shipped' });
  assert.deepStrictEqual(resolveDeliveryFailure('return_to_sender'), { shipmentStatus: 'returned', orderStatus: 'cancelled' });
  assert.deepStrictEqual(resolveDeliveryFailure('cancel'), { shipmentStatus: 'cancelled', orderStatus: 'cancelled' });
});
