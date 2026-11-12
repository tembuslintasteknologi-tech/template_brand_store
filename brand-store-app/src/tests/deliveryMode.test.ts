import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  DEFAULT_SERVICE_RADIUS_KM,
  haversineDistanceKm,
  isOndemandAvailable,
  parseCoordinates,
  resolveDeliveryModes,
  roundKm,
} from '../services/shipping/deliveryModeService.js';

describe('resolveDeliveryModes', () => {
  it('returns aggregator only when the destination has no coordinates', () => {
    const result = resolveDeliveryModes({
      distanceKm: null,
      ondemandEnabled: true,
      serviceRadiusKm: 10,
      hasDestinationCoords: false,
    });
    assert.deepStrictEqual(result.modes, ['aggregator']);
    assert.strictEqual(result.reason, 'no_destination_coords');
    assert.strictEqual(result.distanceKm, null);
  });

  it('ignores a distance value when the caller says there are no coordinates', () => {
    const result = resolveDeliveryModes({
      distanceKm: 2,
      ondemandEnabled: true,
      serviceRadiusKm: 10,
      hasDestinationCoords: false,
    });
    assert.deepStrictEqual(result.modes, ['aggregator']);
    assert.strictEqual(result.reason, 'no_destination_coords');
  });

  it('returns aggregator only when ondemand is disabled on the branch', () => {
    const result = resolveDeliveryModes({
      distanceKm: 3,
      ondemandEnabled: false,
      serviceRadiusKm: 10,
      hasDestinationCoords: true,
    });
    assert.deepStrictEqual(result.modes, ['aggregator']);
    assert.strictEqual(result.reason, 'ondemand_disabled');
  });

  it('returns aggregator only outside the service radius', () => {
    const result = resolveDeliveryModes({
      distanceKm: 10.01,
      ondemandEnabled: true,
      serviceRadiusKm: 10,
      hasDestinationCoords: true,
    });
    assert.deepStrictEqual(result.modes, ['aggregator']);
    assert.strictEqual(result.reason, 'outside_radius');
  });

  it('treats the radius boundary as inside', () => {
    const result = resolveDeliveryModes({
      distanceKm: 10,
      ondemandEnabled: true,
      serviceRadiusKm: 10,
      hasDestinationCoords: true,
    });
    assert.strictEqual(result.reason, 'within_radius');
    assert.deepStrictEqual(result.modes, ['ondemand', 'aggregator']);
  });

  it('offers both modes inside the radius by default', () => {
    const result = resolveDeliveryModes({
      distanceKm: 0.4,
      ondemandEnabled: true,
      serviceRadiusKm: 10,
      hasDestinationCoords: true,
    });
    assert.deepStrictEqual(result.modes, ['ondemand', 'aggregator']);
    assert.strictEqual(isOndemandAvailable(result), true);
  });

  it('hides aggregator inside the radius when the setting is off', () => {
    const result = resolveDeliveryModes({
      distanceKm: 0.4,
      ondemandEnabled: true,
      serviceRadiusKm: 10,
      hasDestinationCoords: true,
      showAggregatorWithinRadius: false,
    });
    assert.deepStrictEqual(result.modes, ['ondemand']);
  });

  it('never returns an empty mode list', () => {
    const cases = [
      { distanceKm: null, ondemandEnabled: true, serviceRadiusKm: 10, hasDestinationCoords: false },
      { distanceKm: 1, ondemandEnabled: false, serviceRadiusKm: 10, hasDestinationCoords: true },
      { distanceKm: 99, ondemandEnabled: true, serviceRadiusKm: 10, hasDestinationCoords: true },
      { distanceKm: 1, ondemandEnabled: true, serviceRadiusKm: 10, hasDestinationCoords: true },
    ];
    for (const input of cases) {
      const modes = resolveDeliveryModes(input).modes;
      assert.ok(modes.length > 0, `modes kosong untuk ${JSON.stringify(input)}`);
      assert.ok(modes.includes('aggregator') || modes.includes('ondemand'));
    }
  });

  it('falls back to the default radius when the branch has none', () => {
    const result = resolveDeliveryModes({
      distanceKm: DEFAULT_SERVICE_RADIUS_KM + 1,
      ondemandEnabled: true,
      serviceRadiusKm: null,
      hasDestinationCoords: true,
    });
    assert.strictEqual(result.radiusKm, DEFAULT_SERVICE_RADIUS_KM);
    assert.strictEqual(result.reason, 'outside_radius');
  });

  it('ignores a nonsense radius instead of treating it as zero', () => {
    const result = resolveDeliveryModes({
      distanceKm: 5,
      ondemandEnabled: true,
      serviceRadiusKm: 0,
      hasDestinationCoords: true,
    });
    assert.strictEqual(result.radiusKm, DEFAULT_SERVICE_RADIUS_KM);
    assert.strictEqual(result.reason, 'within_radius');
  });
});

describe('haversineDistanceKm', () => {
  it('returns zero for the same point', () => {
    const point = { latitude: -6.2088, longitude: 106.8456 };
    assert.strictEqual(haversineDistanceKm(point, point), 0);
  });

  it('measures Jakarta to Bandung in the right ballpark', () => {
    const jakarta = { latitude: -6.2088, longitude: 106.8456 };
    const bandung = { latitude: -6.9175, longitude: 107.6191 };
    const km = haversineDistanceKm(jakarta, bandung);
    assert.ok(km > 110 && km < 130, `jarak Jakarta ke Bandung tidak wajar: ${km}`);
  });

  it('is symmetric', () => {
    const a = { latitude: -7.7970, longitude: 110.3705 };
    const b = { latitude: -6.2088, longitude: 106.8456 };
    assert.strictEqual(
      roundKm(haversineDistanceKm(a, b)),
      roundKm(haversineDistanceKm(b, a))
    );
  });

  it('rounds to two decimals for display', () => {
    assert.strictEqual(roundKm(1.23456), 1.23);
    assert.strictEqual(roundKm(9.999), 10);
  });
});

describe('parseCoordinates', () => {
  it('accepts numeric strings from a query string', () => {
    assert.deepStrictEqual(parseCoordinates({ latitude: '-7.79', longitude: '110.36' }), {
      latitude: -7.79,
      longitude: 110.36,
    });
  });

  it('accepts numbers from a decimal column', () => {
    assert.deepStrictEqual(parseCoordinates({ latitude: -7.79, longitude: 110.36 }), {
      latitude: -7.79,
      longitude: 110.36,
    });
  });

  it('rejects half a pair', () => {
    assert.strictEqual(parseCoordinates({ latitude: -7.79, longitude: null }), null);
    assert.strictEqual(parseCoordinates({ latitude: undefined, longitude: 110.36 }), null);
  });

  it('rejects out of range values', () => {
    assert.strictEqual(parseCoordinates({ latitude: 91, longitude: 110 }), null);
    assert.strictEqual(parseCoordinates({ latitude: -7, longitude: 181 }), null);
  });

  it('rejects the empty island at 0,0', () => {
    assert.strictEqual(parseCoordinates({ latitude: 0, longitude: 0 }), null);
  });

  it('rejects garbage', () => {
    assert.strictEqual(parseCoordinates({ latitude: 'abc', longitude: 'def' }), null);
  });
});
