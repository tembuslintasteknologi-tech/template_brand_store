import { describe, it } from 'node:test';
import assert from 'node:assert';
import { OrderSourceError } from '../services/branch/orderSourceService.js';
import {
  assembleShippingOptions,
  resolveSelectedShippingOption,
  listShippingOptions,
  type ShippingOption,
} from '../services/shipping/shippingOptionsService.js';
import type { ShippingService } from '../services/logistics/logisticProvider.js';

// The quoting half of BR-010 needs Postgres and a live courier API, so this suite covers the
// decision layer: which quoted services may be shown, in what order, and whether the customer
// selection is actually one of them.

function quoted(overrides: Partial<ShippingService> = {}): ShippingService {
  return {
    provider: 'tembus_aggregator',
    mode: 'aggregator',
    service: 'JNE_REG',
    name: 'JNE Regular',
    estimatedDays: '2-4',
    cost: 18000,
    isAvailable: true,
    ...overrides,
  };
}

function option(overrides: Partial<ShippingOption> = {}): ShippingOption {
  return {
    mode: 'aggregator',
    provider: 'tembus_aggregator',
    service: 'JNE_REG',
    name: 'JNE Regular',
    cost: 18000,
    estimatedDays: '2-4',
    ...overrides,
  };
}

function isOrderSourceError(code: string, status = 400) {
  return (err: unknown) => {
    assert.ok(err instanceof OrderSourceError, `expected OrderSourceError, got ${String(err)}`);
    assert.strictEqual(err.code, code);
    assert.strictEqual(err.status, status);
    return true;
  };
}

describe('assembleShippingOptions', () => {
  it('keeps only services whose mode is allowed', () => {
    const options = assembleShippingOptions(
      [
        quoted({ mode: 'ondemand', provider: 'tembus_ondemand', service: 'instant', cost: 25000 }),
        quoted(),
      ],
      { modes: ['aggregator'] }
    );

    assert.strictEqual(options.length, 1);
    assert.strictEqual(options[0].mode, 'aggregator');
  });

  it('drops a service the provider marked unavailable', () => {
    const options = assembleShippingOptions([quoted({ isAvailable: false })], {
      modes: ['aggregator'],
    });

    assert.deepStrictEqual(options, []);
  });

  it('drops a negative or non numeric cost instead of showing it', () => {
    const options = assembleShippingOptions(
      [
        quoted({ service: 'NEG', cost: -1 }),
        quoted({ service: 'NAN', cost: Number.NaN }),
        quoted({ service: 'OK', cost: 12000 }),
      ],
      { modes: ['aggregator'] }
    );

    assert.deepStrictEqual(
      options.map((entry) => entry.service),
      ['OK']
    );
  });

  it('deduplicates the same mode and service', () => {
    const options = assembleShippingOptions([quoted(), quoted({ cost: 20000 })], {
      modes: ['aggregator'],
    });

    assert.strictEqual(options.length, 1);
    assert.strictEqual(options[0].cost, 18000);
  });

  it('orders ondemand before 3PL even when 3PL is cheaper', () => {
    const options = assembleShippingOptions(
      [
        quoted({ cost: 9000, service: 'JNE_REG' }),
        quoted({ mode: 'ondemand', provider: 'tembus_ondemand', service: 'instant', cost: 30000 }),
      ],
      { modes: ['ondemand', 'aggregator'] }
    );

    assert.deepStrictEqual(
      options.map((entry) => entry.mode),
      ['ondemand', 'aggregator']
    );
  });

  it('orders by price inside one mode', () => {
    const options = assembleShippingOptions(
      [quoted({ service: 'JNT_REG', cost: 22000 }), quoted({ service: 'JNE_REG', cost: 15000 })],
      { modes: ['aggregator'] }
    );

    assert.deepStrictEqual(
      options.map((entry) => entry.service),
      ['JNE_REG', 'JNT_REG']
    );
  });

  it('carries provider, name, estimate and add-ons through unchanged', () => {
    const [entry] = assembleShippingOptions(
      [quoted({ codSupported: true, insuranceCost: 2500 })],
      { modes: ['aggregator'] }
    );

    assert.strictEqual(entry.provider, 'tembus_aggregator');
    assert.strictEqual(entry.name, 'JNE Regular');
    assert.strictEqual(entry.estimatedDays, '2-4');
    assert.strictEqual(entry.codSupported, true);
    assert.strictEqual(entry.insuranceCost, 2500);
  });

  it('returns nothing for an empty provider response', () => {
    assert.deepStrictEqual(assembleShippingOptions([], { modes: ['ondemand', 'aggregator'] }), []);
  });
});

