import test from 'node:test';
import assert from 'node:assert';
import {
  base32Decode,
  base32Encode,
  buildOtpauthUri,
  generateRecoveryCodes,
  generateTotpSecret,
  hotp,
  normalizeRecoveryCode,
  normalizeTotpCode,
  totp,
  verifyTotp,
} from '../services/auth/totp.js';
import {
  TOTP_KEY_ENV,
  isSecretBoxConfigured,
  openSecret,
  resolveSecretBoxKey,
  safeEqualText,
  sealSecret,
} from '../services/auth/secretBox.js';

// Secret uji dari RFC 6238 Lampiran B: ASCII "12345678901234567890".
const RFC_SECRET_BASE32 = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';

test('base32 encode/decode round trip and tolerates lowercase with spaces', () => {
  const bytes = Buffer.from('12345678901234567890', 'ascii');
  assert.strictEqual(base32Encode(bytes), RFC_SECRET_BASE32);
  assert.deepStrictEqual(base32Decode(RFC_SECRET_BASE32), bytes);
  assert.deepStrictEqual(base32Decode('gezd gnbv-gy3t qojq gezd gnbv gy3t qojq'), bytes);
});

test('base32 decode rejects characters outside the alphabet', () => {
  assert.throws(() => base32Decode('ABC1'), /tidak valid/i);
  assert.throws(() => base32Decode(''), /kosong/i);
});

test('hotp matches the RFC 4226 test vectors', () => {
  const secret = RFC_SECRET_BASE32;
  const vectors: Array<[number, string]> = [
    [0, '755224'],
    [1, '287082'],
    [2, '359152'],
    [3, '969429'],
    [4, '338314'],
    [5, '254676'],
    [6, '287922'],
    [7, '162583'],
    [8, '399871'],
    [9, '520489'],
  ];

  for (const [counter, expected] of vectors) {
    assert.strictEqual(hotp(secret, counter), expected, `counter ${counter}`);
  }
});

test('totp matches the RFC 6238 SHA1 test vectors in 8 digits', () => {
  const vectors: Array<[number, string]> = [
    [59, '94287082'],
    [1111111109, '07081804'],
    [1111111111, '14050471'],
    [1234567890, '89005924'],
    [2000000000, '69279037'],
    [20000000000, '65353130'],
  ];

  for (const [epochSeconds, expected] of vectors) {
    const code = totp(RFC_SECRET_BASE32, { digits: 8, now: epochSeconds * 1000 });
    assert.strictEqual(code, expected, `epoch ${epochSeconds}`);
  }
});

test('verifyTotp accepts the current window and one period either side, rejects the rest', () => {
  const now = 1_700_000_000_000;
  const current = totp(RFC_SECRET_BASE32, { now });

  assert.strictEqual(verifyTotp(RFC_SECRET_BASE32, current, { now }), true);
  assert.strictEqual(verifyTotp(RFC_SECRET_BASE32, current, { now: now + 30_000 }), true);
  assert.strictEqual(verifyTotp(RFC_SECRET_BASE32, current, { now: now + 120_000 }), false);
  assert.strictEqual(verifyTotp(RFC_SECRET_BASE32, '000000', { now: now + 600_000 }), false);
});

test('verifyTotp normalizes spaces and dashes the user typed', () => {
  const now = 1_700_000_000_000;
  const current = totp(RFC_SECRET_BASE32, { now });
  const spaced = `${current.slice(0, 3)} ${current.slice(3)}`;
  assert.strictEqual(verifyTotp(RFC_SECRET_BASE32, spaced, { now }), true);
  assert.strictEqual(normalizeTotpCode(spaced), current);
});

test('generateTotpSecret returns base32 that decodes to 20 bytes by default', () => {
  const secret = generateTotpSecret();
  assert.match(secret, /^[A-Z2-7]+$/);
  assert.strictEqual(base32Decode(secret).length, 20);
  assert.notStrictEqual(secret, generateTotpSecret());
  assert.throws(() => generateTotpSecret(4), /antara 10 dan 64/i);
});

