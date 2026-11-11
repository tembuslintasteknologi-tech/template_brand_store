const { serve } = await import('@hono/node-server');
const { createApp } = await import('../src/app.ts');

const APP_PORT = 3113;
const APP_BASE = `http://127.0.0.1:${APP_PORT}`;
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
const server = serve({ fetch: app.fetch, port: APP_PORT });
await new Promise((resolve) => setTimeout(resolve, 300));

const db = HAS_DB ? (await import('../src/db/index.ts')).db : null;
const { sql } = HAS_DB ? await import('drizzle-orm') : {};

try {
  if (!HAS_DB) {
    console.log('SKIP admin scenarios (DATABASE_URL not set)');
  } else {
    const run = String(Date.now());

    await db.execute(
      sql`insert into users (email, password_hash, full_name, role, status)
          values (${'buyer1-' + run + '@example.com'}, 'x', 'Buyer Satu', 'customer', 'active'),
                 (${'buyer2-' + run + '@example.com'}, 'x', 'Buyer Dua', 'customer', 'active')`
    );
    const customers = rowsOf(await db.execute(sql`select id, email from users where role = 'customer' order by created_at desc limit 2`));
    check('two customers seeded', customers.length === 2, `count=${customers.length}`);

    const admin = rowsOf(await db.execute(sql`select id, email from users where role = 'admin' limit 1`))[0];

    await db.execute(
      sql`insert into products (title, slug, base_price, stock, status)
          values (${'Kaos Langka ' + run}, ${'kaos-langka-' + run}, '99000.00', 1, 'published'),
                 (${'Kaos Umum ' + run}, ${'kaos-umum-' + run}, '49000.00', 80, 'published')`
    );

    await db.execute(
      sql`insert into orders (order_number, customer_id, status, total_amount, shipping_address)
          values (${'ORD-ADMIN-NEW-' + run}, ${customers[0].id}, 'pending', '150000.00', '{"city":"Jakarta"}'::jsonb)`
    );
    await db.execute(
      sql`insert into orders (order_number, customer_id, status, total_amount, shipping_address, payment_details)
          values (${'ORD-ADMIN-FAIL-' + run}, ${customers[1].id}, 'cancelled', '90000.00', '{"city":"Bandung"}'::jsonb,
                  '{"status":"failed","gateway":"midtrans"}'::jsonb)`
    );

    const loginRes = await fetch(`${APP_BASE}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: process.env.ADMIN_EMAIL ?? 'admin@brandstore.com',
        password: process.env.ADMIN_PASSWORD ?? 'Admin12345!',
      }),
    });
    const loginBody = await loginRes.json();
    const token = loginBody?.data?.token;
    check('admin login returns token', Boolean(token), `status=${loginRes.status}`);

    const auth = { 'content-type': 'application/json', authorization: `Bearer ${token}` };

    const chartsRes = await fetch(`${APP_BASE}/api/v1/admin/dashboard/charts?days=7`, { headers: auth });
    const chartsBody = await chartsRes.json();
    check(
      'GET /api/v1/admin/dashboard/charts returns 7 daily points',
      chartsRes.status === 200 &&
        Array.isArray(chartsBody?.data?.revenue) &&
        chartsBody.data.revenue.length === 7 &&
        chartsBody.data.totals.orders >= 2,
      `status=${chartsRes.status} points=${chartsBody?.data?.revenue?.length} totals=${JSON.stringify(chartsBody?.data?.totals)}`
    );

    const alertsRes = await fetch(`${APP_BASE}/api/v1/admin/alerts?lowStockThreshold=5`, { headers: auth });
    const alertsBody = await alertsRes.json();
    const alertTypes = new Set((alertsBody?.data?.alerts ?? []).map((alert) => alert.type));
    check(
      'GET /api/v1/admin/alerts reports new order, failed payment and low stock',
      alertsRes.status === 200 && alertTypes.has('new_order') && alertTypes.has('payment_failed') && alertTypes.has('low_stock'),
      `status=${alertsRes.status} types=${[...alertTypes].join('|')} count=${alertsBody?.data?.count}`
    );

    const csvRes = await fetch(`${APP_BASE}/api/v1/admin/reports/export?type=orders&format=csv`, { headers: auth });
    const csvBody = await csvRes.text();
    check(
      'GET reports/export csv returns a CSV attachment with header row',
      csvRes.status === 200 &&
        String(csvRes.headers.get('content-type')).includes('text/csv') &&
        String(csvRes.headers.get('content-disposition')).includes('attachment') &&
        csvBody.split('\r\n')[0].includes('order_number'),
      `status=${csvRes.status} type=${csvRes.headers.get('content-type')} firstLine=${csvBody.split('\r\n')[0]}`
    );

    const jsonRes = await fetch(`${APP_BASE}/api/v1/admin/reports/export?type=customers&format=json`, { headers: auth });
    const jsonBody = await jsonRes.json();
    check(
      'GET reports/export json returns customers payload',
      jsonRes.status === 200 && jsonBody?.rowCount >= 2 && Array.isArray(jsonBody?.rows),
      `status=${jsonRes.status} rowCount=${jsonBody?.rowCount}`
    );

    const xlsxRes = await fetch(`${APP_BASE}/api/v1/admin/reports/export?type=orders&format=xlsx`, { headers: auth });
    const xlsxBody = await xlsxRes.json();
    check(
      'GET reports/export rejects xlsx with an explicit message',
      xlsxRes.status === 400 && /xlsx/.test(String(xlsxBody?.error)),
      `status=${xlsxRes.status} body=${JSON.stringify(xlsxBody)}`
    );

    const listRes = await fetch(`${APP_BASE}/api/v1/admin/customers?limit=10`, { headers: auth });
    const listBody = await listRes.json();
    check(
      'GET /api/v1/admin/customers lists customers with total',
      listRes.status === 200 && listBody?.data?.total >= 2 && listBody?.data?.customers?.length >= 2,
      `status=${listRes.status} total=${listBody?.data?.total}`
    );

    const detailRes = await fetch(`${APP_BASE}/api/v1/admin/customers/${customers[0].id}`, { headers: auth });
    const detailBody = await detailRes.json();
    check(
      'GET /api/v1/admin/customers/:id hides passwordHash',
      detailRes.status === 200 && detailBody?.data?.email === customers[0].email && detailBody?.data?.passwordHash === undefined,
      `status=${detailRes.status} keys=${Object.keys(detailBody?.data ?? {}).join(',')}`
    );

    const suspendRes = await fetch(`${APP_BASE}/api/v1/admin/customers/${customers[0].id}/status`, {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({ status: 'suspended' }),
    });
    const suspendBody = await suspendRes.json();
    check(
      'POST customers/:id/status suspends the customer',
      suspendRes.status === 200 && suspendBody?.data?.status === 'suspended',
      `status=${suspendRes.status} body=${JSON.stringify(suspendBody)}`
    );

    const missingRes = await fetch(`${APP_BASE}/api/v1/admin/customers/00000000-0000-0000-0000-000000000000`, { headers: auth });
    check('GET unknown customer returns 404', missingRes.status === 404, `status=${missingRes.status}`);

    const promoteRes = await fetch(`${APP_BASE}/api/v1/admin/users/${customers[1].id}/role`, {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({ role: 'admin' }),
    });
    const promoteBody = await promoteRes.json();
    check(
      'POST users/:id/role promotes a customer to admin',
      promoteRes.status === 200 && promoteBody?.data?.role === 'admin' && promoteBody?.data?.adminsRemaining >= 2,
      `status=${promoteRes.status} body=${JSON.stringify(promoteBody)}`
    );

    const demoteRes = await fetch(`${APP_BASE}/api/v1/admin/users/${customers[1].id}/role`, {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({ role: 'customer' }),
    });
    const demoteBody = await demoteRes.json();
    check(
      'POST users/:id/role demotes back to customer',
      demoteRes.status === 200 && demoteBody?.data?.role === 'customer',
      `status=${demoteRes.status} body=${JSON.stringify(demoteBody)}`
    );

    const lastAdminRes = await fetch(`${APP_BASE}/api/v1/admin/users/${admin.id}/role`, {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({ role: 'customer' }),
    });
    const lastAdminBody = await lastAdminRes.json();
    check(
      'last admin cannot be demoted',
      lastAdminRes.status === 409 && /Admin terakhir/.test(String(lastAdminBody?.error)),
      `status=${lastAdminRes.status} body=${JSON.stringify(lastAdminBody)}`
    );

    const logsRes = await fetch(`${APP_BASE}/api/v1/admin/logs?limit=50`, { headers: auth });
    const logsBody = await logsRes.json();
    const actions = new Set((logsBody?.data?.logs ?? []).map((entry) => entry.action));
    check(
      'GET /api/v1/admin/logs records suspend, promote and export actions',
      logsRes.status === 200 &&
        actions.has('customer.suspend') &&
        actions.has('user.promote_admin') &&
        actions.has('report.export'),
      `status=${logsRes.status} actions=${[...actions].join('|')}`
    );

    const forbiddenRes = await fetch(`${APP_BASE}/api/v1/admin/customers`, {
      headers: { authorization: 'Bearer mock-customer-token-x' },
    });
    check('customer token is rejected on admin routes', forbiddenRes.status === 403, `status=${forbiddenRes.status}`);
  }
} finally {
  server.close();
}

console.log(failures === 0 ? 'RESULT: ALL PASS' : `RESULT: ${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
