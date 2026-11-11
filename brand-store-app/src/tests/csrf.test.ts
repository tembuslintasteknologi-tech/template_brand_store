import { describe, it } from 'node:test';
import assert from 'node:assert';
import { Hono } from 'hono';
import { csrfMiddleware } from '../middleware/csrf.js';

describe('csrfMiddleware', () => {
  it('rejects POST request without CSRF token', async () => {
    const app = new Hono();
    app.use('*', csrfMiddleware());
    app.post('/transfer', (c) => c.text('success'));

    const res = await app.request('/transfer', {
      method: 'POST',
    });

    assert.strictEqual(res.status, 403);
  });

  it('allows POST request with valid CSRF token', async () => {
    const app = new Hono();
    app.use('*', csrfMiddleware());
    app.post('/transfer', (c) => c.text('success'));

    const res = await app.request('/transfer', {
      method: 'POST',
      headers: {
        'X-CSRF-Token': 'valid-token',
      },
    });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(await res.text(), 'success');
  });
});
