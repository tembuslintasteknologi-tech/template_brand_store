const { serve } = await import('@hono/node-server');
const { createApp } = await import('../src/app.ts');

const APP_PORT = 3117;
const APP_BASE = `http://127.0.0.1:${APP_PORT}`;
const DB_URL = process.env.DATABASE_URL ?? '';
const HAS_DB = DB_URL.length > 0;

let failures = 0;
function check(label, condition, detail) {
  console.log(`${condition ? 'PASS' : 'FAIL'} ${label}${detail ? ' :: ' + detail : ''}`);
  if (!condition) failures += 1;
}

const app = createApp();
const server = serve({ fetch: app.fetch, port: APP_PORT });
await new Promise((resolve) => setTimeout(resolve, 300));

try {
  if (!HAS_DB) {
    console.log('SKIP content scenarios (DATABASE_URL not set)');
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

    const run = String(Date.now());
    const past = new Date(Date.now() - 3600_000).toISOString();
    const future = new Date(Date.now() + 3600_000).toISOString();

    const makeBanner = (payload) =>
      fetch(`${APP_BASE}/api/v1/admin/banners`, {
        method: 'POST',
        headers: auth,
        body: JSON.stringify(payload),
      });

    const live1 = await makeBanner({
      title: `Banner Utama ${run}`,
      imageUrl: 'https://cdn.example/banner-1.png',
      linkUrl: 'https://tembus.example/promo',
      placement: 'home_hero',
      sortOrder: 2,
    });
    const live1Body = await live1.json();
    check(
      'POST /api/v1/admin/banners creates a live banner',
      live1.status === 201 && live1Body?.data?.isActive === true,
      `status=${live1.status} id=${live1Body?.data?.id}`
    );

    const live2 = await makeBanner({
      title: `Banner Kedua ${run}`,
      imageUrl: 'https://cdn.example/banner-2.png',
      placement: 'home_hero',
      sortOrder: 1,
    });
    const live2Body = await live2.json();
    check('second live banner created', live2.status === 201, `status=${live2.status}`);

    const expired = await makeBanner({
      title: `Banner Kedaluwarsa ${run}`,
      imageUrl: 'https://cdn.example/banner-expired.png',
      placement: 'home_hero',
      sortOrder: 3,
      endAt: past,
    });
    check('expired banner created', expired.status === 201, `status=${expired.status}`);

    const scheduled = await makeBanner({
      title: `Banner Terjadwal ${run}`,
      imageUrl: 'https://cdn.example/banner-future.png',
      placement: 'home_hero',
      sortOrder: 4,
      startAt: future,
    });
    check('scheduled banner created', scheduled.status === 201, `status=${scheduled.status}`);

    const publicList = await fetch(`${APP_BASE}/api/v1/banners`);
    const publicListBody = await publicList.json();
    const titles = (publicListBody?.data?.banners ?? []).map((row) => row.title);
    check(
      'GET /api/v1/banners returns only live banners in sort order',
      publicList.status === 200 &&
        publicListBody?.data?.count === 2 &&
        titles[0] === `Banner Kedua ${run}` &&
        titles[1] === `Banner Utama ${run}`,
      `status=${publicList.status} titles=${titles.join('|')}`
    );

    const otherPlacement = await fetch(`${APP_BASE}/api/v1/banners?placement=cart`);
    const otherPlacementBody = await otherPlacement.json();
    check(
      'GET /api/v1/banners filters by placement',
      otherPlacement.status === 200 && otherPlacementBody?.data?.count === 0,
      `status=${otherPlacement.status} count=${otherPlacementBody?.data?.count}`
    );

    const deactivate = await fetch(`${APP_BASE}/api/v1/admin/banners/${live1Body.data.id}`, {
      method: 'PATCH',
      headers: auth,
      body: JSON.stringify({ isActive: false }),
    });
    check('PATCH banner can deactivate it', deactivate.status === 200, `status=${deactivate.status}`);

    const afterDeactivate = await fetch(`${APP_BASE}/api/v1/banners`);
    const afterDeactivateBody = await afterDeactivate.json();
    check(
      'deactivated banner disappears from the public list',
      afterDeactivateBody?.data?.count === 1,
      `count=${afterDeactivateBody?.data?.count}`
    );

    const deleteBanner = await fetch(`${APP_BASE}/api/v1/admin/banners/${live2Body.data.id}`, {
      method: 'DELETE',
      headers: auth,
    });
    check('DELETE banner works', deleteBanner.status === 200, `status=${deleteBanner.status}`);

    const draftPage = await fetch(`${APP_BASE}/api/v1/admin/pages`, {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({
        slug: `about-${run}`,
        title: 'Tentang Kami',
        content: 'Tembus adalah layanan pengiriman.',
      }),
    });
    const draftBody = await draftPage.json();
    check(
      'POST /api/v1/admin/pages creates a draft page',
      draftPage.status === 201 && draftBody?.data?.isPublished === false,
      `status=${draftPage.status} slug=${draftBody?.data?.slug}`
    );

    const draftPublic = await fetch(`${APP_BASE}/api/v1/pages/about-${run}`);
    check('draft page is hidden from the public endpoint', draftPublic.status === 404, `status=${draftPublic.status}`);

    const publish = await fetch(`${APP_BASE}/api/v1/admin/pages/about-${run}`, {
      method: 'PATCH',
      headers: auth,
      body: JSON.stringify({ isPublished: true }),
    });
    check('PATCH page publishes it', publish.status === 200, `status=${publish.status}`);

    const publishedPublic = await fetch(`${APP_BASE}/api/v1/pages/about-${run}`);
    const publishedBody = await publishedPublic.json();
    check(
      'published page is served publicly with its content',
      publishedPublic.status === 200 &&
        publishedBody?.data?.slug === `about-${run}` &&
        String(publishedBody?.data?.content).includes('Tembus'),
      `status=${publishedPublic.status} body=${JSON.stringify(publishedBody?.data)?.slice(0, 120)}`
    );

    const pageIndex = await fetch(`${APP_BASE}/api/v1/pages`);
    const pageIndexBody = await pageIndex.json();
    check(
      'GET /api/v1/pages lists published pages only',
      pageIndex.status === 200 &&
        (pageIndexBody?.data?.pages ?? []).some((page) => page.slug === `about-${run}`) &&
        !(pageIndexBody?.data?.pages ?? []).some((page) => page.content !== undefined),
      `status=${pageIndex.status} count=${pageIndexBody?.data?.count}`
    );

    const duplicateSlug = await fetch(`${APP_BASE}/api/v1/admin/pages`, {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({ slug: `about-${run}`, title: 'Duplikat', content: 'x' }),
    });
    check('duplicate page slug is rejected 409', duplicateSlug.status === 409, `status=${duplicateSlug.status}`);

    const badSlug = await fetch(`${APP_BASE}/api/v1/admin/pages`, {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({ slug: 'About Us', title: 'Bad', content: 'x' }),
    });
    check('invalid page slug is rejected 400', badSlug.status === 400, `status=${badSlug.status}`);

    const missingPage = await fetch(`${APP_BASE}/api/v1/pages/tidak-ada-${run}`);
    check('unknown page returns 404', missingPage.status === 404, `status=${missingPage.status}`);

    const customerCreate = await fetch(`${APP_BASE}/api/v1/admin/banners`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer mock-customer-token-x' },
      body: JSON.stringify({ title: 'Nope', imageUrl: 'https://cdn.example/x.png' }),
    });
    check('customer token cannot create banners', customerCreate.status === 403, `status=${customerCreate.status}`);

    const promosOn = await fetch(`${APP_BASE}/api/v1/promos`);
    check('promos endpoint is reachable when the flag is on', promosOn.status === 200, `status=${promosOn.status}`);

    const disablePromos = await fetch(`${APP_BASE}/api/v1/admin/feature-flags`, {
      method: 'PUT',
      headers: auth,
      body: JSON.stringify({ promos: false, reviews: true }),
    });
    check('PUT feature-flags disables promos', disablePromos.status === 200, `status=${disablePromos.status}`);

    const promosBlocked = await fetch(`${APP_BASE}/api/v1/promos`);
    const promosBlockedBody = await promosBlocked.json();
    check(
      'promos endpoint returns 403 FEATURE_DISABLED when the flag is off',
      promosBlocked.status === 403 && promosBlockedBody?.error?.code === 'FEATURE_DISABLED',
      `status=${promosBlocked.status} body=${JSON.stringify(promosBlockedBody)}`
    );

    const featuresOff = await fetch(`${APP_BASE}/api/v1/features`);
    const featuresOffBody = await featuresOff.json();
    check(
      'public features endpoint reflects the disabled flag',
      featuresOff.status === 200 && !featuresOffBody?.data?.enabled?.includes('promos'),
      `enabled=${JSON.stringify(featuresOffBody?.data?.enabled)}`
    );

    const enablePromos = await fetch(`${APP_BASE}/api/v1/admin/feature-flags`, {
      method: 'PUT',
      headers: auth,
      body: JSON.stringify({ promos: true, reviews: true }),
    });
    check('PUT feature-flags re-enables promos', enablePromos.status === 200, `status=${enablePromos.status}`);

    const promosAgain = await fetch(`${APP_BASE}/api/v1/promos`);
    check('promos endpoint works again after re-enabling the flag', promosAgain.status === 200, `status=${promosAgain.status}`);

    const logsRes = await fetch(`${APP_BASE}/api/v1/admin/logs?limit=100`, { headers: auth });
    const logsBody = await logsRes.json();
    const actions = new Set((logsBody?.data?.logs ?? []).map((entry) => entry.action));
    check(
      'audit log records banner and page mutations',
      logsRes.status === 200 &&
        actions.has('banner.create') &&
        actions.has('banner.update') &&
        actions.has('banner.delete') &&
        actions.has('page.create') &&
        actions.has('page.update'),
      `actions=${[...actions].join('|')}`
    );

    await fetch(`${APP_BASE}/api/v1/admin/pages/about-${run}`, { method: 'DELETE', headers: auth });
    const deletedPage = await fetch(`${APP_BASE}/api/v1/pages/about-${run}`);
    check('deleted page is no longer public', deletedPage.status === 404, `status=${deletedPage.status}`);
  }
} finally {
  server.close();
}

console.log(failures === 0 ? 'RESULT: ALL PASS' : `RESULT: ${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
