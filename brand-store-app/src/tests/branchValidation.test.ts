import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  BRANCH_CODE_PATTERN,
  BranchValidationError,
  assertBranchDeactivatable,
  assertBranchDeletable,
  assertOndemandUsable,
  generateBranchCode,
  normalizeBranchCode,
  validateCoordinates,
  validateServiceRadius,
} from '../services/branch/branchValidation.js';
import { storeLocationSchema } from '../services/config/storeLocations.js';

function expectCode(fn: () => unknown, code: string) {
  try {
    fn();
  } catch (err) {
    assert.ok(err instanceof BranchValidationError, `expected BranchValidationError, got ${err}`);
    assert.strictEqual((err as BranchValidationError).code, code);
    return;
  }
  assert.fail(`expected ${code} to be thrown`);
}

describe('branch code validation', () => {
  it('uppercases and turns spaces into dashes', () => {
    assert.strictEqual(normalizeBranchCode(' cbg jogja '), 'CBG-JOGJA');
    assert.strictEqual(normalizeBranchCode('pusat'), 'PUSAT');
    assert.match(normalizeBranchCode('CBG-01'), BRANCH_CODE_PATTERN);
  });

  it('rejects codes that are too short or contain invalid characters', () => {
    expectCode(() => normalizeBranchCode('A'), 'INVALID_CODE');
    expectCode(() => normalizeBranchCode('CBG_JOGJA'), 'INVALID_CODE');
    expectCode(() => normalizeBranchCode(123), 'INVALID_CODE');
  });

  it('generates a unique shaped fallback code', () => {
    const code = generateBranchCode();
    assert.match(code, BRANCH_CODE_PATTERN);
    assert.notStrictEqual(code, generateBranchCode());
  });
});

describe('coordinate validation', () => {
  it('accepts numbers and numeric strings inside range', () => {
    assert.deepStrictEqual(validateCoordinates(-7.79, '110.36'), { latitude: -7.79, longitude: 110.36 });
    assert.deepStrictEqual(validateCoordinates(null, null), { latitude: null, longitude: null });
    assert.deepStrictEqual(validateCoordinates(undefined, undefined), { latitude: null, longitude: null });
  });

  it('rejects out of range latitude and longitude', () => {
    expectCode(() => validateCoordinates(91, 110), 'INVALID_COORDINATES');
    expectCode(() => validateCoordinates(-7, 181), 'INVALID_COORDINATES');
    expectCode(() => validateCoordinates('abc', 110), 'INVALID_COORDINATES');
  });

  it('rejects half a coordinate pair', () => {
    expectCode(() => validateCoordinates(-7.79, null), 'INCOMPLETE_COORDINATES');
    expectCode(() => validateCoordinates(null, 110.36), 'INCOMPLETE_COORDINATES');
  });
});

describe('ondemand and service radius rules', () => {
  it('allows ondemand when coordinates exist', () => {
    assert.doesNotThrow(() =>
      assertOndemandUsable({ ondemandEnabled: true, latitude: -7.79, longitude: 110.36 })
    );
  });

  it('allows a branch without coordinates as long as ondemand is off', () => {
    assert.doesNotThrow(() =>
      assertOndemandUsable({ ondemandEnabled: false, latitude: null, longitude: null })
    );
  });

  it('refuses ondemand without coordinates', () => {
    expectCode(
      () => assertOndemandUsable({ ondemandEnabled: true, latitude: null, longitude: null }),
      'ONDEMAND_REQUIRES_COORDINATES'
    );
  });

  it('accepts a positive radius and rejects nonsense', () => {
    assert.strictEqual(validateServiceRadius('15'), 15);
    assert.strictEqual(validateServiceRadius(null), null);
    expectCode(() => validateServiceRadius(0), 'INVALID_SERVICE_RADIUS');
    expectCode(() => validateServiceRadius(2.5), 'INVALID_SERVICE_RADIUS');
    expectCode(() => validateServiceRadius(999), 'INVALID_SERVICE_RADIUS');
  });
});

describe('branch lifecycle guards', () => {
  it('refuses to deactivate a branch that still has available stock', () => {
    expectCode(() => assertBranchDeactivatable(3), 'BRANCH_HAS_STOCK');
  });

  it('allows deactivation when available stock is zero', () => {
    assert.doesNotThrow(() => assertBranchDeactivatable(0));
  });

  it('refuses to delete the default location', () => {
    expectCode(() => assertBranchDeletable(true), 'BRANCH_IS_DEFAULT');
    assert.doesNotThrow(() => assertBranchDeletable(false));
  });
});

describe('storeLocationSchema', () => {
  it('accepts the new branch fields', () => {
    const parsed = storeLocationSchema.safeParse({
      code: 'CBG-JOGJA',
      name: 'Cabang Jogja',
      type: 'cabang',
      addressLine: 'Jl. Malioboro 1',
      city: 'Yogyakarta',
      province: 'DIY',
      postalCode: '55271',
      latitude: -7.79,
      longitude: 110.36,
      ondemandEnabled: true,
      serviceRadiusKm: 10,
      managerName: 'Budi',
      isOnline: true,
    });
    assert.strictEqual(parsed.success, true);
  });

  it('rejects an unknown branch type', () => {
    const parsed = storeLocationSchema.safeParse({
      name: 'Cabang Jogja',
      type: 'gudang',
      addressLine: 'Jl. Malioboro 1',
      city: 'Yogyakarta',
      province: 'DIY',
      postalCode: '55271',
    });
    assert.strictEqual(parsed.success, false);
  });
});
