const BASE = process.env.API_BASE || 'http://127.0.0.1:3100';
const results = [];
let failures = 0;

let ipCounter = 0;
async function call(method, path, body, token, ip) {
  const headers = { 'x-forwarded-for': ip || `10.0.0.${(ipCounter % 200) + 10}` };
  ipCounter += 1;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  return { status: res.status, body: json };
}

function check(name, condition, detail) {
  if (condition) {
    results.push(`PASS ${name}`);
  } else {
    failures += 1;
    results.push(`FAIL ${name} :: ${JSON.stringify(detail)}`);
  }
}

const stamp = Date.now();
const customerEmail = `buyer${stamp}@example.com`;
const password = 'Customer12345!';

// 1. health
const health = await call('GET', '/health');
check('GET /health returns 200 and reports database up', health.status === 200 && health.body?.data?.checks?.database === 'up', health.body);

// 2. register
const register = await call('POST', '/api/v1/auth/register', { email: customerEmail, password, fullName: 'Buyer Satu' });
check('POST /api/v1/auth/register creates a customer', register.status === 201 && register.body?.data?.role === 'customer', register.body);

// 3. duplicate register
const dup = await call('POST', '/api/v1/auth/register', { email: customerEmail, password, fullName: 'Buyer Satu' });
check('duplicate register is rejected with 409', dup.status === 409, dup.body);

// 4. login customer
const login = await call('POST', '/api/v1/auth/login', { email: customerEmail, password });
const customerToken = login.body?.data?.token;
check('POST /api/v1/auth/login returns access + refresh token', login.status === 200 && !!customerToken && !!login.body?.data?.refreshToken, login.body);
check('access token lifetime is 900s', login.body?.data?.expiresIn === 900, login.body?.data?.expiresIn);
check('refresh token lifetime is 604800s', login.body?.data?.refreshExpiresIn === 604800, login.body?.data?.refreshExpiresIn);

// 5. login admin
const adminLogin = await call('POST', '/api/v1/auth/login', { email: 'admin@brandstore.com', password: 'Admin12345!' });
const adminToken = adminLogin.body?.data?.token;
check('seeded admin can log in', adminLogin.status === 200 && adminLogin.body?.data?.user?.role === 'admin', adminLogin.body);

// 6. protected route with customer token
const me = await call('GET', '/api/v1/auth/me', undefined, customerToken);
check('GET /api/v1/auth/me returns the caller profile', me.status === 200 && me.body?.data?.email === customerEmail, me.body);

// 7. customer blocked from admin group
const forbidden = await call('GET', '/api/v1/admin/dashboard', undefined, customerToken);
check('customer token gets 403 on /api/v1/admin/dashboard', forbidden.status === 403, forbidden.body);

// 8. admin creates product
const product = await call(
  'POST',
  '/api/v1/products',
  { title: 'Kaos Premium', slug: `kaos-premium-${stamp}`, description: 'Kaos katun', basePrice: 150000, stock: 25, status: 'published' },
  adminToken,
);
check('admin can create a product', product.status === 201 && product.body?.data?.id, product.body);
const productId = product.body?.data?.id;

// 9. customer cannot create product
const productDenied = await call('POST', '/api/v1/products', { title: 'Nope', slug: `nope-${stamp}`, basePrice: 1000, stock: 1 }, customerToken);
check('customer cannot create a product (403)', productDenied.status === 403, productDenied.body);

// 10. public listing with pagination
const list = await call('GET', '/api/v1/products?page=1&limit=10&sort=price:asc');
check(
  'GET /api/v1/products returns paginated published items',
  list.status === 200 && Array.isArray(list.body?.data?.items) && list.body?.data?.pagination?.total >= 1,
  list.body,
);

// 11. invalid pagination
const badPage = await call('GET', '/api/v1/products?page=0');
check('invalid pagination is rejected with 400', badPage.status === 400, badPage.body);

// 12. product detail by slug
const detail = await call('GET', `/api/v1/products/kaos-premium-${stamp}`);
check('GET /api/v1/products/:slug returns the product', detail.status === 200 && detail.body?.data?.slug === `kaos-premium-${stamp}`, detail.body);

// 13. admin creates promo
const promoCode = `HEMAT${stamp}`;
const promo = await call(
  'POST',
  '/api/v1/promos',
  {
    code: promoCode,
    discountType: 'percentage',
    discountValue: 10,
    minOrderAmount: 100000,
    maxDiscount: 50000,
    usageLimit: 100,
    startDate: new Date(Date.now() - 86400000).toISOString(),
    endDate: new Date(Date.now() + 7 * 86400000).toISOString(),
  },
  adminToken,
);
check('admin can create a promo', promo.status === 201 && promo.body?.data?.code === promoCode, promo.body);

