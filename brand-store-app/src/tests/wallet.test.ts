import test from 'node:test';
import assert from 'node:assert';
import {
  DEFAULT_WALLET_PROGRAM,
  WALLET_PAYABLE_ORDER_STATUSES,
  WalletError,
  applyWalletDelta,
  assertWalletAmount,
  assertWalletBalance,
  assertWalletDirection,
  assertWalletPaymentPossible,
  assertWalletType,
  computeCashback,
  evaluateWalletPayment,
  formatMoney,
  isAdjustableType,
  resolveWalletProgram,
  toCents,
} from '../services/wallet/walletService.js';

function throwsCode(fn: () => unknown, code: string) {
  try {
    fn();
  } catch (err) {
    assert.ok(err instanceof WalletError, `expected WalletError, got ${String(err)}`);
    assert.strictEqual((err as WalletError).code, code);
    return err as WalletError;
  }
  assert.fail(`expected WalletError ${code}, but nothing was thrown`);
}

test('wallet money helpers', async (t) => {
  await t.test('toCents parses numbers and decimal strings', () => {
    assert.strictEqual(toCents(0), 0);
    assert.strictEqual(toCents(1), 100);
    assert.strictEqual(toCents(1500), 150000);
    assert.strictEqual(toCents('1500'), 150000);
    assert.strictEqual(toCents('1500.5'), 150050);
    assert.strictEqual(toCents('1500.05'), 150005);
    assert.strictEqual(toCents('0.07'), 7);
    assert.strictEqual(toCents('  42  '), 4200);
  });

  await t.test('toCents keeps negative values for refunds and corrections', () => {
    assert.strictEqual(toCents('-1500'), -150000);
    assert.strictEqual(toCents('-0.5'), -50);
  });

  await t.test('toCents rejects more than two decimals instead of rounding', () => {
    throwsCode(() => toCents('10.005'), 'INVALID_AMOUNT');
    throwsCode(() => toCents('10.999'), 'INVALID_AMOUNT');
    throwsCode(() => toCents(1.234), 'INVALID_AMOUNT');
  });

  await t.test('toCents rejects garbage', () => {
    throwsCode(() => toCents(''), 'INVALID_AMOUNT');
    throwsCode(() => toCents('   '), 'INVALID_AMOUNT');
    throwsCode(() => toCents('abc'), 'INVALID_AMOUNT');
    throwsCode(() => toCents('1e5'), 'INVALID_AMOUNT');
    throwsCode(() => toCents('1.2.3'), 'INVALID_AMOUNT');
    throwsCode(() => toCents(Number.NaN), 'INVALID_AMOUNT');
    throwsCode(() => toCents(Number.POSITIVE_INFINITY), 'INVALID_AMOUNT');
    throwsCode(() => toCents({} as unknown as string), 'INVALID_AMOUNT');
  });

  await t.test('formatMoney renders the decimal shape the columns store', () => {
    assert.strictEqual(formatMoney(0), '0.00');
    assert.strictEqual(formatMoney(7), '0.07');
    assert.strictEqual(formatMoney(50), '0.50');
    assert.strictEqual(formatMoney(100), '1.00');
    assert.strictEqual(formatMoney(150005), '1500.05');
    assert.strictEqual(formatMoney(-150005), '-1500.05');
  });

  await t.test('formatMoney refuses fractional cents', () => {
    throwsCode(() => formatMoney(1.5), 'INVALID_AMOUNT');
    throwsCode(() => formatMoney(Number.NaN), 'INVALID_AMOUNT');
  });

  await t.test('toCents and formatMoney round trip', () => {
    for (const value of ['0.00', '0.07', '1.00', '1500.05', '999999.99']) {
      assert.strictEqual(formatMoney(toCents(value)), value);
    }
  });
});

test('wallet amount and balance guards', async (t) => {
  await t.test('assertWalletAmount accepts positive values and returns cents', () => {
    assert.strictEqual(assertWalletAmount(1), 100);
    assert.strictEqual(assertWalletAmount('250.50'), 25050);
  });

  await t.test('assertWalletAmount rejects zero and negatives', () => {
    throwsCode(() => assertWalletAmount(0), 'INVALID_AMOUNT');
    throwsCode(() => assertWalletAmount('0.00'), 'INVALID_AMOUNT');
    throwsCode(() => assertWalletAmount(-5), 'INVALID_AMOUNT');
  });

  await t.test('assertWalletBalance accepts zero but not negatives', () => {
    assert.strictEqual(assertWalletBalance(0), 0);
    assert.strictEqual(assertWalletBalance('12.34'), 1234);
    throwsCode(() => assertWalletBalance(-1), 'INVALID_AMOUNT');
  });

  await t.test('assertWalletType and assertWalletDirection reject unknown values', () => {
    assert.strictEqual(assertWalletType('cashback'), 'cashback');
    throwsCode(() => assertWalletType('bonus'), 'INVALID_TYPE');
    throwsCode(() => assertWalletType(null), 'INVALID_TYPE');
    assert.strictEqual(assertWalletDirection('credit'), 'credit');
    throwsCode(() => assertWalletDirection('both'), 'INVALID_DIRECTION');
  });
});

