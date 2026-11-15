import test from 'node:test';
import assert from 'node:assert';
import {
  DEFAULT_REFERRAL_PROGRAM,
  REFERRAL_ALPHABET,
  REFERRAL_CODE_LENGTH,
  ReferralError,
  assertCanQualify,
  assertCanReward,
  assertReferralProgramConfig,
  assertReferralTransition,
  assertRefereeEligible,
  assertWithinReferralLimit,
  buildReferralLink,
  canTransitionReferral,
  generateReferralCode,
  normalizeReferralCode,
  parseReferralCodeFromInput,
  referralRewards,
} from '../services/referral/referralService.js';

function isReferralError(code: string) {
  return (err: unknown) => err instanceof ReferralError && err.code === code;
}

test('referral program config', async (t) => {
  await t.test('accepts the documented defaults', () => {
    const parsed = assertReferralProgramConfig(DEFAULT_REFERRAL_PROGRAM);
    assert.strictEqual(parsed.referrerPoints, 50);
    assert.strictEqual(parsed.refereePoints, 25);
    assert.strictEqual(parsed.maxReferralsPerUser, null);
  });

  await t.test('treats a missing limit as unlimited', () => {
    const parsed = assertReferralProgramConfig({ referrerPoints: 10, refereePoints: 5 });
    assert.strictEqual(parsed.maxReferralsPerUser, null);
  });

  await t.test('keeps zero rewards, since one side may get nothing', () => {
    const parsed = assertReferralProgramConfig({
      referrerPoints: 0,
      refereePoints: 0,
      maxReferralsPerUser: 0,
    });
    assert.deepStrictEqual(parsed, { referrerPoints: 0, refereePoints: 0, maxReferralsPerUser: 0 });
  });

  await t.test('rejects a non-object payload', () => {
    assert.throws(() => assertReferralProgramConfig(null), isReferralError('INVALID_REWARD'));
    assert.throws(() => assertReferralProgramConfig('50'), isReferralError('INVALID_REWARD'));
  });

  await t.test('rejects negative, fractional, and missing rewards', () => {
    assert.throws(
      () => assertReferralProgramConfig({ referrerPoints: -1, refereePoints: 25 }),
      isReferralError('INVALID_REWARD')
    );
    assert.throws(
      () => assertReferralProgramConfig({ referrerPoints: 10.5, refereePoints: 25 }),
      isReferralError('INVALID_REWARD')
    );
    assert.throws(
      () => assertReferralProgramConfig({ refereePoints: 25 }),
      isReferralError('INVALID_REWARD')
    );
  });

  await t.test('rejects a fractional or negative referral cap', () => {
    assert.throws(
      () => assertReferralProgramConfig({ referrerPoints: 50, refereePoints: 25, maxReferralsPerUser: 2.5 }),
      isReferralError('INVALID_LIMIT')
    );
    assert.throws(
      () => assertReferralProgramConfig({ referrerPoints: 50, refereePoints: 25, maxReferralsPerUser: -3 }),
      isReferralError('INVALID_LIMIT')
    );
  });
});

test('referral code generation', async (t) => {
  await t.test('is deterministic for the same seed and attempt', () => {
    const first = generateReferralCode('user-1');
    const second = generateReferralCode('user-1');
    assert.strictEqual(first, second);
  });

  await t.test('produces the documented length and alphabet', () => {
    const code = generateReferralCode('4f0c8b7e-1111-2222-3333-444455556666');
    assert.strictEqual(code.length, REFERRAL_CODE_LENGTH);
    for (const char of code) {
      assert.ok(REFERRAL_ALPHABET.includes(char), `karakter ${char} harus ada di alfabet`);
    }
    assert.ok(!/[ILO01]/.test(code), 'kode tidak boleh memuat karakter ambigu');
  });

  await t.test('changes when the attempt changes, so collisions can retry', () => {
    const attemptZero = generateReferralCode('user-1', 0);
    const attemptOne = generateReferralCode('user-1', 1);
    assert.notStrictEqual(attemptZero, attemptOne);
  });

  await t.test('differs across seeds in a sample of 500 users', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 500; i += 1) {
      seen.add(generateReferralCode(`user-${i}`));
    }
    assert.strictEqual(seen.size, 500, 'tidak boleh ada tabrakan pada sampel ini');
  });

  await t.test('rejects an empty seed and a negative attempt', () => {
    assert.throws(() => generateReferralCode(''), isReferralError('INVALID_CODE'));
    assert.throws(() => generateReferralCode('user-1', -1), isReferralError('INVALID_CODE'));
    assert.throws(() => generateReferralCode('user-1', 1.5), isReferralError('INVALID_CODE'));
  });
});