describe('resolveSelectedShippingOption', () => {
  const options = [
    option({ mode: 'ondemand', provider: 'tembus_ondemand', service: 'instant', cost: 25000 }),
    option({ mode: 'aggregator', service: 'JNE_REG', cost: 18000 }),
    option({ mode: 'aggregator', service: 'JNT_REG', cost: 21000 }),
  ];

  it('picks the exact aggregator service the customer named', () => {
    const selected = resolveSelectedShippingOption(options, {
      selectedMode: 'aggregator',
      selectedService: 'JNT_REG',
    });

    assert.strictEqual(selected.service, 'JNT_REG');
    assert.strictEqual(selected.cost, 21000);
  });

  it('matches the service name case insensitively and ignores padding', () => {
    const selected = resolveSelectedShippingOption(options, {
      selectedMode: 'AGGREGATOR',
      selectedService: '  jne_reg ',
    });

    assert.strictEqual(selected.service, 'JNE_REG');
  });

  it('requires a service when the mode is aggregator', () => {
    assert.throws(
      () => resolveSelectedShippingOption(options, { selectedMode: 'aggregator' }),
      isOrderSourceError('SHIPPING_SERVICE_REQUIRED')
    );
  });

  it('rejects a service that was not quoted for this route', () => {
    assert.throws(
      () =>
        resolveSelectedShippingOption(options, {
          selectedMode: 'aggregator',
          selectedService: 'SICEPAT_REG',
        }),
      isOrderSourceError('SHIPPING_SERVICE_NOT_AVAILABLE')
    );
  });

  it('does not let an aggregator service slip through under ondemand', () => {
    assert.throws(
      () =>
        resolveSelectedShippingOption(options, {
          selectedMode: 'ondemand',
          selectedService: 'JNE_REG',
        }),
      isOrderSourceError('SHIPPING_SERVICE_NOT_AVAILABLE')
    );
  });

  it('rejects a mode that the branch does not offer', () => {
    const onlyAggregator = options.filter((entry) => entry.mode === 'aggregator');

    assert.throws(
      () => resolveSelectedShippingOption(onlyAggregator, { selectedMode: 'ondemand' }),
      isOrderSourceError('SHIPPING_MODE_NOT_AVAILABLE')
    );
  });

  it('rejects everything when there is no option at all', () => {
    assert.throws(
      () => resolveSelectedShippingOption([], { selectedMode: 'aggregator', selectedService: 'JNE_REG' }),
      isOrderSourceError('SHIPPING_MODE_NOT_AVAILABLE')
    );
  });

  it('rejects an unknown mode instead of guessing one', () => {
    assert.throws(
      () => resolveSelectedShippingOption(options, { selectedMode: 'kilat' }),
      isOrderSourceError('INVALID_FULFILLMENT_MODE')
    );
  });

  it('uses the first ondemand service when the customer did not name a model', () => {
    const selected = resolveSelectedShippingOption(options, { selectedMode: 'ondemand' });

    assert.strictEqual(selected.mode, 'ondemand');
    assert.strictEqual(selected.service, 'instant');
  });

  it('falls back to the first option in display order when nothing was selected', () => {
    const selected = resolveSelectedShippingOption(options, {});

    assert.strictEqual(selected.mode, 'ondemand');
    assert.strictEqual(selected.service, 'instant');
  });

  it('honours a service even when the mode is omitted', () => {
    const selected = resolveSelectedShippingOption(options, { selectedService: 'JNT_REG' });

    assert.strictEqual(selected.service, 'JNT_REG');
  });
});

describe('listShippingOptions guards', () => {
  it('rejects a blank branch id before touching the database', async () => {
    await assert.rejects(
      () => listShippingOptions({ branchId: '   ' }),
      isOrderSourceError('BRANCH_REQUIRED')
    );
  });
});
