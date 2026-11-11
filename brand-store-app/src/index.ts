import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { unifiedConfig } from './config/unifiedConfig.js';
import { authRoutes } from './routes/auth.js';
import { productRoutes } from './routes/products.js';
import { orderRoutes } from './routes/orders.js';
import { analyticsRoutes } from './routes/analytics.js';
import { promoRoutes } from './routes/promos.js';
import { paymentRoutes } from './routes/payments.js';
import { notificationRoutes, notificationAdminRoutes } from './routes/notifications.js';
import { realtimeRoutes } from './routes/realtime.js';
import { securityHeadersMiddleware } from './middleware/security.js';

const app = new Hono();

// Global Middleware & Security Headers (Zero Trust / Hardening)
app.use('*', cors({
  origin: unifiedConfig.cors.origin,
  allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
}));

app.use('*', securityHeadersMiddleware());

// Health check
app.get('/health', (c) => c.json({ status: 'healthy', service: 'brand-store-api', timestamp: new Date().toISOString() }));

// API Routes
app.route('/api/auth', authRoutes);
app.route('/api/products', productRoutes);
app.route('/api/orders', orderRoutes);
app.route('/api/admin', analyticsRoutes);
app.route('/api/promos', promoRoutes);
app.route('/api/payments', paymentRoutes);
app.route('/api/notifications', notificationRoutes);
app.route('/api/admin', notificationAdminRoutes);
app.route('/api/realtime', realtimeRoutes);

// 404 handler
app.notFound((c) => c.json({ success: false, error: 'Endpoint not found' }, 404));

// Error handler
app.onError((err, c) => {
  console.error('Unhandled error:', err);
  return c.json({ success: false, error: 'Internal Server Error' }, 500);
});

export default {
  port: unifiedConfig.port,
  fetch: app.fetch,
};

console.log(`🚀 Brand Store API server running on port ${unifiedConfig.port}`);