test('buildOtpauthUri encodes label and carries the parameters authenticator apps need', () => {
  const uri = buildOtpauthUri({
    issuer: 'Tembus Store',
    account: 'admin@tembus.test',
    secret: RFC_SECRET_BASE32,
    digits: 6,
    period: 30,
  });

  assert.ok(uri.startsWith('otpauth://totp/'));
  const parsed = new URL(uri);
  assert.strictEqual(parsed.protocol, 'otpauth:');
  assert.strictEqual(parsed.searchParams.get('secret'), RFC_SECRET_BASE32);
  assert.strictEqual(parsed.searchParams.get('issuer'), 'Tembus Store');
  assert.strictEqual(parsed.searchParams.get('algorithm'), 'SHA1');
  assert.strictEqual(parsed.searchParams.get('digits'), '6');
  assert.strictEqual(parsed.searchParams.get('period'), '30');
  // Label harus membawa issuer dan akun dalam bentuk ter-encode.
  assert.strictEqual(decodeURIComponent(parsed.pathname.replace(/^\//, '')), 'Tembus Store:admin@tembus.test');
  assert.throws(() => buildOtpauthUri({ issuer: '', account: 'a', secret: 'B' }), /issuer/i);
});

test('generateRecoveryCodes avoids look-alike characters and stays unique', () => {
  const codes = generateRecoveryCodes(10, 10);
  assert.strictEqual(codes.length, 10);
  assert.strictEqual(new Set(codes).size, 10);

  for (const code of codes) {
    assert.strictEqual(code.length, 10);
    assert.doesNotMatch(code, /[IO01]/);
    assert.match(code, /^[A-Z2-9]+$/);
  }
});

test('normalizeRecoveryCode makes dashed lowercase input comparable', () => {
  assert.strictEqual(normalizeRecoveryCode('abcd-efgh'), 'ABCDEFGH');
  assert.strictEqual(normalizeRecoveryCode(' AB CD EF GH '), 'ABCDEFGH');
  assert.strictEqual(normalizeRecoveryCode(null), '');
});

test('secretBox seals and opens a TOTP secret, and refuses to open a tampered one', () => {
  const previous = process.env[TOTP_KEY_ENV];
  const key = Buffer.alloc(32, 7).toString('base64');
  process.env[TOTP_KEY_ENV] = key;

  try {
    assert.strictEqual(isSecretBoxConfigured(), true);
    assert.strictEqual(resolveSecretBoxKey()?.length, 32);

    const sealed = sealSecret(RFC_SECRET_BASE32);
    assert.match(sealed, /^v1:/);
    assert.ok(!sealed.includes(RFC_SECRET_BASE32), 'secret polos tidak boleh muncul di ciphertext');
    assert.strictEqual(openSecret(sealed), RFC_SECRET_BASE32);

    const parts = sealed.split(':');
    const tampered = [parts[0], parts[1], parts[2], Buffer.from('zzzz', 'utf8').toString('base64')].join(':');
    assert.throws(() => openSecret(tampered), /tidak bisa dibuka|rusak/i);

    const wrongKey = Buffer.alloc(32, 9).toString('base64');
    process.env[TOTP_KEY_ENV] = wrongKey;
    assert.throws(() => openSecret(sealed), /tidak bisa dibuka/i);
  } finally {
    if (previous === undefined) delete process.env[TOTP_KEY_ENV];
    else process.env[TOTP_KEY_ENV] = previous;
  }
});

test('secretBox reports missing configuration instead of falling back to a default key', () => {
  const previous = process.env[TOTP_KEY_ENV];
  delete process.env[TOTP_KEY_ENV];

  try {
    assert.strictEqual(isSecretBoxConfigured(), false);
    assert.strictEqual(resolveSecretBoxKey(), null);
    assert.throws(() => sealSecret('ABC'), /TOTP_ENCRYPTION_KEY/);
  } finally {
    if (previous !== undefined) process.env[TOTP_KEY_ENV] = previous;
  }
});

test('safeEqualText only matches identical non empty strings', () => {
  assert.strictEqual(safeEqualText('abc', 'abc'), true);
  assert.strictEqual(safeEqualText('abc', 'abd'), false);
  assert.strictEqual(safeEqualText('abc', 'abcd'), false);
  assert.strictEqual(safeEqualText('', ''), false);
});
