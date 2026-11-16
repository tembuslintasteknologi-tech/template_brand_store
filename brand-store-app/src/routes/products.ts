import { Hono } from 'hono';
import { db } from '../db/index.js';
import { products, categories } from '../db/schema.js';
import { eq, ilike, and, desc, lt, or } from 'drizzle-orm';
import { productSchema } from '../validators/schemas.js';
import { authMiddleware, adminOnlyMiddleware } from '../middleware/auth.js';
import {
  ProductNotFoundError,
  listProductBranchAvailability,
} from '../services/branch/branchAvailabilityService.js';
import { getShowAggregatorWithinRadius } from '../services/config/settings.js';
import {
  PaginationError,
  buildCursorPage,
  clampPageSize,
  decodeCursor,
  parseFields,
  projectRow,
} from '../utils/pagination.js';

export const productRoutes = new Hono();

// Public: List products with search, category filter, cursor pagination and field projection.
// Mobile clients pass `limit` small and follow `page.nextCursor` instead of offset walking.
productRoutes.get('/', async (c) => {
  try {
    const search = c.req.query('search');
    const categoryId = c.req.query('categoryId');
    const limit = clampPageSize(c.req.query('limit'));
    const fields = parseFields(c.req.query('fields'));
    const cursor = decodeCursor(c.req.query('cursor'));

    const conditions: any[] = [eq(products.status, 'published')];
    if (search) {
      conditions.push(ilike(products.title, `%${search}%`));
    }
    if (categoryId) {
      conditions.push(eq(products.categoryId, categoryId));
    }
    if (cursor) {
      const at = new Date(cursor.createdAt);
      conditions.push(
        or(
          lt(products.createdAt, at),
          and(eq(products.createdAt, at), lt(products.id, cursor.id as any))
        )
      );
    }

    const rows = await db
      .select()
      .from(products)
      .where(and(...conditions))
      .orderBy(desc(products.createdAt), desc(products.id))
      .limit(limit + 1);

    const page = buildCursorPage(rows as any[], limit, { fields });

    c.header('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
    c.header('Vary', 'Accept-Encoding');
    return c.json({
      success: true,
      data: page.items,
      page: { nextCursor: page.nextCursor, hasMore: page.hasMore, limit: page.limit },
    });
  } catch (err: any) {
    if (err instanceof PaginationError) {
      return c.json({ success: false, error: { code: err.code, message: err.message } }, 400);
    }
    return c.json({ success: false, error: err.message }, 500);
  }
});

// Public: which branches can ship this product right now (BR-007)
productRoutes.get('/:slug/branches', async (c) => {
  try {
    const slug = c.req.param('slug') as string;
    const result = await listProductBranchAvailability(slug, {
      latitude: c.req.query('lat'),
      longitude: c.req.query('lng'),
      showAggregatorWithinRadius: await getShowAggregatorWithinRadius(),
    });

    c.header('Cache-Control', 'no-store');
    return c.json({ success: true, data: result });
  } catch (err: any) {
    if (err instanceof ProductNotFoundError) {
      return c.json({ success: false, error: 'Product not found' }, 404);
    }
    return c.json({ success: false, error: err.message }, 500);
  }
});

// Public: Get product detail by slug. `fields` narrows the payload for mobile list to detail taps.
productRoutes.get('/:slug', async (c) => {
  try {
    const slug = c.req.param('slug');
    const [product] = await db.select().from(products).where(eq(products.slug, slug)).limit(1);

    if (!product) {
      return c.json({ success: false, error: 'Product not found' }, 404);
    }

    const fields = parseFields(c.req.query('fields'));
    c.header('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
    c.header('Vary', 'Accept-Encoding');
    return c.json({ success: true, data: projectRow(product as unknown as Record<string, unknown>, fields) });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500);
  }
});

// Admin: Create product
productRoutes.post('/', authMiddleware, adminOnlyMiddleware, async (c) => {
  try {
    const body = await c.req.json();
    const parsed = productSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ success: false, error: parsed.error.format() }, 400);
    }

    const user = c.get('user') as { id: string; role: string; email: string };
    const data = parsed.data;

    const [newProduct] = await db.insert(products).values({
      ...data,
      basePrice: data.basePrice.toString(),
      compareAtPrice: data.compareAtPrice ? data.compareAtPrice.toString() : null,
      createdBy: user.id,
    }).returning();

    return c.json({ success: true, data: newProduct }, 201);
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500);
  }
});

// Admin: Update product
productRoutes.put('/:id', authMiddleware, adminOnlyMiddleware, async (c) => {
  try {
    const id = c.req.param('id');
    const body = await c.req.json();

    const [updated] = await db.update(products).set({
      ...body,
      updatedAt: new Date(),
    }).where(eq(products.id, id as any)).returning();

    if (!updated) {
      return c.json({ success: false, error: 'Product not found' }, 404);
    }

    return c.json({ success: true, data: updated });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500);
  }
});

// Admin: Delete product
productRoutes.delete('/:id', authMiddleware, adminOnlyMiddleware, async (c) => {
  try {
    const id = c.req.param('id');
    const [deleted] = await db.delete(products).where(eq(products.id, id as any)).returning();

    if (!deleted) {
      return c.json({ success: false, error: 'Product not found' }, 404);
    }

    return c.json({ success: true, data: { message: 'Product deleted successfully' } });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500);
  }
});
