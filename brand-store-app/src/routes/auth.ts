import { Hono } from 'hono';
import { db } from '../db/index.js';
import { users } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import argon2 from 'argon2';
import { registerSchema, loginSchema } from '../validators/schemas.js';

export const authRoutes = new Hono();

authRoutes.post('/register', async (c) => {
  try {
    const body = await c.req.json();
    const parsed = registerSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ success: false, error: parsed.error.format() }, 400);
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
      return c.json({ success: false, error: parsed.error.format() }, 400);
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

    // Generate mock token based on role
    const token = user.role === 'admin' ? 'mock-admin-token' : `mock-customer-token-${user.id}`;

    return c.json({
      success: true,
      data: {
        token,
        user: {
          id: user.id,
          email: user.email,
          fullName: user.fullName,
          role: user.role,
        },
      },
    });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500);
  }
});
