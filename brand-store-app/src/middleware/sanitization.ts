import { Context, Next } from 'hono';

// More aggressive HTML tag and script content stripper
function sanitize(input: any): any {
  if (typeof input === 'string') {
    // Remove script tags and content within them first, then all other tags
    return input
      .replace(/<script\b[^>]*>([\s\S]*?)<\/script>/gim, '')
      .replace(/<[^>]*>?/gm, '');
  }
  if (Array.isArray(input)) {
    return input.map(sanitize);
  }
  if (typeof input === 'object' && input !== null) {
    return Object.keys(input).reduce((acc, key) => {
      acc[key] = sanitize(input[key]);
      return acc;
    }, {} as any);
  }
  return input;
}

export function sanitizationMiddleware() {
  return async function sanitizeInput(c: Context, next: Next) {
    if (c.req.header('Content-Type')?.includes('application/json')) {
      const body = await c.req.json();
      c.set('sanitizedBody', sanitize(body));
    }
    await next();
  };
}