// 14. promo validation math
const validate = await call('POST', '/api/v1/promos/validate', { subtotal: 300000, codes: [promoCode], shippingAmount: 18000 });
check(
  'promo validation applies 10% capped at 50000 and adds tax',
  validate.status === 200 &&
    validate.body?.data?.discountTotal === 30000 &&
    validate.body?.data?.taxAmount === 29700 &&
    validate.body?.data?.grandTotal === 317700,
  validate.body,
);

// 15. order creation
const order = await call(
  'POST',
  '/api/v1/orders',
  {
    items: [{ productId, quantity: 2 }],
    shippingAddress: { recipientName: 'Buyer Satu', phone: '0812', addressLine: 'Jl. Mawar 1', city: 'Bandung', province: 'Jawa Barat', postalCode: '40111' },
  },
  customerToken,
);
check('customer can create an order', order.status === 201 && /^INV\/\d{4}\/\d{2}\/\d{6}$/.test(order.body?.data?.orderNumber || ''), order.body);
const orderId = order.body?.data?.id;

// 16. order visibility
const myOrders = await call('GET', '/api/v1/orders/my-orders', undefined, customerToken);
check('customer sees the order in my-orders', myOrders.status === 200 && myOrders.body?.data?.items?.length === 1, myOrders.body);

// 17. valid transition pending -> paid
const paid = await call('PATCH', `/api/v1/orders/admin/${orderId}/status`, { status: 'paid' }, adminToken);
check('admin can move order pending -> paid', paid.status === 200 && paid.body?.data?.status === 'paid', paid.body);

// 18. invalid transition paid -> shipped
const skip = await call('PATCH', `/api/v1/orders/admin/${orderId}/status`, { status: 'shipped' }, adminToken);
check('state machine rejects paid -> shipped', skip.status === 400 && skip.body?.error?.details?.reason === 'INVALID_TRANSITION', skip.body);

// 19. valid transition paid -> processing -> shipped
const processing = await call('PATCH', `/api/v1/orders/admin/${orderId}/status`, { status: 'processing' }, adminToken);
const shipped = await call('PATCH', `/api/v1/orders/admin/${orderId}/status`, { status: 'shipped' }, adminToken);
check('admin can advance order to shipped', processing.status === 200 && shipped.status === 200 && shipped.body?.data?.status === 'shipped', shipped.body);

// 20. dashboard
const dashboard = await call('GET', '/api/v1/admin/dashboard', undefined, adminToken);
check(
  'GET /api/v1/admin/dashboard returns KPI',
  dashboard.status === 200 && dashboard.body?.data?.kpi?.totalOrders >= 1 && dashboard.body?.data?.kpi?.totalProducts >= 1,
  dashboard.body,
);

// 21. sales report with date range
const today = new Date().toISOString().slice(0, 10);
const report = await call('GET', `/api/v1/admin/reports/sales?dateFrom=${today}&dateTo=${today}`, undefined, adminToken);
check('sales report honours date range', report.status === 200 && report.body?.data?.summary?.orderCount >= 1, report.body);

// 22. invalid date range
const badRange = await call('GET', '/api/v1/admin/reports/sales?dateFrom=2026-12-01&dateTo=2026-11-01', undefined, adminToken);
check('sales report rejects inverted dates', badRange.status === 400, badRange.body);

// 23. refresh rotation
const refreshed = await call('POST', '/api/v1/auth/refresh', { refreshToken: login.body?.data?.refreshToken });
const newAccess = refreshed.body?.data?.token;
check('refresh returns a new token pair', refreshed.status === 200 && !!newAccess && newAccess !== customerToken, refreshed.body);

const reuseOld = await call('POST', '/api/v1/auth/refresh', { refreshToken: login.body?.data?.refreshToken });
check('reusing a rotated refresh token is rejected', reuseOld.status === 401, reuseOld.body);

// 24. new access token works
const meAgain = await call('GET', '/api/v1/auth/me', undefined, newAccess);
check('rotated access token authenticates', meAgain.status === 200, meAgain.body);

// 25. logout revokes
await call('POST', '/api/v1/auth/logout', { refreshToken: refreshed.body?.data?.refreshToken }, newAccess);
const afterLogout = await call('GET', '/api/v1/auth/me', undefined, newAccess);
check('logout revokes the access token', afterLogout.status === 401, afterLogout.body);

// 26. brute force lock
const lockEmail = `lock${stamp}@example.com`;
await call('POST', '/api/v1/auth/register', { email: lockEmail, password, fullName: 'Lock Target' });
for (let i = 0; i < 5; i += 1) {
  await call('POST', '/api/v1/auth/login', { email: lockEmail, password: 'wrong-password' });
}
const locked = await call('POST', '/api/v1/auth/login', { email: lockEmail, password });
check('account locks after 5 failed logins (423)', locked.status === 423, locked.body);

console.log(results.join('\n'));
console.log(`\nsummary: ${results.length - failures}/${results.length} checks passed`);
process.exit(failures === 0 ? 0 : 1);
