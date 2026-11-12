import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  assembleBranches,
  BranchAvailabilityRow,
} from '../services/branch/branchAvailabilityService.js';

// Jakarta as the customer, Bandung and Surabaya as branches. Coordinates are real so the
// distance assertions stay meaningful instead of asserting on a mocked number.
const CUSTOMER = { latitude: -6.2088, longitude: 106.8456 };
const BANDUNG = { latitude: -6.9175, longitude: 107.6191 };
const SURABAYA = { latitude: -7.2575, longitude: 112.7521 };

function row(overrides: Partial<BranchAvailabilityRow> = {}): BranchAvailabilityRow {
  return {
    branchId: 'branch-1',
    code: 'CBG-AAAA1111',
    name: 'Cabang Bandung',
    city: 'Bandung',
    latitude: BANDUNG.latitude,
    longitude: BANDUNG.longitude,
    ondemandEnabled: true,
    serviceRadiusKm: 50,
    available: 25,
    ...overrides,
  };
}

describe('assembleBranches stock filter', () => {
  it('drops a branch that has no sellable stock', () => {
    const result = assembleBranches([row({ available: 0 })]);
    assert.deepStrictEqual(result, []);
  });

  it('drops a branch whose reserved stock swallowed the stock', () => {
    const result = assembleBranches([row({ available: -3 })]);
    assert.deepStrictEqual(result, []);
  });

  it('keeps a branch with one unit left', () => {
    const result = assembleBranches([row({ available: 1 })], { lowStockThreshold: 5 });
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].available, 1);
  });

  it('reads the aggregate as a string, like postgres returns it', () => {
    const result = assembleBranches([row({ available: '12' })]);
    assert.strictEqual(result[0].available, 12);
    assert.strictEqual(typeof result[0].available, 'number');
  });

  it('drops a row whose aggregate is not a number at all', () => {
    const result = assembleBranches([row({ available: 'bukan angka' })]);
    assert.deepStrictEqual(result, []);
  });
});

describe('assembleBranches stock status', () => {
  it('marks stock at the threshold as low', () => {
    const result = assembleBranches([row({ available: 5 })], { lowStockThreshold: 5 });
    assert.strictEqual(result[0].stockStatus, 'low_stock');
  });

  it('marks stock above the threshold as in stock', () => {
    const result = assembleBranches([row({ available: 6 })], { lowStockThreshold: 5 });
    assert.strictEqual(result[0].stockStatus, 'in_stock');
  });

  it('falls back to five when the product has no threshold', () => {
    const low = assembleBranches([row({ available: 5 })], { lowStockThreshold: null });
    const high = assembleBranches([row({ available: 6 })], { lowStockThreshold: undefined });
    assert.strictEqual(low[0].stockStatus, 'low_stock');
    assert.strictEqual(high[0].stockStatus, 'in_stock');
  });
});

describe('assembleBranches distance and modes', () => {
  it('measures the distance when the customer sends coordinates', () => {
    const result = assembleBranches([row()], CUSTOMER);
    assert.ok(result[0].distanceKm !== null);
    assert.ok(
      result[0].distanceKm! > 100 && result[0].distanceKm! < 140,
      `jarak Jakarta ke Bandung tidak wajar: ${result[0].distanceKm}`
    );
  });

  it('offers ondemand only when the branch is inside the radius', () => {
    const near = assembleBranches(
      [
        row({
          latitude: -6.1754,
          longitude: 106.8272,
          serviceRadiusKm: 15,
        }),
      ],
      CUSTOMER
    );
    assert.strictEqual(near[0].ondemandAvailable, true);
    assert.deepStrictEqual(near[0].availableModes, ['ondemand', 'aggregator']);
  });

  it('drops ondemand when the branch is outside the radius', () => {
    const far = assembleBranches([row({ serviceRadiusKm: 15 })], CUSTOMER);
    assert.strictEqual(far[0].ondemandAvailable, false);
    assert.deepStrictEqual(far[0].availableModes, ['aggregator']);
  });

  it('drops ondemand when the customer sends no coordinates', () => {
    const result = assembleBranches([row()]);
    assert.strictEqual(result[0].distanceKm, null);
    assert.strictEqual(result[0].ondemandAvailable, false);
    assert.deepStrictEqual(result[0].availableModes, ['aggregator']);
  });

  it('drops ondemand when the branch has it disabled', () => {
    const result = assembleBranches([row({ ondemandEnabled: false, serviceRadiusKm: 500 })], CUSTOMER);
    assert.deepStrictEqual(result[0].availableModes, ['aggregator']);
  });

  it('hides aggregator inside the radius when the setting is off', () => {
    const result = assembleBranches(
      [row({ latitude: -6.1754, longitude: 106.8272, serviceRadiusKm: 15 })],
      { ...CUSTOMER, showAggregatorWithinRadius: false }
    );
    assert.deepStrictEqual(result[0].availableModes, ['ondemand']);
    assert.strictEqual(result[0].ondemandAvailable, true);
  });

  it('keeps a branch without coordinates but reports no distance', () => {
    const result = assembleBranches([row({ latitude: null, longitude: null })], CUSTOMER);
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].distanceKm, null);
    assert.deepStrictEqual(result[0].availableModes, ['aggregator']);
  });
});

describe('assembleBranches ordering', () => {
  it('sorts by distance, closest first', () => {
    const result = assembleBranches(
      [
        row({ branchId: 'surabaya', name: 'Cabang Surabaya', ...SURABAYA }),
        row({ branchId: 'bandung', name: 'Cabang Bandung', ...BANDUNG }),
      ],
      CUSTOMER
    );
    assert.deepStrictEqual(
      result.map((b) => b.branchId),
      ['bandung', 'surabaya']
    );
  });

  it('puts branches without coordinates after the measured ones', () => {
    const result = assembleBranches(
      [
        row({ branchId: 'tanpa-koordinat', name: 'Cabang Tanpa Peta', latitude: null, longitude: null }),
        row({ branchId: 'bandung', name: 'Cabang Bandung', ...BANDUNG }),
      ],
      CUSTOMER
    );
    assert.deepStrictEqual(
      result.map((b) => b.branchId),
      ['bandung', 'tanpa-koordinat']
    );
  });

  it('sorts by name when no distance can be measured at all', () => {
    const result = assembleBranches([
      row({ branchId: 'c', name: 'Cabang C' }),
      row({ branchId: 'a', name: 'Cabang A' }),
      row({ branchId: 'b', name: 'Cabang B' }),
    ]);
    assert.deepStrictEqual(
      result.map((b) => b.branchId),
      ['a', 'b', 'c']
    );
  });
});
