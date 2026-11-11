import { test, describe } from 'node:test';
import assert from 'node:assert';
import { OtpService } from '../services/otp/otpService.js';

describe('OtpService', () => {
  test('generates a 6 digit code', async () => {
    const service = new OtpService();
    const code = await service.generateOtp('+628123456789');
    assert.strictEqual(code.length, 6);
  });

  test('verifies correct code', async () => {
    const service = new OtpService();
    const result = await service.verifyOtp('+628123456789', '123456');
    assert.strictEqual(result, true);
  });
});
