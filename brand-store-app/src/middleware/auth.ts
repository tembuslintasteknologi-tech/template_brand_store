import { Context, Next } from 'hono';
import { unifiedConfig } from '../config/unifiedConfig.js';

// Simple JWT verification or session check mock for Hono middleware
export async function authMiddleware(c: Context, next: Next) {
  const authHeader = c.req.header('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({ success: false, error: 'Unauthorized: Missing or malformed token' }, 401);
  }

  const token = authHeader.split(' ')[1];
  // In real production, verify JWT using unifiedConfig.jwt.secret
  // For template scaffold, we decode mock or test token payload
  try {
    if (token === 'mock-admin-token') {
      c.set('user', { id: 'admin-uuid-001', role: 'admin', email: 'admin@brandstore.com' });
    } else if (token.startsWith('mock-customer-token')) {
      c.set('user', { id: 'customer-uuid-001', role: 'customer', email: 'customer@brandstore.com' });
    } else {
      // Basic fallback
      c.set('user', { id: token, role: 'customer', email: 'user@brandstore.com' });
    }
    await next();
  } catch (err) {
    return c.json({ success: false, error: 'Unauthorized: Invalid token' }, 401);
  }
}

export async function adminOnlyMiddleware(c: Context, next: Next) {
  const user = c.get('user');
  if (!user || user.role !== 'admin') {
    return c.json({ success: false, error: 'Forbidden: Admin access required' }, 403);
  }
  return await next();
}
