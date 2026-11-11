process.env.MIDTRANS_SERVER_KEY ??= 'SB-Mid-server-local-check';
const crypto = await import('node:crypto');
const SERVER_KEY = process.env.MIDTRANS_SERVER_KEY;
function midtransSignature(orderId, statusCode, grossAmount) {
  return crypto.createHash('sha512').update(`${orderId}${statusCode}${grossAmount}${SERVER_KEY}`).digest('hex');
}

const { serve } = await import('@hono/node-server');
const { createApp } = await import('../src/app.ts');

const PORT = 3111;
const BASE = `http://127.0.0.1:${PORT}`;
const DB_URL = process.env.DATABASE_URL ?? '';
const HAS_DB = DB_URL.length > 0;

let failures = 0;
function check(label, condition, detail) {
  console.log(`${condition ? 'PASS' : 'FAIL'} ${label}${detail ? ' :: ' + detail : ''}`);
  if (!condition) failures += 1;
}

function rowsOf(result) {
  if (Array.isArray(result)) return result;
  if (Array.isArray(result?.rows)) return result.rows;
  return [];
}

const app = createApp();
const server = serve({ fetch: app.fetch, port: PORT });
await new Promise((resolve) => setTimeout(resolve, 300));

const db = HAS_DB ? (await import('../src/db/index.ts')).db : null;
const { sql } = HAS_DB ? await import('drizzle-orm') : {};

async function seedOrder(orderNumber, expiresAt = null) {
  const user = rowsOf(await db.execute(sql`select id from users limit 1`))[0];
  if (!user) throw new Error('no user row to attach order');
  const inserted = await db.execute(
    sql`insert into orders (order_number, customer_id, status, total_amount, shipping_address, expires_at)
        values (${orderNumber}, ${user.id}, 'pending', '150000.00', ${JSON.stringify({ city: 'Jakarta' })}::jsonb, ${expiresAt})
        returning id, order_number, status`
  );
  return rowsOf(inserted)[0];
}

async function readOrder(orderNumber) {
  return rowsOf(await db.execute(sql`select status, payment_details, expires_at from orders where order_number = ${orderNumber} limit 1`))[0];
}

