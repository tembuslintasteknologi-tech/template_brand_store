import { z } from 'zod';
import { db } from '../../db/index.js';
import { pages } from '../../db/schema.js';
import { desc, eq } from 'drizzle-orm';
import { recordAdminAction } from '../admin/auditLog.js';
import { ContentError } from './bannerService.js';

export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const pageSchema = z.object({
  slug: z
    .string()
    .min(2)
    .max(150)
    .refine((value) => SLUG_PATTERN.test(value), 'slug harus huruf kecil, angka, dan tanda hubung'),
  title: z.string().min(1).max(200),
  content: z.string().min(1),
  metaTitle: z.string().max(200).optional(),
  metaDescription: z.string().max(400).optional(),
  isPublished: z.boolean().optional(),
});

export function isPagePublic(page: { isPublished?: boolean | null } | null | undefined): boolean {
  return Boolean(page && page.isPublished === true);
}

export async function getPublicPage(slug: string) {
  const [row] = await db.select().from(pages).where(eq(pages.slug, slug)).limit(1);
  if (!isPagePublic(row)) {
    throw new ContentError(`Halaman tidak ditemukan: ${slug}`, 404);
  }
  return row;
}

export async function listPublicPages() {
  const rows = await db.select().from(pages).where(eq(pages.isPublished, true)).orderBy(desc(pages.updatedAt));
  return rows.map((row) => ({
    slug: row.slug,
    title: row.title,
    updatedAt: row.updatedAt,
  }));
}

export async function listAllPages() {
  return db.select().from(pages).orderBy(desc(pages.updatedAt));
}

export async function createPage(actorId: string, input: unknown) {
  const parsed = pageSchema.safeParse(input);
  if (!parsed.success) {
    throw new ContentError(`Halaman tidak valid: ${parsed.error.issues.map((issue) => issue.message).join('; ')}`);
  }
  const data = parsed.data;

  const [existing] = await db.select().from(pages).where(eq(pages.slug, data.slug)).limit(1);
  if (existing) {
    throw new ContentError(`Slug halaman sudah dipakai: ${data.slug}`, 409);
  }

  const [row] = await db
    .insert(pages)
    .values({
      slug: data.slug,
      title: data.title,
      content: data.content,
      metaTitle: data.metaTitle ?? null,
      metaDescription: data.metaDescription ?? null,
      isPublished: data.isPublished ?? false,
    })
    .returning();

  await recordAdminAction({
    actorId,
    action: 'page.create',
    targetType: 'page',
    targetId: row.id,
    metadata: { slug: row.slug, isPublished: row.isPublished },
  });

  return row;
}

export async function updatePage(actorId: string, slug: string, input: unknown) {
  const parsed = pageSchema.partial().safeParse(input);
  if (!parsed.success) {
    throw new ContentError(`Halaman tidak valid: ${parsed.error.issues.map((issue) => issue.message).join('; ')}`);
  }

  const [existing] = await db.select().from(pages).where(eq(pages.slug, slug)).limit(1);
  if (!existing) {
    throw new ContentError(`Halaman tidak ditemukan: ${slug}`, 404);
  }

  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (parsed.data.slug !== undefined) patch.slug = parsed.data.slug;
  if (parsed.data.title !== undefined) patch.title = parsed.data.title;
  if (parsed.data.content !== undefined) patch.content = parsed.data.content;
  if (parsed.data.metaTitle !== undefined) patch.metaTitle = parsed.data.metaTitle;
  if (parsed.data.metaDescription !== undefined) patch.metaDescription = parsed.data.metaDescription;
  if (parsed.data.isPublished !== undefined) patch.isPublished = parsed.data.isPublished;

  const [row] = await db.update(pages).set(patch as any).where(eq(pages.id, existing.id)).returning();

  await recordAdminAction({
    actorId,
    action: 'page.update',
    targetType: 'page',
    targetId: row.id,
    metadata: { slug: row.slug, changed: Object.keys(patch).filter((key) => key !== 'updatedAt') },
  });

  return row;
}

export async function deletePage(actorId: string, slug: string) {
  const [existing] = await db.select().from(pages).where(eq(pages.slug, slug)).limit(1);
  if (!existing) {
    throw new ContentError(`Halaman tidak ditemukan: ${slug}`, 404);
  }

  await db.delete(pages).where(eq(pages.id, existing.id));
  await recordAdminAction({
    actorId,
    action: 'page.delete',
    targetType: 'page',
    targetId: existing.id,
    metadata: { slug: existing.slug },
  });

  return { slug, deleted: true };
}
