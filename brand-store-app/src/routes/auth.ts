import { Hono } from 'hono';
import { db } from '../db/index.js';
import { users } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import argon2 from 'argon2';
import { registerSchema, loginSchema } from '../validators/schemas.js';
import { fail } from '../utils/response.js';
import { authMiddleware } from '../middleware/auth.js';
import { unifiedConfig } from '../config/unifiedConfig.js';
import {
  TotpServiceError,
  confirmEnrollment,
  disableTotp,
  findUserForChallenge,
  getTotpStatus,
  requiresSecondFactor,
  signTotpChallenge,
  startEnrollment,
  verifyTotpChallenge,
  verifyUserCode,
  TOTP_CHALLENGE_TTL_SECONDS,
} from '../services/auth/totpService.js';

export const authRoutes = new Hono();

authRoutes.post('/register', async (c) => {
  try {
    const body = await c.req.json();
    const parsed = registerSchema.safeParse(body);
    if (!parsed.success) {
      return fail(c, 'VALIDATION_ERROR', 'Validation failed', 400, parsed.error.issues);
    }

    const { email, password, fullName, phone } = parsed.data;

    const existing = await db.select().from(users).where(eq(users.email, email)).limit(1);
    if (existing.length > 0) {
      return c.json({ success: false, error: 'Email already registered' }, 400);
    }

    const passwordHash = await argon2.hash(password);

    const [newUser] = await db.insert(users).values({
      email,
      passwordHash,
      fullName,
      phone,
      role: 'customer',
    }).returning({
      id: users.id,
      email: users.email,
      fullName: users.fullName,
      role: users.role,
      createdAt: users.createdAt,
    });

    return c.json({ success: true, data: newUser }, 201);
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500);
  }
});

authRoutes.post('/login', async (c) => {
  try {
    const body = await c.req.json();
    const parsed = loginSchema.safeParse(body);
    if (!parsed.success) {
      return fail(c, 'VALIDATION_ERROR', 'Validation failed', 400, parsed.error.issues);
    }

    const { email, password } = parsed.data;

    const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    if (!user) {
      return c.json({ success: false, error: 'Invalid email or password' }, 401);
    }

    const validPassword = await argon2.verify(user.passwordHash, password);
    if (!validPassword) {
      return c.json({ success: false, error: 'Invalid email or password' }, 401);
    }

    // Admin dengan 2FA aktif tidak langsung mendapat token sesi. Password yang benar hanya
    // menghasilkan challenge berumur pendek, dan sesi penuh baru terbit setelah kode
    // authenticator diverifikasi di POST /auth/2fa/verify.
    if (await requiresSecondFactor({ id: user.id, role: user.role })) {
      return c.json({
        success: true,
        data: {
          requires2fa: true,
          challengeToken: signTotpChallenge({ id: user.id, email: user.email ?? undefined, role: user.role }),
          expiresIn: TOTP_CHALLENGE_TTL_SECONDS,
        },
      });
    }

    // Generate mock token based on role
    const token = user.role === 'admin'
      ? 'mock-admin-token'
      : user.role === 'branch_admin'
        ? `mock-branch-admin-token-${user.branchId ?? ''}`
        : `mock-customer-token-${user.id}`;

    return c.json({
      success: true,
      data: {
        token,
        user: {
          id: user.id,
          email: user.email,
          fullName: user.fullName,
          role: user.role,
          branchId: user.branchId ?? null,
        },
      },
    });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500);
  }
});

// ---------------------------------------------------------------------------
// 2FA TOTP (AUT-012)
// ---------------------------------------------------------------------------

authRoutes.use('/2fa/*', authMiddleware);

function totpFail(c: any, err: any) {
  if (err instanceof TotpServiceError) {
    return c.json({ success: false, error: { code: err.code, message: err.message } }, err.status as any);
  }
  return c.json({ success: false, error: { code: 'TOTP_ERROR', message: err?.message ?? '2FA gagal' } }, 500);
}

