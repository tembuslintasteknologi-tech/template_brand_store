const upstream = await import('node:http');
const crypto = await import('node:crypto');

const RUN_ID = String(Date.now());
const ONDEMAND_AWB = `ORD-ONDEMAND-${RUN_ID}`;
const AGG_AWB = `JNE-LOCAL-${RUN_ID}`;
const WEBHOOK_SECRET = process.env.TEMBUS_WEBHOOK_SECRET || 'whsec_local_check';
const UPSTREAM_PORT = 3999;
const APP_PORT = 3112;
const APP_BASE = `http://127.0.0.1:${APP_PORT}`;

process.env.TEMBUS_ONDEMAND_BASE_URL = `http://127.0.0.1:${UPSTREAM_PORT}`;
process.env.TEMBUS_AGGREGATOR_BASE_URL = `http://127.0.0.1:${UPSTREAM_PORT}`;
process.env.TEMBUS_API_KEY = process.env.TEMBUS_API_KEY || 'lcr_local_check_key';
process.env.TEMBUS_AGGREGATOR_TOKEN = process.env.TEMBUS_AGGREGATOR_TOKEN || 'agg_local_check_token';
process.env.TEMBUS_WEBHOOK_SECRET = WEBHOOK_SECRET;

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

const upstreamRequests = [];

const stub = upstream.createServer((req, res) => {
  let body = '';
  req.on('data', (chunk) => (body += chunk));
  req.on('end', () => {
    const parsedBody = body ? JSON.parse(body) : null;
    upstreamRequests.push({ method: req.method, url: req.url, body: parsedBody });
    const send = (status, payload) => {
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(payload));
    };

    if (req.method === 'POST' && req.url === '/quotes') {
      return send(200, { data: { estimate_id: `est-${RUN_ID}`, total_price_idr: 27000, distance_km: 12 } });
    }
    if (req.method === 'POST' && req.url === '/orders') {
      return send(201, { data: { order_id: ONDEMAND_AWB, status: 'created', total_price_idr: 27000 } });
    }
    if (req.method === 'GET' && /^\/orders\/[^/]+\/track$/.test(req.url)) {
      return send(200, {
        data: {
          status: 'in_transit',
          model: 'p2p',
          pickup_address: 'Jakarta',
          dropoff_address: 'Bandung',
          history: [{ status: 'picked_up', timestamp: '2026-11-10T09:00:00Z', location: 'Jakarta' }],
        },
      });
    }
    if (req.method === 'POST' && /^\/orders\/[^/]+\/cancel$/.test(req.url)) {
      return send(200, { success: true });
    }
    if (req.method === 'GET' && req.url.startsWith('/api/v1/logistics/tariff')) {
      const carrier = new URL(`http://x${req.url}`).searchParams.get('provider') || 'jne';
      return send(200, {
        success: true,
        data: {
          provider: carrier,
          services: [
            {
              service_code: 'REG',
              service_name: `${carrier.toUpperCase()} Regular`,
              tariff_gross: 19000,
              tariff_net: 17000,
              customer_tariff_idr: 21000,
              etd: '2-3',
            },
          ],
        },
      });
    }
    if (req.method === 'POST' && req.url === '/api/internal/logistics/create-order') {
      return send(200, { success: true, data: { awb_number: AGG_AWB, status: 'created' } });
    }
    if (req.method === 'GET' && req.url.startsWith('/api/v1/tracking/public')) {
      return send(200, { data: { status: 'delivered', service_type: 'REG', history: [] } });
    }
    return send(404, { error: { message: 'stub route not found' } });
  });
});

await new Promise((resolve) => stub.listen(UPSTREAM_PORT, '127.0.0.1', resolve));

const { serve } = await import('@hono/node-server');
const { createApp } = await import('../src/app.ts');

const app = createApp();
const server = serve({ fetch: app.fetch, port: APP_PORT });
await new Promise((resolve) => setTimeout(resolve, 300));

