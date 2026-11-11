import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { connect } from 'node:net';
import { unifiedConfig } from './config/unifiedConfig.js';
import {
  correlationIdMiddleware,
  securityHeadersMiddleware,
  rateLimiter,
} from './middleware/security.js';
import { requestLogger } from './middleware/logging.js';
import { maintenanceMiddleware } from './middleware/maintenance.js';
import { authRoutes } from './routes/auth.js';
import { productRoutes } from './routes/products.js';
import { orderRoutes } from './routes/orders.js';
import { analyticsRoutes } from './routes/analytics.js';
import { adminRoutes } from './routes/admin.js';
import { configAdminRoutes, configPublicRoutes } from './routes/config.js';
import { contentAdminRoutes, contentPublicRoutes } from './routes/content.js';
import { notificationRoutes, notificationAdminRoutes } from './routes/notifications.js';
import { promoRoutes } from './routes/promos.js';
import { checkoutRoutes } from './routes/checkout.js';
import { paymentRoutes } from './routes/payments.js';
import { logisticsRoutes, logisticsWebhookRoutes } from './routes/logistics.js';
import { reviewAdminRoutes, reviewPublicRoutes } from './routes/reviews.js';
import { wishlistRoutes } from './routes/wishlist.js';
import { catalogAdminRoutes, catalogPublicRoutes } from './routes/catalog.js';
import { financeAdminRoutes } from './routes/finance.js';
import { pingDatabase } from './db/index.js';
import { redisPing } from './config/redis.js';

export function checkTcp(host: string, port: number, timeoutMs = 500): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connect({ host, port });
    const done = (result: boolean) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(result);
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => done(true));
    socket.once('timeout', () => done(false));
    socket.once('error', () => done(false));
  });
}

export interface HealthReport {
  status: 'ok' | 'degraded';
  service: string;
  version: string;
  uptimeSeconds: number;
  checks: {
    database: 'up' | 'down';
    redis: 'up' | 'down';
    storage: 'up' | 'down';
  };
}

export async function buildHealthReport(): Promise<HealthReport> {
  const [database, redis, storage] = await Promise.all([
    pingDatabase(),
    redisPing(),
    checkTcp(unifiedConfig.storage.endpoint, unifiedConfig.storage.port),
  ]);

  const checks = {
    database: database ? ('up' as const) : ('down' as const),
    redis: redis ? ('up' as const) : ('down' as const),
    storage: storage ? ('up' as const) : ('down' as const),
  };

  const allUp = database && redis && storage;
  return {
    status: allUp ? 'ok' : 'degraded',
    service: 'brand-store-api',
    version: '2.0.0',
    uptimeSeconds: Math.round(process.uptime()),
    checks,
  };
}

export function createApp() {
  const app = new Hono();

  app.use('*', correlationIdMiddleware());
  app.use('*', maintenanceMiddleware());
  app.use('*', securityHeadersMiddleware());
  app.use(
    '*',
    cors({
      origin: unifiedConfig.cors.origin,
      allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowHeaders: ['Content-Type', 'Authorization', 'x-correlation-id'],
      exposeHeaders: ['x-correlation-id', 'X-RateLimit-Limit', 'X-RateLimit-Remaining'],
    })
  );
  app.use('*', requestLogger());

  app.get('/health', async (c) => {
    const report = await buildHealthReport();
    c.header('Cache-Control', 'no-store');
    return c.json({ success: true, data: report }, 200);
  });

  app.use('/api/v1/*', rateLimiter('api'));
  app.use('/api/v1/auth/login', rateLimiter('auth'));
  app.use('/api/v1/auth/register', rateLimiter('auth'));
  app.use('/api/v1/auth/refresh', rateLimiter('auth'));

  const api = new Hono();
  api.route('/auth', authRoutes);
  api.route('/products', productRoutes);
  api.route('/orders', orderRoutes);
  api.route('/promos', promoRoutes);
  api.route('/checkout', checkoutRoutes);
  api.route('/payments', paymentRoutes);
  api.route('/logistics', logisticsRoutes);
  api.route('/admin', analyticsRoutes);
  api.route('/admin', adminRoutes);
  api.route('/admin', configAdminRoutes);
  api.route('/', configPublicRoutes);
  api.route('/', contentPublicRoutes);
  api.route('/admin', contentAdminRoutes);
  api.route('/notifications', notificationRoutes);
  api.route('/admin', notificationAdminRoutes);
  api.route('/wishlist', wishlistRoutes);
  api.route('/', reviewPublicRoutes);
  api.route('/admin', reviewAdminRoutes);
  api.route('/', catalogPublicRoutes);
  api.route('/admin', catalogAdminRoutes);
  api.route('/admin', financeAdminRoutes);

  app.route('/api/v1', api);
  app.route('/webhooks/logistics', logisticsWebhookRoutes);

  app.notFound((c) =>
    c.json(
      {
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: `No route matches ${c.req.method} ${c.req.path}`,
          requestId: c.get('requestId') ?? null,
        },
      },
      404
    )
  );

  app.onError((err, c) => {
    const requestId = c.get('requestId') ?? null;
    console.error('[error]', { requestId, path: c.req.path, message: err.message });
    return c.json(
      {
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Internal Server Error', requestId },
      },
      500
    );
  });

  return app;
}

export const app = createApp();