test('applyWalletDelta keeps the balance honest', async (t) => {
  await t.test('credits add to the balance', () => {
    const result = applyWalletDelta({ balance: '100.00', type: 'topup', amount: '50.00' });
    assert.deepStrictEqual(result, {
      before: 10000,
      after: 15000,
      direction: 'credit',
      amountCents: 5000,
    });
  });

  await t.test('debits subtract from the balance', () => {
    const result = applyWalletDelta({ balance: '100.00', type: 'payment', amount: '40.00' });
    assert.deepStrictEqual(result, {
      before: 10000,
      after: 6000,
      direction: 'debit',
      amountCents: 4000,
    });
  });

  await t.test('a debit of the exact balance is allowed', () => {
    const result = applyWalletDelta({ balance: '100.00', type: 'payment', amount: '100.00' });
    assert.strictEqual(result.after, 0);
  });

  await t.test('a debit above the balance is a 409, not a negative wallet', () => {
    const err = throwsCode(
      () => applyWalletDelta({ balance: '10.00', type: 'payment', amount: '10.01' }),
      'INSUFFICIENT_BALANCE'
    );
    assert.strictEqual(err.status, 409);
  });

  await t.test('refund and cashback default to credit, expiry to debit', () => {
    assert.strictEqual(applyWalletDelta({ balance: '0', type: 'refund', amount: '1' }).direction, 'credit');
    assert.strictEqual(
      applyWalletDelta({ balance: '0', type: 'cashback', amount: '1' }).direction,
      'credit'
    );
    assert.strictEqual(
      applyWalletDelta({ balance: '10', type: 'expiry', amount: '1' }).direction,
      'debit'
    );
  });

  await t.test('adjustment accepts an explicit direction', () => {
    const up = applyWalletDelta({
      balance: '10.00',
      type: 'adjustment',
      amount: '5.00',
      direction: 'credit',
    });
    assert.strictEqual(up.after, 1500);

    const down = applyWalletDelta({
      balance: '10.00',
      type: 'adjustment',
      amount: '5.00',
      direction: 'debit',
    });
    assert.strictEqual(down.after, 500);
  });

  await t.test('only adjustment is hand-directed', () => {
    assert.strictEqual(isAdjustableType('adjustment'), true);
    for (const type of ['topup', 'payment', 'refund', 'cashback', 'expiry'] as const) {
      assert.strictEqual(isAdjustableType(type), false, type);
    }
  });
});

test('wallet program config', async (t) => {
  await t.test('missing config falls back to the documented defaults', () => {
    assert.deepStrictEqual(resolveWalletProgram(undefined), { ...DEFAULT_WALLET_PROGRAM });
    assert.deepStrictEqual(resolveWalletProgram(null), { ...DEFAULT_WALLET_PROGRAM });
  });

  await t.test('defaults keep cashback off until a business decision sets a rate', () => {
    assert.strictEqual(DEFAULT_WALLET_PROGRAM.cashbackPercent, 0);
    assert.strictEqual(DEFAULT_WALLET_PROGRAM.cashbackMaxAmount, null);
    assert.strictEqual(DEFAULT_WALLET_PROGRAM.minimumPayment, 0);
    assert.strictEqual(DEFAULT_WALLET_PROGRAM.currency, 'IDR');
  });

  await t.test('a full config survives validation', () => {
    const parsed = resolveWalletProgram({
      cashbackPercent: 5,
      cashbackMaxAmount: 25000,
      minimumPayment: 10000,
      currency: 'idr',
    });
    assert.deepStrictEqual(parsed, {
      cashbackPercent: 5,
      cashbackMaxAmount: 25000,
      minimumPayment: 10000,
      currency: 'IDR',
    });
  });

  await t.test('partial config fills the missing fields with defaults', () => {
    const parsed = resolveWalletProgram({ cashbackPercent: 2 });
    assert.strictEqual(parsed.cashbackPercent, 2);
    assert.strictEqual(parsed.cashbackMaxAmount, null);
    assert.strictEqual(parsed.minimumPayment, 0);
    assert.strictEqual(parsed.currency, 'IDR');
  });

  await t.test('bad values are refused', () => {
    throwsCode(() => resolveWalletProgram('nope'), 'INVALID_PROGRAM');
    throwsCode(() => resolveWalletProgram({ cashbackPercent: -1 }), 'INVALID_CASHBACK_PERCENT');
    throwsCode(() => resolveWalletProgram({ cashbackPercent: 101 }), 'INVALID_CASHBACK_PERCENT');
    throwsCode(() => resolveWalletProgram({ cashbackPercent: '5' }), 'INVALID_CASHBACK_PERCENT');
    throwsCode(() => resolveWalletProgram({ cashbackMaxAmount: -1 }), 'INVALID_CASHBACK_CAP');
    throwsCode(() => resolveWalletProgram({ cashbackMaxAmount: '1000' }), 'INVALID_CASHBACK_CAP');
    throwsCode(() => resolveWalletProgram({ minimumPayment: -1 }), 'INVALID_MINIMUM');
    throwsCode(() => resolveWalletProgram({ currency: '' }), 'INVALID_PROGRAM');
    throwsCode(() => resolveWalletProgram({ currency: '   ' }), 'INVALID_PROGRAM');
  });
});