test('referral code normalisation', async (t) => {
  await t.test('uppercases and drops spaces and dashes', () => {
    assert.strictEqual(normalizeReferralCode(' abcd-2345 '), 'ABCD2345');
    assert.strictEqual(normalizeReferralCode('abcd 2345'), 'ABCD2345');
  });

  await t.test('rejects too short or too long input', () => {
    assert.throws(() => normalizeReferralCode('ABC'), isReferralError('INVALID_CODE_LENGTH'));
    assert.throws(() => normalizeReferralCode('A'.repeat(17)), isReferralError('INVALID_CODE_LENGTH'));
  });

  await t.test('rejects ambiguous characters', () => {
    assert.throws(() => normalizeReferralCode('ABCD234I'), isReferralError('INVALID_CODE'));
    assert.throws(() => normalizeReferralCode('ABCD234O'), isReferralError('INVALID_CODE'));
    assert.throws(() => normalizeReferralCode('ABCD2340'), isReferralError('INVALID_CODE'));
    assert.throws(() => normalizeReferralCode('ABCD2341'), isReferralError('INVALID_CODE'));
  });

  await t.test('rejects a non-string input', () => {
    assert.throws(() => normalizeReferralCode(12345), isReferralError('INVALID_CODE'));
  });
});

test('referral link handling', async (t) => {
  await t.test('joins base url and code', () => {
    assert.strictEqual(
      buildReferralLink('https://tembus.test', 'ABCD2345'),
      'https://tembus.test/r/ABCD2345'
    );
  });

  await t.test('normalises trailing slashes and keeps the path', () => {
    assert.strictEqual(
      buildReferralLink('https://tembus.test/store/', 'ABCD2345'),
      'https://tembus.test/store/r/ABCD2345'
    );
  });

  await t.test('rejects a non http base url or a broken url', () => {
    assert.throws(() => buildReferralLink('ftp://tembus.test', 'ABCD2345'), isReferralError('INVALID_BASE_URL'));
    assert.throws(() => buildReferralLink('not a url', 'ABCD2345'), isReferralError('INVALID_BASE_URL'));
    assert.throws(() => buildReferralLink('', 'ABCD2345'), isReferralError('INVALID_BASE_URL'));
  });

  await t.test('rejects an invalid code while building a link', () => {
    assert.throws(() => buildReferralLink('https://tembus.test', 'ABC'), isReferralError('INVALID_CODE_LENGTH'));
  });

  await t.test('parses a code out of a pasted link', () => {
    assert.strictEqual(
      parseReferralCodeFromInput('https://tembus.test/r/abcd-2345?utm=x'),
      'ABCD2345'
    );
  });

  await t.test('parses a bare code with surrounding whitespace', () => {
    assert.strictEqual(parseReferralCodeFromInput('  abcd2345 '), 'ABCD2345');
  });

  await t.test('rejects an empty claim input', () => {
    assert.throws(() => parseReferralCodeFromInput('   '), isReferralError('INVALID_CODE'));
  });
});