const db = HAS_DB ? (await import('../src/db/index.ts')).db : null;
const { sql } = HAS_DB ? await import('drizzle-orm') : {};

async function seedOrder(orderNumber) {
  const user = rowsOf(await db.execute(sql`select id from users limit 1`))[0];
  const inserted = await db.execute(
    sql`insert into orders (order_number, customer_id, status, total_amount, shipping_address)
        values (${orderNumber}, ${user.id}, 'pending', '150000.00',
        ${JSON.stringify({ recipientName: 'Buyer', phone: '0812', addressLine: 'Jl. Bandung 1', city: 'Bandung', postalCode: '40111' })}::jsonb)
        returning id, order_number`
  );
  return rowsOf(inserted)[0];
}

async function readOrder(orderNumber) {
  return rowsOf(await db.execute(sql`select status, shipping_details from orders where order_number = ${orderNumber} limit 1`))[0];
}

async function readShipment(awb) {
  return rowsOf(await db.execute(sql`select awb, status, provider, mode, tracking_history from shipments where awb = ${awb} limit 1`))[0];
}

try {
  const providersRes = await fetch(`${APP_BASE}/api/v1/logistics/providers`);
  const providersBody = await providersRes.json();
  const names = (providersBody?.data ?? []).map((entry) => entry.name).sort();
  check(
    'GET /api/v1/logistics/providers lists on-demand and aggregator',
    providersRes.status === 200 && names.join(',') === 'tembus_aggregator,tembus_ondemand',
    `status=${providersRes.status} names=${names.join('|')}`
  );

  const ratesRes = await fetch(`${APP_BASE}/api/v1/logistics/rates`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      origin: { name: 'Gudang', phone: '0811', addressLine: 'Jl A', city: 'Jakarta', latitude: -6.2, longitude: 106.8 },
      destination: { name: 'Buyer', phone: '0812', addressLine: 'Jl B', city: 'Bandung', latitude: -6.9, longitude: 107.6 },
      weightGrams: 2000,
      dimensions: { lengthCm: 30, widthCm: 20, heightCm: 10 },
    }),
  });
  const ratesBody = await ratesRes.json();
  const modalities = new Set((ratesBody?.data?.rates ?? []).map((rate) => rate.mode));
  check(
    'POST /api/v1/logistics/rates merges on-demand quote and aggregator tariff',
    ratesRes.status === 200 && modalities.has('ondemand') && modalities.has('aggregator'),
    `status=${ratesRes.status} modes=${[...modalities].join('|')} count=${ratesBody?.data?.rates?.length}`
  );
  check(
    'rates are sorted by cost and cheapest is returned',
    Array.isArray(ratesBody?.data?.rates) &&
      ratesBody.data.rates.every((rate, index, all) => index === 0 || all[index - 1].cost <= rate.cost) &&
      Boolean(ratesBody?.data?.cheapest),
    `cheapest=${JSON.stringify(ratesBody?.data?.cheapest)}`
  );

  if (HAS_DB) {
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

    const authHeaders = { 'content-type': 'application/json', authorization: `Bearer ${token}` };

    const orderA = await seedOrder(`ORD-OND-${RUN_ID}`);
    const onDemandRes = await fetch(`${APP_BASE}/api/v1/logistics/admin/shipments`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        orderId: orderA.id,
        provider: 'tembus_ondemand',
        service: 'p2p',
        deliveryInstructions: 'titip satpam',
      }),
    });
    const onDemandBody = await onDemandRes.json();
    check(
      'POST admin shipments creates on-demand AWB from Tembus order',
      onDemandRes.status === 200 && onDemandBody?.data?.awb === ONDEMAND_AWB,
      `status=${onDemandRes.status} body=${JSON.stringify(onDemandBody)}`
    );

    const onDemandShipment = await readShipment(ONDEMAND_AWB);
    check(
      'shipment row persisted with provider and mode',
      onDemandShipment?.provider === 'tembus_ondemand' && onDemandShipment?.mode === 'ondemand',
      `row=${JSON.stringify(onDemandShipment)}`
    );
    const orderAAfterCreate = await readOrder(orderA.order_number);
    check(
      'order shipping_details stores AWB and delivery instructions',
      orderAAfterCreate?.shipping_details?.awb === ONDEMAND_AWB &&
        orderAAfterCreate?.shipping_details?.deliveryInstructions === 'titip satpam',
      `shipping=${JSON.stringify(orderAAfterCreate?.shipping_details)}`
    );

    const trackRes = await fetch(`${APP_BASE}/api/v1/logistics/track/${ONDEMAND_AWB}`);
    const trackBody = await trackRes.json();
    check(
      'GET /api/v1/logistics/track/:awb returns canonical tracking',
      trackRes.status === 200 && trackBody?.data?.status === 'in_transit' && trackBody?.data?.orderStatus === 'shipped',
      `status=${trackRes.status} body=${JSON.stringify(trackBody?.data)}`
    );
    const orderAAfterTrack = await readOrder(orderA.order_number);
    check('tracking syncs order status to shipped', orderAAfterTrack?.status === 'shipped', `order status=${orderAAfterTrack?.status}`);

    const webhookPayload = JSON.stringify({ data: { order_id: ONDEMAND_AWB, status: 'delivered', location: 'Bandung' } });
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature =
      'sha256=' + crypto.createHmac('sha256', WEBHOOK_SECRET).update(`${timestamp}.${webhookPayload}`).digest('hex');

    const badWebhook = await fetch(`${APP_BASE}/webhooks/logistics/tembus_ondemand`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-lancar-timestamp': timestamp, 'x-lancar-signature': 'sha256=deadbeef' },
      body: webhookPayload,
    });
    check('logistics webhook rejects a bad signature', badWebhook.status === 401, `status=${badWebhook.status}`);

    const webhookRes = await fetch(`${APP_BASE}/webhooks/logistics/tembus_ondemand`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-lancar-timestamp': timestamp,
        'x-lancar-signature': signature,
        'x-lancar-delivery-id': `dlv-${RUN_ID}`,
      },
      body: webhookPayload,
    });
    const webhookBody = await webhookRes.json();
    check(
      'logistics webhook applies delivered status and syncs order',
      webhookRes.status === 200 &&
        webhookBody?.data?.shipmentStatus === 'delivered' &&
        webhookBody?.data?.orderStatus === 'delivered',
      `status=${webhookRes.status} body=${JSON.stringify(webhookBody)}`
    );
    const orderAfterWebhook = await readOrder(orderA.order_number);
    check('order status becomes delivered after webhook', orderAfterWebhook?.status === 'delivered', `order status=${orderAfterWebhook?.status}`);
    const shipmentAfterWebhook = await readShipment(ONDEMAND_AWB);
    check(
      'shipment tracking history records the webhook event',
      Array.isArray(shipmentAfterWebhook?.tracking_history) && shipmentAfterWebhook.tracking_history.length >= 2,
      `history=${JSON.stringify(shipmentAfterWebhook?.tracking_history)}`
    );

    const orderB = await seedOrder(`ORD-AGG-${RUN_ID}`);
    const aggregatorRes = await fetch(`${APP_BASE}/api/v1/logistics/admin/shipments`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ orderId: orderB.id, provider: 'tembus_aggregator', service: 'jne_REG' }),
    });
    const aggregatorBody = await aggregatorRes.json();
    check(
      'POST admin shipments creates aggregator AWB through Tembus',
      aggregatorRes.status === 200 && aggregatorBody?.data?.awb === AGG_AWB,
      `status=${aggregatorRes.status} body=${JSON.stringify(aggregatorBody)}`
    );

    const labelRes = await fetch(`${APP_BASE}/api/v1/logistics/admin/shipments/${AGG_AWB}/label`, { headers: authHeaders });
    const labelBody = await labelRes.json();
    check(
      'GET label returns resi render URL for aggregator shipment',
      labelRes.status === 200 && String(labelBody?.data?.labelUrl).includes(`/api/resi/render/${AGG_AWB}`),
      `status=${labelRes.status} body=${JSON.stringify(labelBody)}`
    );

    const aggTrackRes = await fetch(`${APP_BASE}/api/v1/logistics/track/${AGG_AWB}`);
    const aggTrackBody = await aggTrackRes.json();
    check(
      'GET tracking resolves aggregator AWB through unified interface',
      aggTrackRes.status === 200 &&
        aggTrackBody?.data?.provider === 'tembus_aggregator' &&
        aggTrackBody?.data?.status === 'delivered',
      `status=${aggTrackRes.status} body=${JSON.stringify(aggTrackBody?.data)}`
    );

    const pickupRes = await fetch(`${APP_BASE}/api/v1/logistics/admin/pickup`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ awbs: [AGG_AWB], pickupDate: '2026-11-11' }),
    });
    const pickupBody = await pickupRes.json();
    check(
      'pickup scheduling reports unsupported instead of faking a pickup',
      pickupRes.status === 501 && /not exposed/.test(String(pickupBody?.error)),
      `status=${pickupRes.status} body=${JSON.stringify(pickupBody)}`
    );

    const failedWebhookPayload = JSON.stringify({ data: { order_id: ONDEMAND_AWB, status: 'failed', notes: 'penerima tidak di tempat' } });
    const failedTimestamp = String(Math.floor(Date.now() / 1000));
    const failedSignature =
      'sha256=' + crypto.createHmac('sha256', WEBHOOK_SECRET).update(`${failedTimestamp}.${failedWebhookPayload}`).digest('hex');
    const failedRes = await fetch(`${APP_BASE}/webhooks/logistics/tembus_ondemand`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-lancar-timestamp': failedTimestamp,
        'x-lancar-signature': failedSignature,
        'x-lancar-delivery-id': `dlv-failed-${RUN_ID}`,
      },
      body: failedWebhookPayload,
    });
    const failedBody = await failedRes.json();
    check(
      'failed delivery webhook records failed status without cancelling the order',
      failedRes.status === 200 && failedBody?.data?.shipmentStatus === 'failed' && failedBody?.data?.orderStatus === null,
      `status=${failedRes.status} body=${JSON.stringify(failedBody)}`
    );

    const exceptionRes = await fetch(`${APP_BASE}/api/v1/logistics/admin/shipments/${ONDEMAND_AWB}/exception`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ action: 'return_to_sender', notes: 'dikembalikan ke gudang' }),
    });
    const exceptionBody = await exceptionRes.json();
    check(
      'POST exception return_to_sender marks shipment returned and order cancelled',
      exceptionRes.status === 200 &&
        exceptionBody?.data?.shipmentStatus === 'returned' &&
        exceptionBody?.data?.orderStatus === 'cancelled',
      `status=${exceptionRes.status} body=${JSON.stringify(exceptionBody)}`
    );
    const orderAfterException = await readOrder(orderA.order_number);
    check('order status becomes cancelled after return', orderAfterException?.status === 'cancelled', `order status=${orderAfterException?.status}`);

    const unknownAwb = await fetch(`${APP_BASE}/api/v1/logistics/track/AWB-TIDAK-ADA-${RUN_ID}`);
    check('tracking unknown AWB returns 404', unknownAwb.status === 404, `status=${unknownAwb.status}`);
  } else {
    console.log('SKIP database scenarios (DATABASE_URL not set)');
  }
} finally {
  server.close();
  await new Promise((resolve) => stub.close(resolve));
  console.log(`upstream requests: ${upstreamRequests.length}`);
}

console.log(failures === 0 ? 'RESULT: ALL PASS' : `RESULT: ${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
