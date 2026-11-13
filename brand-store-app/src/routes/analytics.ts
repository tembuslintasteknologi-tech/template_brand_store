import { Hono } from 'hono';
import { db } from '../db/index.js';
import { orders, orderItems, products, users } from '../db/schema.js';
import { authMiddleware, adminOnlyMiddleware } from '../middleware/auth.js';
import { sql, desc, eq, sum, count } from 'drizzle-orm';
import { branchAnalyticsReport, BranchAnalyticsError } from '../services/admin/branchAnalytics.js';

export const analyticsRoutes = new Hono();

// Apply auth and admin check to all analytics and report routes
analyticsRoutes.use('*', authMiddleware, adminOnlyMiddleware);

// GET /api/admin/dashboard - Real-time KPI Dashboard (ADM-001)
analyticsRoutes.get('/dashboard', async (c) => {
  try {
    // Total revenue & orders count
    const orderStats = await db.select({
      totalRevenue: sum(orders.totalAmount),
      totalOrders: count(orders.id),
    }).from(orders);

    // Total products count
    const productStats = await db.select({
      totalProducts: count(products.id),
    }).from(products);

    // Total customers count
    const customerStats = await db.select({
      totalCustomers: count(users.id),
    }).from(users).where(eq(users.role, 'customer'));

    // Recent orders
    const recentOrders = await db.select().from(orders).orderBy(desc(orders.createdAt)).limit(5);

    return c.json({
      success: true,
      data: {
        kpi: {
          totalRevenue: orderStats[0]?.totalRevenue || '0.00',
          totalOrders: Number(orderStats[0]?.totalOrders || 0),
          totalProducts: Number(productStats[0]?.totalProducts || 0),
          totalCustomers: Number(customerStats[0]?.totalCustomers || 0),
        },
        recentOrders,
      },
    });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500);
  }
});

// GET /api/admin/reports/sales - Sales & Financial Report
analyticsRoutes.get('/reports/sales', async (c) => {
  try {
    const { dateFrom, dateTo } = c.req.query();

    // Query sales grouped or detailed
    const allOrders = await db.select().from(orders).orderBy(desc(orders.createdAt));

    const totalSales = allOrders.reduce((acc, o) => acc + Number(o.totalAmount), 0);
    const totalShipping = allOrders.reduce((acc, o) => acc + Number(o.shippingAmount), 0);
    const totalDiscounts = allOrders.reduce((acc, o) => acc + Number(o.discountAmount), 0);

    return c.json({
      success: true,
      data: {
        reportType: 'sales',
        dateFrom: dateFrom || 'all-time',
        dateTo: dateTo || 'now',
        summary: {
          grossSales: totalSales,
          totalShippingCollected: totalShipping,
          totalDiscountsGiven: totalDiscounts,
          netRevenue: totalSales - totalShipping,
          orderCount: allOrders.length,
        },
        orders: allOrders,
      },
    });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500);
  }
});

// GET /api/admin/reports/products - Top Selling Products
analyticsRoutes.get('/reports/products', async (c) => {
  try {
    const topItems = await db.select({
      productId: orderItems.productId,
      totalSold: sum(orderItems.quantity),
      totalRevenue: sum(orderItems.totalPrice),
    })
    .from(orderItems)
    .groupBy(orderItems.productId)
    .orderBy(desc(sum(orderItems.quantity)))
    .limit(10);

    return c.json({
      success: true,
      data: {
        reportType: 'top_products',
        items: topItems,
      },
    });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500);
  }
});

// GET /api/admin/analytics/branches - Cross-branch analytics for pusat (BR-012)
analyticsRoutes.get('/analytics/branches', async (c) => {
  try {
    const { from, to } = c.req.query();
    const report = await branchAnalyticsReport(from, to);

    return c.json({
      success: true,
      data: {
        reportType: 'branch_analytics',
        ...report,
      },
    });
  } catch (err: any) {
    const status = err instanceof BranchAnalyticsError ? err.status : 500;
    const code = err instanceof BranchAnalyticsError ? err.code : 'ANALYTICS_FAILED';
    return c.json(
      { success: false, error: { code, message: err?.message ?? 'Branch analytics failed' } },
      status as any
    );
  }
});