test('referral status transitions', async (t) => {
  await t.test('allows pending to qualified and cancelled', () => {
    assert.strictEqual(canTransitionReferral('pending', 'qualified'), true);
    assert.strictEqual(canTransitionReferral('pending', 'cancelled'), true);
    assert.strictEqual(canTransitionReferral('pending', 'rewarded'), false);
  });

  await t.test('allows qualified to rewarded and cancelled', () => {
    assert.strictEqual(canTransitionReferral('qualified', 'rewarded'), true);
    assert.strictEqual(canTransitionReferral('qualified', 'cancelled'), true);
    assert.strictEqual(canTransitionReferral('qualified', 'pending'), false);
  });

  await t.test('treats rewarded and cancelled as terminal', () => {
    assert.strictEqual(canTransitionReferral('rewarded', 'cancelled'), false);
    assert.strictEqual(canTransitionReferral('cancelled', 'pending'), false);
  });

  await t.test('throws a 409 on an illegal transition', () => {
    assert.throws(
      () => assertReferralTransition('pending', 'rewarded'),
      (err: unknown) => err instanceof ReferralError && err.code === 'INVALID_TRANSITION' && err.status === 409
    );
  });

  await t.test('only pending can be qualified, only qualified can be rewarded', () => {
    assert.doesNotThrow(() => assertCanQualify('pending'));
    assert.throws(() => assertCanQualify('qualified'), isReferralError('INVALID_TRANSITION'));
    assert.doesNotThrow(() => assertCanReward('qualified'));
    assert.throws(() => assertCanReward('pending'), isReferralError('INVALID_TRANSITION'));
  });
});

test('referee eligibility gate', async (t) => {
  const base = {
    referrerId: 'user-a',
    refereeId: 'user-b',
    alreadyReferred: false,
    hasPaidOrder: false,
  };

  await t.test('accepts a genuinely new referee', () => {
    assert.doesNotThrow(() => assertRefereeEligible(base));
  });

  await t.test('rejects self referral', () => {
    assert.throws(
      () => assertRefereeEligible({ ...base, refereeId: 'user-a' }),
      isReferralError('SELF_REFERRAL')
    );
  });

  await t.test('rejects a referee who already used a code', () => {
    assert.throws(
      () => assertRefereeEligible({ ...base, alreadyReferred: true }),
      isReferralError('ALREADY_REFERRED')
    );
  });

  await t.test('rejects a referee who already has a paid order', () => {
    assert.throws(
      () => assertRefereeEligible({ ...base, hasPaidOrder: true }),
      isReferralError('REFEREE_NOT_NEW')
    );
  });

  await t.test('rejects a missing referrer or referee id', () => {
    assert.throws(
      () => assertRefereeEligible({ ...base, referrerId: '' }),
      isReferralError('REFERRAL_NOT_FOUND')
    );
    assert.throws(
      () => assertRefereeEligible({ ...base, refereeId: '' }),
      isReferralError('REFERRAL_NOT_FOUND')
    );
  });
});

test('referral cap', async (t) => {
  await t.test('null means unlimited', () => {
    assert.doesNotThrow(() => assertWithinReferralLimit(1000, null));
  });

  await t.test('allows a count below the cap', () => {
    assert.doesNotThrow(() => assertWithinReferralLimit(2, 3));
  });

  await t.test('rejects a count at or above the cap', () => {
    assert.throws(() => assertWithinReferralLimit(3, 3), isReferralError('REFERRAL_LIMIT_REACHED'));
    assert.throws(() => assertWithinReferralLimit(4, 3), isReferralError('REFERRAL_LIMIT_REACHED'));
  });

  await t.test('treats a broken count as zero instead of allowing negative maths', () => {
    assert.doesNotThrow(() => assertWithinReferralLimit(Number.NaN, 1));
    assert.doesNotThrow(() => assertWithinReferralLimit(-5, 1));
  });
});

test('referral reward payload', async (t) => {
  await t.test('reads the configured reward for both sides', () => {
    assert.deepStrictEqual(referralRewards({ referrerPoints: 80, refereePoints: 40, maxReferralsPerUser: 5 }), {
      referrerPoints: 80,
      refereePoints: 40,
    });
  });

  await t.test('falls back to the defaults when no config is passed', () => {
    assert.deepStrictEqual(referralRewards(), {
      referrerPoints: DEFAULT_REFERRAL_PROGRAM.referrerPoints,
      refereePoints: DEFAULT_REFERRAL_PROGRAM.refereePoints,
    });
  });

  await t.test('rejects an invalid config instead of paying a nonsense amount', () => {
    assert.throws(
      () => referralRewards({ referrerPoints: -10, refereePoints: 25, maxReferralsPerUser: null }),
      isReferralError('INVALID_REWARD')
    );
  });
});
