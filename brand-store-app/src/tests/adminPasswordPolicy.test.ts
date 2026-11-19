import test from 'node:test';
import assert from 'node:assert';
import argon2 from 'argon2';
import {
  DEFAULT_ADMIN_PASSWORD,
  isDefaultAdminPasswordActive,
  isHashOfDefaultPassword,
  isPrivilegedRole,
  requiresPasswordChange,
  validatePasswordStrength,
} from '../services/auth/adminPasswordPolicy.js';

const STRONG = 'Rahasia#Kuat2026';

test('isPrivilegedRole only covers admin and branch admin', () => {
  assert.strictEqual(isPrivilegedRole('admin'), true);
  assert.strictEqual(isPrivilegedRole('branch_admin'), true);
  assert.strictEqual(isPrivilegedRole('customer'), false);
  assert.strictEqual(isPrivilegedRole(undefined), false);
});

test('isDefaultAdminPasswordActive detects an unset or default password', () => {
  assert.strictEqual(isDefaultAdminPasswordActive({}), true);
  assert.strictEqual(isDefaultAdminPasswordActive({ ADMIN_PASSWORD: '   ' }), true);
  assert.strictEqual(
    isDefaultAdminPasswordActive({ ADMIN_PASSWORD: DEFAULT_ADMIN_PASSWORD }),
    true
  );
  assert.strictEqual(isDefaultAdminPasswordActive({ ADMIN_PASSWORD: 'Sangat#Rahasia2026' }), false);
});

test('validatePasswordStrength accepts a long mixed password', () => {
  const result = validatePasswordStrength(STRONG);
  assert.deepStrictEqual(result, { ok: true, issues: [] });
});

test('validatePasswordStrength rejects the default and weak passwords', () => {
  const result = validatePasswordStrength(DEFAULT_ADMIN_PASSWORD);
  assert.strictEqual(result.ok, false);
  assert.ok(result.issues.some((issue) => issue.includes('default')));

  const envExample = validatePasswordStrength('Admin12345!');
  assert.strictEqual(envExample.ok, false);
  assert.ok(envExample.issues.some((issue) => issue.includes('default')));

  const short = validatePasswordStrength('abc');
  assert.strictEqual(short.ok, false);
  assert.ok(short.issues.length >= 3);
});

test('validatePasswordStrength rejects email and name reuse', () => {
  const emailResult = validatePasswordStrength('budi#Kuat2026', { email: 'budi@example.com' });
  assert.strictEqual(emailResult.ok, false);
  assert.ok(emailResult.issues.some((issue) => issue.includes('email')));

  const nameResult = validatePasswordStrength('Siti#Kuat2026', { fullName: 'siti' });
  assert.strictEqual(nameResult.ok, false);
  assert.ok(nameResult.issues.some((issue) => issue.includes('nama')));
});

test('isHashOfDefaultPassword recognizes the seeded hash', async () => {
  const hash = await argon2.hash(DEFAULT_ADMIN_PASSWORD, {
    type: argon2.argon2id,
    memoryCost: 4096,
    timeCost: 2,
    parallelism: 1,
  });
  assert.strictEqual(await isHashOfDefaultPassword(hash), true);

  const envExampleHash = await argon2.hash('Admin12345!', {
    type: argon2.argon2id,
    memoryCost: 4096,
    timeCost: 2,
    parallelism: 1,
  });
  assert.strictEqual(await isHashOfDefaultPassword(envExampleHash), true);

  const strongHash = await argon2.hash('Rahasia#Kuat2026', {
    type: argon2.argon2id,
    memoryCost: 4096,
    timeCost: 2,
    parallelism: 1,
  });
  assert.strictEqual(await isHashOfDefaultPassword(strongHash), false);
  assert.strictEqual(await isHashOfDefaultPassword('not-a-hash'), false);
  assert.strictEqual(await isHashOfDefaultPassword(''), false);
});

test('requiresPasswordChange only fires for privileged accounts', async () => {
  const hash = await argon2.hash(DEFAULT_ADMIN_PASSWORD, {
    type: argon2.argon2id,
    memoryCost: 4096,
    timeCost: 2,
    parallelism: 1,
  });

  assert.strictEqual(await requiresPasswordChange({ role: 'admin', passwordHash: hash }), true);
  assert.strictEqual(await requiresPasswordChange({ role: 'customer', passwordHash: hash }), false);
  assert.strictEqual(await requiresPasswordChange({ role: 'admin', passwordHash: null }), false);
});
