import test from 'node:test';
import assert from 'node:assert';
import { ok, fail, serverError } from '../utils/response.js';

test('Response Utils', async (t) => {
  // Mock Hono context
  const mockContext = (getVal: any) => ({
    get: (key: string) => getVal[key],
    json: (body: any, status: number) => ({ body, status }),
    req: { method: 'GET', path: '/test' }
  } as any);

  await t.test('ok() returns formatted success response', () => {
    const c = mockContext({ requestId: 'req-123' });
    const res = ok(c, { id: 1 });
    assert.strictEqual(res.status, 200);
    // Explicitly cast body for TS check
    const body = res.body as unknown as { success: boolean; requestId: string; data: any };
    assert.strictEqual(body.success, true);
    assert.strictEqual(body.requestId, 'req-123');
  });

  await t.test('fail() returns formatted error response', () => {
    const c = mockContext({ requestId: 'req-456' });
    const res = fail(c, 'NOT_FOUND', 'Not Found', 404, { id: 1 });
    assert.strictEqual(res.status, 404);
    const body = res.body as unknown as { success: boolean; error: { code: string; details: any } };
    assert.strictEqual(body.success, false);
    assert.strictEqual(body.error.code, 'NOT_FOUND');
    assert.deepStrictEqual(body.error.details, { id: 1 });
  });

  await t.test('serverError() calls console.error', () => {
    const c = mockContext({ requestId: 'req-789' });
    let errorLogged = false;
    const origError = console.error;
    console.error = () => { errorLogged = true; };
    serverError(c, new Error('Boom'));
    console.error = origError;
    assert.strictEqual(errorLogged, true);
  });
});
