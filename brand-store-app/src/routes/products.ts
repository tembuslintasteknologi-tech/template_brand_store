import { Hono } from 'hono';
import { db } from '../db/index.js';
import { products, categories } from '../db/schema.js';
import { eq, ilike, and, desc } from 'drizzle-orm';
import { productSchema } from '../validators/schemas.js';
import { authMiddleware, adminOnlyMiddleware } from '../middleware/auth.js';

export const productRoutes = new Hono();

// Public: List products with search & category filter
productRoutes.get('/', async (c) => {
  try {
    const search = c.req.query('search');
    const categoryId = c.req.query('categoryId');

    let query = db.select().from(products);
    
    const conditions = [eq(products.status, 'published')];
    if (search) {
      conditions.push(ilike(products.title, `%${search}%`));
    }
    if (categoryId) {
      conditions.push(eq(products.categoryId, categoryId));
    }

    const items = await db.select().from(products).where(and(...conditions)).orderBy(desc(products.createdAt));

    return c.json({ success: true, data: items });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500);
  }
});

// Public: Get product detail by slug
productRoutes.get('/:slug', async (c) => {
  try {
    const slug = c.req.param('slug');
    const [product] = await db.select().from(products).where(eq(products.slug, slug)).limit(1);

    if (!product) {
      return c.json({ success: false, error: 'Product not found' }, 404);
    }

    return c.json({ success: true, data: product });
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