test('cashback computation', async (t) => {
  await t.test('a zero percent program credits nothing', () => {
    assert.strictEqual(computeCashback({ orderTotal: '100000', program: { cashbackPercent: 0 } }), 0);
    assert.strictEqual(computeCashback({ orderTotal: '100000' }), 0);
  });

  await t.test('percent of the order total, rounded down to whole rupiah', () => {
    // 5% of 100.000 = 5.000
    assert.strictEqual(
      computeCashback({ orderTotal: '100000', program: { cashbackPercent: 5 } }),
      500000
    );
    // 3% of 33.333 = 999.99, floor to 999 rupiah = 99900 cents
    assert.strictEqual(
      computeCashback({ orderTotal: '33333', program: { cashbackPercent: 3 } }),
      99900
    );
  });

  await t.test('the cap is applied after rounding', () => {
    assert.strictEqual(
      computeCashback({
        orderTotal: '1000000',
        program: { cashbackPercent: 10, cashbackMaxAmount: 25000 },
      }),
      2500000
    );
  });

  await t.test('a cap above the computed value changes nothing', () => {
    assert.strictEqual(
      computeCashback({
        orderTotal: '100000',
        program: { cashbackPercent: 1, cashbackMaxAmount: 50000 },
      }),
      100000
    );
  });

  await t.test('a zero cap blocks all cashback', () => {
    assert.strictEqual(
      computeCashback({
        orderTotal: '100000',
        program: { cashbackPercent: 5, cashbackMaxAmount: 0 },
      }),
      0
    );
  });

  await t.test('a non positive order total is an error', () => {
    throwsCode(
      () => computeCashback({ orderTotal: 0, program: { cashbackPercent: 5 } }),
      'INVALID_AMOUNT'
    );
    throwsCode(
      () => computeCashback({ orderTotal: '-1000', program: { cashbackPercent: 5 } }),
      'INVALID_AMOUNT'
    );
  });
});

test('wallet payment evaluation', async (t) => {
  await t.test('enough balance is payable with no shortfall', () => {
    const preview = evaluateWalletPayment({ orderTotal: '50000', balance: '75000' });
    assert.deepStrictEqual(preview, {
      amountCents: 5000000,
      balanceCents: 7500000,
      payable: true,
      shortfallCents: 0,
    });
  });

  await t.test('an exact balance is payable', () => {
    const preview = evaluateWalletPayment({ orderTotal: '50000', balance: '50000' });
    assert.strictEqual(preview.payable, true);
    assert.strictEqual(preview.shortfallCents, 0);
  });

  await t.test('a short balance reports the gap instead of throwing', () => {
    const preview = evaluateWalletPayment({ orderTotal: '50000', balance: '20000' });
    assert.strictEqual(preview.payable, false);
    assert.strictEqual(preview.shortfallCents, 3000000);
  });

  await t.test('an order under the minimum reports not payable', () => {
    const preview = evaluateWalletPayment({
      orderTotal: '5000',
      balance: '100000',
      program: { minimumPayment: 10000 },
    });
    assert.strictEqual(preview.payable, false);
  });

  await t.test('a non positive order total is an error', () => {
    throwsCode(() => evaluateWalletPayment({ orderTotal: '0', balance: '1000' }), 'INVALID_AMOUNT');
  });

  await t.test('a negative balance is an error', () => {
    throwsCode(
      () => evaluateWalletPayment({ orderTotal: '1000', balance: '-1' }),
      'INVALID_AMOUNT'
    );
  });

  await t.test('assertWalletPaymentPossible returns the amount when payable', () => {
    assert.strictEqual(
      assertWalletPaymentPossible({ orderTotal: '50000', balance: '50000' }),
      5000000
    );
  });

  await t.test('assertWalletPaymentPossible throws 409 when short', () => {
    const err = throwsCode(
      () => assertWalletPaymentPossible({ orderTotal: '50000', balance: '1000' }),
      'INSUFFICIENT_BALANCE'
    );
    assert.strictEqual(err.status, 409);
  });

  await t.test('assertWalletPaymentPossible throws when under the minimum', () => {
    throwsCode(
      () =>
        assertWalletPaymentPossible({
          orderTotal: '5000',
          balance: '100000',
          program: { minimumPayment: 10000 },
        }),
      'MINIMUM_NOT_MET'
    );
  });
});

test('wallet payable order statuses', async (t) => {
  await t.test('only an unsettled order can be paid from the wallet', () => {
    assert.deepStrictEqual([...WALLET_PAYABLE_ORDER_STATUSES], [
      'pending',
      'waiting_payment',
      'unpaid',
    ]);
    for (const status of ['paid', 'processing', 'shipped', 'delivered', 'cancelled']) {
      assert.ok(
        !(WALLET_PAYABLE_ORDER_STATUSES as readonly string[]).includes(status),
        status
      );
    }
  });
});
