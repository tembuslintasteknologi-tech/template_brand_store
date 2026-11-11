const { serve } = await import('@hono/node-server');
const { createApp } = await import('../src/app.ts');

const APP_PORT = 3114;
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
    console.log('SKIP config scenarios (DATABASE_URL not set)');
  } else {
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

    const listRes = await fetch(`${APP_BASE}/api/v1/admin/settings`, { headers: auth });
    const listBody = await listRes.json();
    check(
      'GET /api/v1/admin/settings lists seeded settings',
      listRes.status === 200 && listBody?.data?.count >= 8,
      `status=${listRes.status} count=${listBody?.data?.count}`
    );

    const resetTax = await fetch(`${APP_BASE}/api/v1/admin/settings/tax.percent`, {
      method: 'PUT',
      headers: auth,
      body: JSON.stringify({ value: { percent: 11 } }),
    });
    check('PUT resets tax.percent to 11 for a deterministic read', resetTax.status === 200, `status=${resetTax.status}`);

    const oneRes = await fetch(`${APP_BASE}/api/v1/admin/settings/tax.percent`, { headers: auth });
    const oneBody = await oneRes.json();
    check(
      'GET /api/v1/admin/settings/:key returns the value',
      oneRes.status === 200 && oneBody?.data?.value?.percent === 11,
      `status=${oneRes.status} body=${JSON.stringify(oneBody?.data?.value)}`
    );

    const putRes = await fetch(`${APP_BASE}/api/v1/admin/settings/tax.percent`, {
      method: 'PUT',
      headers: auth,
      body: JSON.stringify({ value: { percent: 12 } }),
    });
    const putBody = await putRes.json();
    check(
      'PUT /api/v1/admin/settings/:key updates the value',
      putRes.status === 200 && putBody?.data?.value?.percent === 12,
      `status=${putRes.status} body=${JSON.stringify(putBody?.data?.value)}`
    );

    const badPut = await fetch(`${APP_BASE}/api/v1/admin/settings/tax.percent`, {
      method: 'PUT',
      headers: auth,
      body: JSON.stringify({ value: { percent: 250 } }),
    });
    const badPutBody = await badPut.json();
    check(
      'PUT rejects an out of range tax percent',
      badPut.status === 400 && /tidak valid/i.test(String(badPutBody?.error)),
      `status=${badPut.status} body=${JSON.stringify(badPutBody)}`
    );

    const unknownRes = await fetch(`${APP_BASE}/api/v1/admin/settings/tidak.ada`, { headers: auth });
    check('GET unknown setting returns 404', unknownRes.status === 404, `status=${unknownRes.status}`);

    const expiryPut = await fetch(`${APP_BASE}/api/v1/admin/settings/payment.expiry_minutes`, {
      method: 'PUT',
      headers: auth,
      body: JSON.stringify({ value: { minutes: 45 } }),
    });
    check('PUT payment.expiry_minutes succeeds', expiryPut.status === 200, `status=${expiryPut.status}`);

    const publicConfigRes = await fetch(`${APP_BASE}/api/v1/site-config`);
    const publicConfigBody = await publicConfigRes.json();
    check(
      'GET /api/v1/site-config exposes the updated tax percent and expiry',
      publicConfigRes.status === 200 &&
        publicConfigBody?.data?.taxPercent === 12 &&
        publicConfigBody?.data?.paymentExpiryMinutes === 45,
      `status=${publicConfigRes.status} body=${JSON.stringify(publicConfigBody?.data)}`
    );

    const profileRes = await fetch(`${APP_BASE}/api/v1/admin/brand-profile`, {
      method: 'PUT',
      headers: auth,
      body: JSON.stringify({
        name: 'Tembus Store',
        logoUrl: 'https://cdn.tembus.example/logo.png',
        faviconUrl: 'https://cdn.tembus.example/favicon.ico',
        contact: { email: 'halo@tembus.id', phone: '+6221000000', whatsapp: '+62812000000' },
        social: { instagram: '@tembusstore', facebook: 'tembusstore' },
      }),
    });
    const profileBody = await profileRes.json();
    check(
      'PUT /api/v1/admin/brand-profile stores the brand identity',
      profileRes.status === 200 && profileBody?.data?.name === 'Tembus Store',
      `status=${profileRes.status} body=${JSON.stringify(profileBody?.data)}`
    );

    const badProfile = await fetch(`${APP_BASE}/api/v1/admin/brand-profile`, {
      method: 'PUT',
      headers: auth,
      body: JSON.stringify({ name: 'Tembus', contact: { email: 'bukan-email' } }),
    });
    check('PUT brand-profile rejects an invalid email', badProfile.status === 400, `status=${badProfile.status}`);

    const afterProfile = await fetch(`${APP_BASE}/api/v1/site-config`);
    const afterProfileBody = await afterProfile.json();
    check(
      'public site-config reflects the brand profile',
      afterProfileBody?.data?.brand?.name === 'Tembus Store' &&
        afterProfileBody?.data?.brand?.logoUrl === 'https://cdn.tembus.example/logo.png' &&
        afterProfileBody?.data?.brand?.contact?.email === 'halo@tembus.id',
      `brand=${JSON.stringify(afterProfileBody?.data?.brand)}`
    );

    const flagsPut = await fetch(`${APP_BASE}/api/v1/admin/feature-flags`, {
      method: 'PUT',
      headers: auth,
      body: JSON.stringify({ reviews: false, wishlist: true, wallet: true, loyalty: false }),
    });
    check('PUT /api/v1/admin/feature-flags stores flags', flagsPut.status === 200, `status=${flagsPut.status}`);

    const flagsPublic = await fetch(`${APP_BASE}/api/v1/features`);
    const flagsBody = await flagsPublic.json();
    check(
      'GET /api/v1/features exposes only enabled flags',
      flagsPublic.status === 200 &&
        flagsBody?.data?.enabled?.includes('wishlist') &&
        flagsBody?.data?.enabled?.includes('wallet') &&
        !flagsBody?.data?.enabled?.includes('reviews'),
      `status=${flagsPublic.status} enabled=${JSON.stringify(flagsBody?.data?.enabled)}`
    );

    const created = await fetch(`${APP_BASE}/api/v1/admin/store-locations`, {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({
        name: 'Gudang Bandung',
        phone: '+6222000000',
        addressLine: 'Jl. Asia Afrika 10',
        city: 'Bandung',
        province: 'Jawa Barat',
        postalCode: '40111',
      }),
    });
    const createdBody = await created.json();
    check(
      'POST /api/v1/admin/store-locations creates a location',
      created.status === 201 && createdBody?.data?.name === 'Gudang Bandung',
      `status=${created.status} id=${createdBody?.data?.id}`
    );

    const secondLocationId = createdBody?.data?.id;

    const locationsBefore = await fetch(`${APP_BASE}/api/v1/admin/store-locations`, { headers: auth });
    const locationsBeforeBody = await locationsBefore.json();
    check(
      'GET store-locations lists seeded and new locations',
      locationsBefore.status === 200 && locationsBeforeBody?.data?.count >= 2,
      `status=${locationsBefore.status} count=${locationsBeforeBody?.data?.count}`
    );

    const setDefault = await fetch(`${APP_BASE}/api/v1/admin/store-locations/${secondLocationId}/default`, {
      method: 'POST',
      headers: auth,
    });
    const setDefaultBody = await setDefault.json();
    check(
      'POST store-locations/:id/default sets the default location',
      setDefault.status === 200 && setDefaultBody?.data?.isDefault === true,
      `status=${setDefault.status} body=${JSON.stringify(setDefaultBody?.data)}`
    );

    const locationsAfter = await fetch(`${APP_BASE}/api/v1/admin/store-locations`, { headers: auth });
    const locationsAfterBody = await locationsAfter.json();
    const defaults = (locationsAfterBody?.data?.locations ?? []).filter((row) => row.isDefault === true);
    check(
      'exactly one default store location after switching',
      defaults.length === 1 && defaults[0].id === secondLocationId,
      `defaults=${defaults.map((row) => row.name).join('|')}`
    );

    const patched = await fetch(`${APP_BASE}/api/v1/admin/store-locations/${secondLocationId}`, {
      method: 'PATCH',
      headers: auth,
      body: JSON.stringify({ phone: '+6222111111' }),
    });
    const patchedBody = await patched.json();
    check(
      'PATCH store-locations/:id updates fields',
      patched.status === 200 && patchedBody?.data?.phone === '+6222111111',
      `status=${patched.status} phone=${patchedBody?.data?.phone}`
    );

    const missingLocation = await fetch(`${APP_BASE}/api/v1/admin/store-locations/00000000-0000-0000-0000-000000000000`, {
      method: 'DELETE',
      headers: auth,
    });
    check('DELETE unknown store location returns 404', missingLocation.status === 404, `status=${missingLocation.status}`);

    const quoteRes = await fetch(`${APP_BASE}/api/v1/checkout/quote`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        items: [{ productId: 'p1', variantId: null, quantity: 1, price: 100000, name: 'Kaos' }],
        promos: [],
      }),
    });
    const quoteBody = await quoteRes.json();
    check(
      'checkout quote uses the tax percent from settings (12%) when the client omits it',
      quoteRes.status === 200 && quoteBody?.data?.taxAmount === 12000,
      `status=${quoteRes.status} taxAmount=${quoteBody?.data?.taxAmount}`
    );

    const userRows = rowsOf(await db.execute(sql`select id from users limit 1`));
    const insertedOrder = rowsOf(
      await db.execute(
        sql`insert into orders (order_number, customer_id, status, total_amount, shipping_address)
            values (${'ORD-CFG-' + Date.now()}, ${userRows[0].id}, 'pending', '150000.00', '{"city":"Jakarta"}'::jsonb)
            returning id`
      )
    )[0];

    const paymentRes = await fetch(`${APP_BASE}/api/v1/payments/create`, {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({ orderId: insertedOrder.id, gateway: 'manual_bank', paymentMethod: 'manual_bank' }),
    });
    const paymentBody = await paymentRes.json();
    check(
      'payment create uses payment.expiry_minutes from settings (45 minutes)',
      paymentRes.status === 200 && paymentBody?.data?.expiryMinutes === 45,
      `status=${paymentRes.status} expiryMinutes=${paymentBody?.data?.expiryMinutes}`
    );

    const logsRes = await fetch(`${APP_BASE}/api/v1/admin/logs?limit=100`, { headers: auth });
    const logsBody = await logsRes.json();
    const logs = logsBody?.data?.logs ?? [];
    const actions = new Set(logs.map((entry) => entry.action));
    const settingTargets = new Set(logs.filter((entry) => entry.action === 'setting.update').map((entry) => entry.targetId));
    check(
      'audit log captures setting, profile and store location changes',
      logsRes.status === 200 &&
        actions.has('setting.update') &&
        actions.has('store_location.create') &&
        actions.has('store_location.set_default') &&
        settingTargets.has('tax.percent') &&
        settingTargets.has('brand.profile'),
      `actions=${[...actions].join('|')} targets=${[...settingTargets].join('|')}`
    );

    const storeConfig = await fetch(`${APP_BASE}/api/v1/store/config`);
    const storeConfigBody = await storeConfig.json();
    check(
      'GET /api/v1/store/config returns the public storefront config',
      storeConfig.status === 200 && storeConfigBody?.data?.brand?.name === 'Tembus Store',
      `status=${storeConfig.status} brand=${storeConfigBody?.data?.brand?.name}`
    );

    const maintenanceOn = await fetch(`${APP_BASE}/api/v1/admin/maintenance`, {
      method: 'PUT',
      headers: auth,
      body: JSON.stringify({ enabled: true, message: 'Toko sedang tutup sebentar' }),
    });
    const maintenanceOnBody = await maintenanceOn.json();
    check(
      'PUT /api/v1/admin/maintenance enables maintenance mode',
      maintenanceOn.status === 200 && maintenanceOnBody?.data?.enabled === true,
      `status=${maintenanceOn.status} body=${JSON.stringify(maintenanceOnBody?.data)}`
    );

    await new Promise((resolve) => setTimeout(resolve, 5500));

    const blockedRes = await fetch(`${APP_BASE}/api/v1/products`);
    const blockedBody = await blockedRes.json().catch(() => ({}));
    check(
      'public product API returns 503 MAINTENANCE_MODE while maintenance is on',
      blockedRes.status === 503 && blockedBody?.error?.code === 'MAINTENANCE_MODE',
      `status=${blockedRes.status} body=${JSON.stringify(blockedBody)}`
    );

    const adminDuringMaintenance = await fetch(`${APP_BASE}/api/v1/admin/settings`, { headers: auth });
    check(
      'admin API stays reachable during maintenance',
      adminDuringMaintenance.status === 200,
      `status=${adminDuringMaintenance.status}`
    );

    const healthDuringMaintenance = await fetch(`${APP_BASE}/health`);
    check('health endpoint stays reachable during maintenance', healthDuringMaintenance.status === 200, `status=${healthDuringMaintenance.status}`);

    const maintenanceOff = await fetch(`${APP_BASE}/api/v1/admin/maintenance`, {
      method: 'PUT',
      headers: auth,
      body: JSON.stringify({ enabled: false }),
    });
    check('PUT /api/v1/admin/maintenance disables maintenance mode', maintenanceOff.status === 200, `status=${maintenanceOff.status}`);

    await new Promise((resolve) => setTimeout(resolve, 5500));
    const openAgain = await fetch(`${APP_BASE}/api/v1/products`);
    check('public product API is reachable again after maintenance off', openAgain.status !== 503, `status=${openAgain.status}`);

    const forbidden = await fetch(`${APP_BASE}/api/v1/admin/settings`, {
      headers: { authorization: 'Bearer mock-customer-token-x' },
    });
    check('customer token rejected on config admin routes', forbidden.status === 403, `status=${forbidden.status}`);
  }
} finally {
  server.close();
}

console.log(failures === 0 ? 'RESULT: ALL PASS' : `RESULT: ${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
