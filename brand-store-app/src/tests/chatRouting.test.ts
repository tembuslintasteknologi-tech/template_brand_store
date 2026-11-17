import test from 'node:test';
import assert from 'node:assert';
import { rankBranchesByStock, resolveChatBranch } from '../services/chat/chatService.js';

test('rankBranchesByStock drops branches with no available stock and sorts the rest', () => {
  const ranked = rankBranchesByStock([
    { branchId: 'bandung', available: 0 },
    { branchId: 'jakarta', available: 12 },
    { branchId: 'surabaya', available: -3 },
    { branchId: 'medan', available: 12 },
    { branchId: 'bogor', available: 1 },
    { branchId: 'rusak', available: Number.NaN },
  ]);

  assert.deepStrictEqual(
    ranked.map((row) => row.branchId),
    ['jakarta', 'medan', 'bogor'],
    'stok nol atau minus tidak boleh menang, seri mempertahankan urutan query'
  );
});

test('rankBranchesByStock does not mutate its input', () => {
  const input = [
    { branchId: 'a', available: 1 },
    { branchId: 'b', available: 5 },
  ];
  const ranked = rankBranchesByStock(input);

  assert.deepStrictEqual(
    input.map((row) => row.branchId),
    ['a', 'b']
  );
  assert.notStrictEqual(ranked, input);
});

test('rankBranchesByStock returns an empty list for an empty or unusable input', () => {
  assert.deepStrictEqual(rankBranchesByStock([]), []);
  assert.deepStrictEqual(rankBranchesByStock([{ branchId: 'x', available: 0 }]), []);
});

test('resolveChatBranch prefers the explicitly requested branch over stock', () => {
  const result = resolveChatBranch({
    requestedBranchId: 'bandung',
    stockRows: [{ branchId: 'jakarta', available: 99 }],
    pusatBranchId: 'jakarta',
    firstBranchId: 'jakarta',
  });

  assert.deepStrictEqual(result, { branchId: 'bandung', reason: 'explicit_branch' });
});

test('resolveChatBranch routes to the branch holding the most stock', () => {
  const result = resolveChatBranch({
    stockRows: [
      { branchId: 'bandung', available: 2 },
      { branchId: 'surabaya', available: 7 },
      { branchId: 'medan', available: 0 },
    ],
    pusatBranchId: 'jakarta',
    firstBranchId: 'bandung',
  });

  assert.deepStrictEqual(result, { branchId: 'surabaya', reason: 'product_stock' });
});

test('resolveChatBranch skips stock rows that are all empty and falls back to pusat', () => {
  const result = resolveChatBranch({
    stockRows: [
      { branchId: 'bandung', available: 0 },
      { branchId: 'medan', available: -1 },
    ],
    pusatBranchId: 'jakarta',
    firstBranchId: 'bandung',
  });

  assert.deepStrictEqual(result, { branchId: 'jakarta', reason: 'default_branch' });
});

test('resolveChatBranch falls back to the first branch when there is no pusat', () => {
  const result = resolveChatBranch({
    stockRows: [],
    pusatBranchId: null,
    firstBranchId: 'bandung',
  });

  assert.deepStrictEqual(result, { branchId: 'bandung', reason: 'fallback_pusat' });
});

test('resolveChatBranch returns unrouted instead of failing when nothing is available', () => {
  assert.deepStrictEqual(resolveChatBranch({}), { branchId: null, reason: 'unrouted' });
  assert.deepStrictEqual(
    resolveChatBranch({ requestedBranchId: null, stockRows: [], pusatBranchId: null, firstBranchId: null }),
    { branchId: null, reason: 'unrouted' }
  );
});
