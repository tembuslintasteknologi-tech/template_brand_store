import { test } from 'node:test';
import assert from 'node:assert';
import {
  BRANCH_ADMIN_ROLE,
  branchIdOf,
  resolveBranchAccess,
} from '../services/branch/branchScope.js';

test('branch scope: pusat admin may act on any branch', () => {
  const decision = resolveBranchAccess({ role: 'admin' }, 'branch-jogja');
  assert.strictEqual(decision.allowed, true);
  if (decision.allowed) {
    assert.strictEqual(decision.branchId, 'branch-jogja');
    assert.strictEqual(decision.scope, 'pusat');
  }
});

test('branch scope: pusat admin without a requested branch stays at pusat level', () => {
  const decision = resolveBranchAccess({ role: 'admin' });
  assert.strictEqual(decision.allowed, true);
  if (decision.allowed) {
    assert.strictEqual(decision.branchId, null);
    assert.strictEqual(decision.scope, 'pusat');
  }
});

test('branch scope: branch admin may act on its own branch', () => {
  const decision = resolveBranchAccess({ role: BRANCH_ADMIN_ROLE, branchId: 'branch-jogja' }, 'branch-jogja');
  assert.strictEqual(decision.allowed, true);
  if (decision.allowed) {
    assert.strictEqual(decision.branchId, 'branch-jogja');
    assert.strictEqual(decision.scope, 'branch');
  }
});

test('branch scope: branch admin without a requested branch falls back to its own branch', () => {
  const decision = resolveBranchAccess({ role: BRANCH_ADMIN_ROLE, branchId: 'branch-jogja' });
  assert.strictEqual(decision.allowed, true);
  if (decision.allowed) {
    assert.strictEqual(decision.branchId, 'branch-jogja');
  }
});

test('branch scope: branch admin is rejected on another branch', () => {
  const decision = resolveBranchAccess({ role: BRANCH_ADMIN_ROLE, branchId: 'branch-jogja' }, 'branch-jakarta');
  assert.strictEqual(decision.allowed, false);
  if (!decision.allowed) {
    assert.strictEqual(decision.status, 403);
    assert.strictEqual(decision.code, 'BRANCH_SCOPE_MISMATCH');
  }
});

test('branch scope: branch admin without a linked branch is rejected', () => {
  const decision = resolveBranchAccess({ role: BRANCH_ADMIN_ROLE });
  assert.strictEqual(decision.allowed, false);
  if (!decision.allowed) {
    assert.strictEqual(decision.status, 403);
    assert.strictEqual(decision.code, 'BRANCH_SCOPE_MISSING');
  }
});

test('branch scope: customer is rejected', () => {
  const decision = resolveBranchAccess({ role: 'customer' }, 'branch-jogja');
  assert.strictEqual(decision.allowed, false);
  if (!decision.allowed) {
    assert.strictEqual(decision.status, 403);
    assert.strictEqual(decision.code, 'FORBIDDEN');
  }
});

test('branch scope: missing user is rejected as unauthorized', () => {
  const decision = resolveBranchAccess(null);
  assert.strictEqual(decision.allowed, false);
  if (!decision.allowed) {
    assert.strictEqual(decision.status, 401);
  }
});

test('branch scope: branchIdOf reads camelCase and snake_case payloads', () => {
  assert.strictEqual(branchIdOf({ branchId: 'branch-a' }), 'branch-a');
  assert.strictEqual(branchIdOf({ branch_id: 'branch-b' }), 'branch-b');
  assert.strictEqual(branchIdOf({ branchId: '  ' }), null);
  assert.strictEqual(branchIdOf({}), null);
  assert.strictEqual(branchIdOf(null), null);
});

test('branch scope: empty requested branch is treated as no request', () => {
  const decision = resolveBranchAccess({ role: BRANCH_ADMIN_ROLE, branchId: 'branch-a' }, '   ');
  assert.strictEqual(decision.allowed, true);
  if (decision.allowed) {
    assert.strictEqual(decision.branchId, 'branch-a');
  }
});
