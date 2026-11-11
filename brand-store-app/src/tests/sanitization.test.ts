import { describe, it } from 'node:test';
import assert from 'node:assert';
import { Hono } from 'hono';
import { sanitizationMiddleware } from '../middleware/sanitization.js';

describe('sanitizationMiddleware', () => {
  it('strips HTML tags from request body', async () => {
    const app = new Hono();
    app.use('*', sanitizationMiddleware());
    app.post('/test', async (c) => {
      const body = c.get('sanitizedBody' as any);
      return c.json(body);
    });

    const res = await app.request('/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bio: '<script>alert(1)</script>Hello World' }),
    });

    const body = await res.json() as any;
    assert.strictEqual(body.bio, 'Hello World');
  });
});
