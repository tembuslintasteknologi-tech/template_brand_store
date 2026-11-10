import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { unifiedConfig } from './config/unifiedConfig.js';
import { authRoutes } from './routes/auth.js';
import { productRoutes } from './routes/products.js';
import { orderRoutes } from './routes/orders.js';
import { analyticsRoutes } from './routes/analytics.js';
import { promoRoutes } from './routes/promos.js';

const app = new Hono();

// Global Middleware & Security Headers (Zero Trust / Hardening)
app.use('*', cors({
  origin: unifiedConfig.cors.origin,
  allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
}));

app.use('*', async (c, next) => {
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('X-Frame-Options', 'DENY');
  c.header('X-XSS-Protection', '1; mode=block');
  c.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  await next();
});

// Health check
app.get('/health', (c) => c.json({ status: 'healthy', service: 'brand-store-api', timestamp: new Date().toISOString() }));

// API Routes
app.route('/api/auth', authRoutes);
app.route('/api/products', productRoutes);
app.route('/api/orders', orderRoutes);
app.route('/api/admin', analyticsRoutes);
app.route('/api/promos', promoRoutes);

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
