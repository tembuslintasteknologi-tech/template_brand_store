import { Context, Next } from 'hono';

export function csrfMiddleware() {
  return async function csrfProtect(c: Context, next: Next) {
    const method = c.req.method;
    // Safe methods
    if (['GET', 'HEAD', 'OPTIONS'].includes(method)) {
      return next();
    }

    const token = c.req.header('X-CSRF-Token');
    if (!token) {
      return c.json({ error: 'CSRF token missing or invalid' }, 403);
    }

    await next();
  };
}
