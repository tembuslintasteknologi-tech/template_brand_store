import test from 'node:test';
import assert from 'node:assert';
import server from '../index.js';
import { createApp } from '../app.js';
import { realtimeRoutes } from '../routes/realtime.js';

/**
 * Regresi untuk celah entrypoint: dulu `src/index.ts` membangun Hono sendiri dengan prefix
 * `/api`, jadi semua route yang di-mount di `createApp()` (chat, cart, 2FA, dan mayoritas
 * pekerjaan Phase 2/3) hanya hidup di dalam test. Test ini memastikan `npm start` menyajikan
 * app yang sama dengan yang diuji.
 */

let ipSeed = 0;
function ip(): string {
  ipSeed += 1;
  return `10.77.${Math.floor(ipSeed / 250)}.${(ipSeed % 250) + 1}`;
}

async function call(path: string) {
  return server.fetch(
    new Request(`http://local${path}`, { headers: { 'x-forwarded-for': ip() } })
  );
}

test('the server entrypoint exports the shared app, not a private subset', async () => {
  assert.strictEqual(typeof server.fetch, 'function');
  assert.strictEqual(typeof server.port, 'number');

  // Route yang hanya ada di createApp(): kalau entrypoint masih memakai app sendiri, ini 404.
  const chat = await call('/api/v1/chat/hours');
  assert.strictEqual(chat.status, 401, 'GET /api/v1/chat/hours harus ter-mount dan butuh auth');

  const cart = await call('/api/v1/cart');
  assert.strictEqual(cart.status, 401, 'GET /api/v1/cart harus ter-mount dan butuh auth');

  const twoFactor = await call('/api/v1/auth/2fa/status');
  assert.strictEqual(twoFactor.status, 401, 'GET /api/v1/auth/2fa/status harus ter-mount dan butuh auth');
});

test('the entrypoint does not resurrect the legacy /api prefix', async () => {
  const legacy = await call('/api/chat/hours');
  assert.strictEqual(legacy.status, 404);
});

test('realtime stream route is mounted on the v1 api group', () => {
  const paths = realtimeRoutes.routes.map((route) => `${route.method} ${route.path}`);
  assert.ok(
    paths.includes('GET /orders/:orderId/stream'),
    `route realtime tidak terdaftar: ${paths.join(', ')}`
  );

  const app = createApp();
  const apiRoutes = app.routes.map((route) => route.path);
  assert.ok(
    apiRoutes.some((path) => path.startsWith('/api/v1/realtime')),
    'createApp() harus memasang /api/v1/realtime supaya SSE order status bisa diakses'
  );
});