try {
  const methodsRes = await fetch(`${BASE}/api/v1/payments/methods`);
  const methodsBody = await methodsRes.json();
  const gateways = methodsBody?.data?.gateways ?? [];
  const methods = methodsBody?.data?.methods ?? [];
  check('GET /api/v1/payments/methods status 200', methodsRes.status === 200, `status=${methodsRes.status}`);
  check(
    'gateways include midtrans, xendit, manual_bank',
    ['midtrans', 'xendit', 'manual_bank'].every((g) => gateways.includes(g)),
    `gateways=${gateways.join('|')}`
  );
  check('payment methods list has entries', methods.length >= 5, `count=${methods.length}`);

  const badSig = await fetch(`${BASE}/api/v1/payments/webhooks/midtrans`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-callback-signature': 'wrong-signature' },
    body: JSON.stringify({ order_id: 'ORD-NOPE', transaction_status: 'settlement', gross_amount: '1000.00' }),
  });
  check('POST webhook with bad signature rejected 401', badSig.status === 401, `status=${badSig.status}`);

  const xenditBad = await fetch(`${BASE}/api/v1/payments/webhooks/xendit`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-callback-signature': 'wrong' },
    body: JSON.stringify({ external_id: 'ORD-NOPE', status: 'PAID', amount: '1000' }),
  });
  check('POST webhook xendit with bad token rejected 401', xenditBad.status === 401, `status=${xenditBad.status}`);

  const unauthCreate = await fetch(`${BASE}/api/v1/payments/create`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ orderId: '00000000-0000-0000-0000-000000000000' }),
  });
  check('POST /api/v1/payments/create requires auth', unauthCreate.status === 401, `status=${unauthCreate.status}`);

  if (HAS_DB) {
    const orderNumber = `ORD-HTTP-${Date.now()}`;
    const seeded = await seedOrder(orderNumber);
    check('order seeded in database', Boolean(seeded?.id), `orderNumber=${seeded?.order_number} status=${seeded?.status}`);

    const settle = await fetch(`${BASE}/api/v1/payments/webhooks/midtrans`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-callback-signature': midtransSignature(orderNumber, '200', '150000.00') },
      body: JSON.stringify({
        order_id: orderNumber,
        transaction_status: 'settlement',
        transaction_id: 'TRX-HTTP-1',
        status_code: '200',
        gross_amount: '150000.00',
      }),
    });
    const settleBody = await settle.json();
    check(
      'POST webhook settlement accepted 200 and returns paid',
      settle.status === 200 && settleBody?.data?.status === 'paid',
      `status=${settle.status} body=${JSON.stringify(settleBody)}`
    );

    const afterSettle = await readOrder(orderNumber);
    check('order row becomes paid in database', afterSettle?.status === 'paid', `db status=${afterSettle?.status}`);
    check(
      'payment_details stores gateway transaction',
      afterSettle?.payment_details?.transactionId === 'TRX-HTTP-1',
      `transactionId=${afterSettle?.payment_details?.transactionId}`
    );

    const replay = await fetch(`${BASE}/api/v1/payments/webhooks/midtrans`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-callback-signature': midtransSignature(orderNumber, '200', '150000.00') },
      body: JSON.stringify({
        order_id: orderNumber,
        transaction_status: 'settlement',
        transaction_id: 'TRX-HTTP-1',
        status_code: '200',
        gross_amount: '150000.00',
      }),
    });
    const replayBody = await replay.json();
    check(
      'replayed webhook is idempotent',
      replay.status === 200 && String(replayBody?.message ?? '').includes('idempotent'),
      `status=${replay.status} body=${JSON.stringify(replayBody)}`
    );

    const loginRes = await fetch(`${BASE}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: process.env.ADMIN_EMAIL ?? 'admin@brandstore.com',
        password: process.env.ADMIN_PASSWORD ?? 'Admin12345!',
      }),
    });
    const loginBody = await loginRes.json();
    const token = loginBody?.data?.token;
    check('admin login returns access token', Boolean(token), `status=${loginRes.status}`);

    if (token) {
      const manualOrderNumber = `ORD-MANUAL-${Date.now()}`;
      const manualOrder = await seedOrder(manualOrderNumber);
      const verifyRes = await fetch(`${BASE}/api/v1/payments/admin/verify-manual`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ orderId: manualOrder.id, approved: true, notes: 'bukti transfer diterima' }),
      });
      const verifyBody = await verifyRes.json();
      check(
        'admin verify-manual sets order paid',
        verifyRes.status === 200 && verifyBody?.data?.status === 'paid',
        `status=${verifyRes.status} body=${JSON.stringify(verifyBody)}`
      );
      const manualAfter = await readOrder(manualOrderNumber);
      check('manual order row paid in database', manualAfter?.status === 'paid', `db status=${manualAfter?.status}`);

      const statusRes = await fetch(`${BASE}/api/v1/payments/${manualOrder.id}/status`, {
        headers: { authorization: `Bearer ${token}` },
      });
      const statusBody = await statusRes.json();
      check(
        'GET /api/v1/payments/:orderId/status returns paid',
        statusRes.status === 200 && statusBody?.data?.status === 'paid',
        `status=${statusRes.status} body=${JSON.stringify(statusBody)}`
      );

      const unauthStatus = await fetch(`${BASE}/api/v1/payments/${manualOrder.id}/status`);
      check('payment status endpoint requires auth', unauthStatus.status === 401, `status=${unauthStatus.status}`);

      // PAY-006 expiry: create sets expiresAt
      const createOrderNumber = `ORD-EXPIRE-CREATE-${Date.now()}`;
      const createOrder = await seedOrder(createOrderNumber);
      const createRes = await fetch(`${BASE}/api/v1/payments/create`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ orderId: createOrder.id, gateway: 'manual_bank', paymentMethod: 'manual_bank', expiryMinutes: 30 }),
      });
      const createBody = await createRes.json();
      check(
        'POST /api/v1/payments/create returns expiresAt',
        createRes.status === 200 && typeof createBody?.data?.expiresAt === 'string',
        `status=${createRes.status} body=${JSON.stringify(createBody)}`
      );
      const createdRow = await readOrder(createOrderNumber);
      check(
        'payment create persists expires_at in database',
        Boolean(createdRow?.expires_at),
        `expires_at=${createdRow?.expires_at}`
      );
      check(
        'payment create stores manual_bank instructions',
        createdRow?.payment_details?.gateway === 'manual_bank',
        `gateway=${createdRow?.payment_details?.gateway}`
      );

      // PAY-006 expiry: sweep cancels expired pending orders
      const staleOrderNumber = `ORD-EXPIRE-SWEEP-${Date.now()}`;
      await seedOrder(staleOrderNumber, '2020-01-01T00:00:00.000Z');
      const sweepRes = await fetch(`${BASE}/api/v1/payments/admin/expire-sweep`, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}` },
      });
      const sweepBody = await sweepRes.json();
      check(
        'POST /api/v1/payments/admin/expire-sweep cancels expired orders',
        sweepRes.status === 200 && sweepBody?.data?.expiredCount >= 1,
        `status=${sweepRes.status} expiredCount=${sweepBody?.data?.expiredCount}`
      );
      const staleRow = await readOrder(staleOrderNumber);
      check(
        'expired order row becomes cancelled',
        staleRow?.status === 'cancelled',
        `db status=${staleRow?.status}`
      );
      check(
        'expired order payment_details marked expired',
        staleRow?.payment_details?.status === 'expired',
        `payment status=${staleRow?.payment_details?.status}`
      );

      const unauthSweep = await fetch(`${BASE}/api/v1/payments/admin/expire-sweep`, { method: 'POST' });
      check('expire-sweep endpoint requires auth', unauthSweep.status === 401, `status=${unauthSweep.status}`);
    }
  } else {
    console.log('SKIP database scenarios (DATABASE_URL not set)');
  }
} finally {
  server.close();
}

console.log(failures === 0 ? 'RESULT: ALL PASS' : `RESULT: ${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