function sessionTokenFor(user: { id: string; role: string; branchId?: string | null }) {
  if (user.role === 'admin') return 'mock-admin-token';
  if (user.role === 'branch_admin') return `mock-branch-admin-token-${user.branchId ?? ''}`;
  return `mock-customer-token-${user.id}`;
}

function actorOf(c: any): { id: string; email?: string; role?: string } {
  return c.get('user');
}

function assertStaff(user: { role?: string }) {
  if (user.role !== 'admin' && user.role !== 'branch_admin') {
    throw new TotpServiceError('2FA hanya berlaku untuk akun admin dan admin cabang', 403, 'TOTP_FORBIDDEN');
  }
}

// GET /api/v1/auth/2fa/status
authRoutes.get('/2fa/status', async (c) => {
  try {
    const user = actorOf(c);
    return c.json({ success: true, data: await getTotpStatus(user.id) });
  } catch (err: any) {
    return totpFail(c, err);
  }
});

// POST /api/v1/auth/2fa/enroll - keluarkan otpauth URI dan recovery codes sekali lihat
authRoutes.post('/2fa/enroll', async (c) => {
  try {
    const user = actorOf(c);
    assertStaff(user);

    const email = user.email ?? (await findUserForChallenge(user.id)).email;
    const enrollment = await startEnrollment({
      userId: user.id,
      email: String(email),
      issuer: unifiedConfig.brand.name,
    });

    return c.json(
      {
        success: true,
        data: {
          ...enrollment,
          // Recovery codes hanya dikembalikan di respons ini. Yang tersimpan di database hanya
          // hash-nya, jadi kalau pengguna kehilangan daftar ini, ia harus mendaftar ulang 2FA.
          notice: 'Simpan recovery codes sekarang. Daftar ini tidak bisa ditampilkan lagi.',
        },
      },
      201
    );
  } catch (err: any) {
    return totpFail(c, err);
  }
});

// POST /api/v1/auth/2fa/confirm - verifikasi kode pertama, 2FA baru aktif setelah ini
authRoutes.post('/2fa/confirm', async (c) => {
  try {
    const user = actorOf(c);
    assertStaff(user);
    const body = await c.req.json().catch(() => ({}));
    const status = await confirmEnrollment(user.id, body?.code);
    return c.json({ success: true, data: status });
  } catch (err: any) {
    return totpFail(c, err);
  }
});

// POST /api/v1/auth/2fa/verify - tukar challenge token plus kode menjadi sesi penuh
authRoutes.post('/2fa/verify', async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    if (!body?.challengeToken) {
      return c.json({ success: false, error: { code: 'TOTP_CHALLENGE_INVALID', message: 'challengeToken wajib diisi' } }, 400);
    }

    const challenge = verifyTotpChallenge(String(body.challengeToken));
    const verification = await verifyUserCode(challenge.userId, body?.code);
    const user = await findUserForChallenge(challenge.userId);

    return c.json({
      success: true,
      data: {
        token: sessionTokenFor({ id: user.id, role: user.role, branchId: user.branchId ?? null }),
        user: {
          id: user.id,
          email: user.email,
          fullName: user.fullName,
          role: user.role,
          branchId: user.branchId ?? null,
        },
        usedRecoveryCode: verification.usedRecoveryCode,
        recoveryCodesRemaining: verification.recoveryCodesRemaining,
      },
    });
  } catch (err: any) {
    return totpFail(c, err);
  }
});

// POST /api/v1/auth/2fa/disable - penurunan keamanan, tetap butuh kode valid
authRoutes.post('/2fa/disable', async (c) => {
  try {
    const user = actorOf(c);
    assertStaff(user);
    const body = await c.req.json().catch(() => ({}));
    const status = await disableTotp(user.id, body?.code);
    return c.json({ success: true, data: status });
  } catch (err: any) {
    return totpFail(c, err);
  }
});
