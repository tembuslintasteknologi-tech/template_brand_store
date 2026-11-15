import { Hono } from 'hono';
import { z } from 'zod';
import { authMiddleware, adminOnlyMiddleware } from '../middleware/auth.js';
import { featureGate } from '../middleware/featureGate.js';
import { fail, ok, serverError } from '../utils/response.js';
import { putSetting } from '../services/config/settings.js';
import { WalletError } from '../services/wallet/walletService.js';
import {
  adjustWallet,
  creditOrderCashback,
  creditWallet,
  getWalletForAdmin,
  getWalletProgram,
  getWalletSummary,
  listWalletTransactions,
  listWallets,
  payOrderWithWallet,
  previewWalletPayment,
} from '../services/wallet/walletRepository.js';

function walletFail(c: any, err: unknown) {
  if (err instanceof WalletError) {
    const status = err.status as 400 | 403 | 404 | 409 | 500;
    return c.json(
      {
        success: false,
        error: { code: err.code, message: err.message },
        requestId: c.get('requestId') ?? null,
      },
      status
    );
  }
  return serverError(c, err);
}

const paySchema = z.object({
  orderId: z.string().uuid(),
});

const previewSchema = z.object({
  orderTotal: z.union([z.number().positive(), z.string().min(1)]),
});

const programSchema = z.object({
  cashbackPercent: z.number().min(0).max(100),
  cashbackMaxAmount: z.number().min(0).nullable(),
  minimumPayment: z.number().min(0),
  currency: z.string().min(1).max(10),
});

const creditSchema = z.object({
  amount: z.union([z.number().positive(), z.string().min(1)]),
  note: z.string().max(300).optional(),
});

const adjustSchema = z.object({
  amount: z.union([z.number().positive(), z.string().min(1)]),
  direction: z.enum(['credit', 'debit']),
  note: z.string().max(300).optional(),
});

/** Customer wallet endpoints (WLT-001, WLT-002). */
export const walletRoutes = new Hono();
walletRoutes.use('*', featureGate('wallet'));

// GET /api/v1/wallet
walletRoutes.get('/', authMiddleware, async (c) => {
  try {
    const user = c.get('user') as { id: string };
    return ok(c, await getWalletSummary(user.id));
  } catch (err) {
    return walletFail(c, err);
  }
});

// GET /api/v1/wallet/program
walletRoutes.get('/program', async (c) => {
  try {
    return ok(c, await getWalletProgram());
  } catch (err) {
    return walletFail(c, err);
  }
});

// GET /api/v1/wallet/transactions?type=payment&limit=50
walletRoutes.get('/transactions', authMiddleware, async (c) => {
  try {
    const user = c.get('user') as { id: string };
    return ok(
      c,
      await listWalletTransactions({
        userId: user.id,
        type: c.req.query('type') ?? null,
        limit: Number(c.req.query('limit') ?? 50),
      })
    );
  } catch (err) {
    return walletFail(c, err);
  }
});

// POST /api/v1/wallet/preview, read-only check before the customer commits.
walletRoutes.post('/preview', authMiddleware, async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const parsed = previewSchema.safeParse(body);
    if (!parsed.success) {
      return fail(c, 'VALIDATION_ERROR', 'Payload preview wallet tidak valid', 400, parsed.error.issues);
    }
    const user = c.get('user') as { id: string };
    return ok(
      c,
      await previewWalletPayment({ userId: user.id, orderTotal: parsed.data.orderTotal })
    );
  } catch (err) {
    return walletFail(c, err);
  }
});

// POST /api/v1/wallet/pay
walletRoutes.post('/pay', authMiddleware, async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const parsed = paySchema.safeParse(body);
    if (!parsed.success) {
      return fail(c, 'VALIDATION_ERROR', 'Payload pembayaran wallet tidak valid', 400, parsed.error.issues);
    }
    const user = c.get('user') as { id: string };
    return ok(c, await payOrderWithWallet({ userId: user.id, orderId: parsed.data.orderId }));
  } catch (err) {
    return walletFail(c, err);
  }
});

/** Admin wallet endpoints. */
export const walletAdminRoutes = new Hono();
walletAdminRoutes.use('*', featureGate('wallet'));
walletAdminRoutes.use('*', authMiddleware, adminOnlyMiddleware);

// GET /api/v1/admin/wallets?limit=50
walletAdminRoutes.get('/wallets', async (c) => {
  try {
    return ok(c, await listWallets({ limit: Number(c.req.query('limit') ?? 50) }));
  } catch (err) {
    return walletFail(c, err);
  }
});

// GET /api/v1/admin/wallets/program
walletAdminRoutes.get('/wallets/program', async (c) => {
  try {
    return ok(c, await getWalletProgram());
  } catch (err) {
    return walletFail(c, err);
  }
});

// PUT /api/v1/admin/wallets/program
walletAdminRoutes.put('/wallets/program', async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const parsed = programSchema.safeParse(body);
    if (!parsed.success) {
      return fail(c, 'VALIDATION_ERROR', 'Konfigurasi wallet tidak valid', 400, parsed.error.issues);
    }
    const actor = c.get('user') as { id: string };
    return ok(c, await putSetting(actor.id, 'wallet.program', parsed.data));
  } catch (err) {
    return walletFail(c, err);
  }
});

// POST /api/v1/admin/wallets/:userId/credit, a manual topup or compensation.
walletAdminRoutes.post('/wallets/:userId/credit', async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const parsed = creditSchema.safeParse(body);
    if (!parsed.success) {
      return fail(c, 'VALIDATION_ERROR', 'Payload kredit wallet tidak valid', 400, parsed.error.issues);
    }
    return ok(
      c,
      await creditWallet({
        userId: c.req.param('userId') as string,
        type: 'topup',
        amount: parsed.data.amount,
        referenceType: 'admin_credit',
        note: parsed.data.note ?? null,
      })
    );
  } catch (err) {
    return walletFail(c, err);
  }
});

// POST /api/v1/admin/wallets/:userId/adjust, needs an explicit direction.
walletAdminRoutes.post('/wallets/:userId/adjust', async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const parsed = adjustSchema.safeParse(body);
    if (!parsed.success) {
      return fail(c, 'VALIDATION_ERROR', 'Payload koreksi wallet tidak valid', 400, parsed.error.issues);
    }
    return ok(
      c,
      await adjustWallet({
        userId: c.req.param('userId') as string,
        amount: parsed.data.amount,
        direction: parsed.data.direction,
        note: parsed.data.note ?? null,
      })
    );
  } catch (err) {
    return walletFail(c, err);
  }
});

// GET /api/v1/admin/wallets/:userId
walletAdminRoutes.get('/wallets/:userId', async (c) => {
  try {
    return ok(c, await getWalletForAdmin(c.req.param('userId') as string));
  } catch (err) {
    return walletFail(c, err);
  }
});

// POST /api/v1/admin/orders/:orderId/cashback, credits cashback that did not run automatically.
walletAdminRoutes.post('/orders/:orderId/cashback', async (c) => {
  try {
    return ok(c, await creditOrderCashback({ orderId: c.req.param('orderId') as string }));
  } catch (err) {
    return walletFail(c, err);
  }
});
