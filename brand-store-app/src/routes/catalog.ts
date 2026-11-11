import { Hono } from 'hono';
import { z } from 'zod';
import { db } from '../db/index.js';
import { products } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { authMiddleware, adminOnlyMiddleware } from '../middleware/auth.js';
import {
  BulkError,
  buildProductImportTemplate,
  exportProducts,
  importProducts,
} from '../services/catalog/bulkService.js';
import { SeoError, getPageSeo, getProductSeo, saveProductSeo, seoAudit } from '../services/catalog/seoService.js';
import { notifyBackInStock, notifyPriceDrop } from '../services/wishlist/wishlistService.js';
import type { ExportFormat } from '../services/admin/reports.js';

export const catalogPublicRoutes = new Hono();

// GET /api/v1/products/:slug/seo - meta tags + JSON-LD for a published product (CAT-010)
catalogPublicRoutes.get('/products/:slug/seo', async (c) => {
  try {
    return c.json({ success: true, data: await getProductSeo(c.req.param('slug') as string) });
  } catch (err: any) {
    const status = err instanceof SeoError ? err.status : 500;
    return c.json({ success: false, error: err?.message ?? 'failed' }, status as any);
  }
});

// GET /api/v1/pages/:slug/seo - meta tags + JSON-LD for a published page (PGE-004)
catalogPublicRoutes.get('/pages/:slug/seo', async (c) => {
  try {
    return c.json({ success: true, data: await getPageSeo(c.req.param('slug') as string) });
  } catch (err: any) {
    const status = err instanceof SeoError ? err.status : 500;
    return c.json({ success: false, error: err?.message ?? 'failed' }, status as any);
  }
});

export const catalogAdminRoutes = new Hono();
catalogAdminRoutes.use('*', authMiddleware, adminOnlyMiddleware);

function fail(c: any, err: any) {
  const status =
    err instanceof BulkError || err instanceof SeoError
      ? err.status
      : err?.name === 'ZodError'
        ? 400
        : 500;
  return c.json({ success: false, error: err?.message ?? 'failed' }, status as any);
}

function actorId(c: any): string {
  return (c.get('user') as { id: string }).id;
}

function parseFormat(value: string | undefined): ExportFormat {
  return value === 'json' ? 'json' : 'csv';
}

// GET /api/v1/admin/products/export?format=csv|json - bulk export (CAT-011)
catalogAdminRoutes.get('/products/export', async (c) => {
  try {
    const result = await exportProducts(parseFormat(c.req.query('format')));
    c.header('Content-Type', result.contentType);
    c.header('Content-Disposition', `attachment; filename="${result.filename}"`);
    return c.body(result.body);
  } catch (err: any) {
    return fail(c, err);
  }
});

// GET /api/v1/admin/products/import-template - downloadable CSV template
catalogAdminRoutes.get('/products/import-template', async (c) => {
  c.header('Content-Type', 'text/csv; charset=utf-8');
  c.header('Content-Disposition', 'attachment; filename="product-import-template.csv"');
  return c.body('\uFEFF' + buildProductImportTemplate());
});

// POST /api/v1/admin/products/import - bulk create/update by slug (CAT-011)
catalogAdminRoutes.post('/products/import', async (c) => {
  try {
    const contentType = c.req.header('content-type') ?? '';
    let csv = '';

    if (contentType.includes('application/json')) {
      const body = await c.req.json().catch(() => ({}));
      csv = String(body?.csv ?? '');
    } else {
      csv = await c.req.text();
    }

    if (!csv.trim()) {
      return c.json({ success: false, error: 'Body CSV kosong' }, 400);
    }

    const result = await importProducts(actorId(c), csv);
    return c.json({ success: true, data: result });
  } catch (err: any) {
    return fail(c, err);
  }
});

// GET /api/v1/admin/products/seo-audit - products missing meta fields (CAT-010)
catalogAdminRoutes.get('/products/seo-audit', async (c) => {
  try {
    return c.json({ success: true, data: await seoAudit() });
  } catch (err: any) {
    return fail(c, err);
  }
});

// PUT /api/v1/admin/products/:id/seo - write product meta tags (CAT-010)
catalogAdminRoutes.put('/products/:id/seo', async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const data = await saveProductSeo(actorId(c), c.req.param('id') as string, body);
    return c.json({ success: true, data });
  } catch (err: any) {
    return fail(c, err);
  }
});

const priceUpdateSchema = z.object({
  basePrice: z.number().positive(),
  stock: z.number().int().nonnegative().optional(),
});

// PATCH /api/v1/admin/products/:id/price - update price/stock and fan out wishlist alerts
catalogAdminRoutes.patch('/products/:id/price', async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const parsed = priceUpdateSchema.parse(body);
    const productId = c.req.param('id') as string;

    const [existing] = await db
      .select({ id: products.id, basePrice: products.basePrice, stock: products.stock })
      .from(products)
      .where(eq(products.id, productId as any))
      .limit(1);
    if (!existing) {
      return c.json({ success: false, error: 'Produk tidak ditemukan' }, 404);
    }

    const [updated] = await db
      .update(products)
      .set({
        basePrice: String(parsed.basePrice),
        ...(parsed.stock !== undefined ? { stock: parsed.stock } : {}),
        updatedAt: new Date(),
      })
      .where(eq(products.id, productId as any))
      .returning();

    const previousPrice = Number(existing.basePrice);
    const previousStock = Number(existing.stock);
    const currentStock = parsed.stock ?? previousStock;

    const priceDrop =
      parsed.basePrice < previousPrice
        ? await notifyPriceDrop(productId, previousPrice, parsed.basePrice).catch(() => ({ notified: 0 }))
        : { notified: 0 };

    const backInStock =
      parsed.stock !== undefined && currentStock > previousStock && previousStock <= 0
        ? await notifyBackInStock(productId, previousStock, currentStock).catch(() => ({ notified: 0 }))
        : { notified: 0 };

    return c.json({
      success: true,
      data: {
        product: updated,
        alerts: { priceDropNotified: priceDrop.notified, backInStockNotified: backInStock.notified },
      },
    });
  } catch (err: any) {
    return fail(c, err);
  }
});
