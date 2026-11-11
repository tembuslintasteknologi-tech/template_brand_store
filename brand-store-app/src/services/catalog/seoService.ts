import { z } from 'zod';
import { db } from '../../db/index.js';
import { pages, products } from '../../db/schema.js';
import { eq } from 'drizzle-orm';
import { recordAdminAction } from '../admin/auditLog.js';

export class SeoError extends Error {
  readonly status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = 'SeoError';
    this.status = status;
  }
}

export const META_TITLE_MAX = 60;
export const META_DESCRIPTION_MAX = 160;

export const seoSchema = z.object({
  metaTitle: z.string().max(200).optional(),
  metaDescription: z.string().max(400).optional(),
  canonicalPath: z.string().max(300).optional(),
});

export function slugify(input: string): string {
  return String(input ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 150);
}

export function clampText(input: string | null | undefined, max: number): string {
  const raw = String(input ?? '').replace(/\s+/g, ' ').trim();
  if (raw.length <= max) return raw;
  const cut = raw.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(' ');
  const safe = lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut;
  return `${safe}…`;
}

export function stripHtml(input: string | null | undefined): string {
  return String(input ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

export interface SeoProductInput {
  title: string;
  slug: string;
  description?: string | null;
  metaTitle?: string | null;
  metaDescription?: string | null;
  basePrice: string | number;
  images?: unknown;
}

export interface SeoOutput {
  metaTitle: string;
  metaDescription: string;
  canonicalPath: string;
  canonicalUrl: string;
  jsonLd: Record<string, unknown>;
  warnings: string[];
}

const DEFAULT_SITE = {
  siteUrl: 'https://tembus.id',
  siteName: 'TEMBUS',
};

function firstImage(images: unknown): string | undefined {
  if (!Array.isArray(images)) return undefined;
  const found = images.find((value) => typeof value === 'string' && value.length > 0);
  return found ? String(found) : undefined;
}

export function buildProductSeo(
  product: SeoProductInput,
  options: { siteUrl?: string; siteName?: string } = {}
): SeoOutput {
  const siteUrl = (options.siteUrl ?? DEFAULT_SITE.siteUrl).replace(/\/+$/, '');
  const siteName = options.siteName ?? DEFAULT_SITE.siteName;

  const fallbackDescription = stripHtml(product.description).slice(0, META_DESCRIPTION_MAX);
  const metaTitle = clampText(product.metaTitle || `${product.title} | ${siteName}`, META_TITLE_MAX);
  const metaDescription = clampText(
    product.metaDescription || fallbackDescription || `Beli ${product.title} di ${siteName}.`,
    META_DESCRIPTION_MAX
  );
  const canonicalPath = `/products/${product.slug}`;

  const jsonLd: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.title,
    description: metaDescription,
    sku: product.slug,
    offers: {
      '@type': 'Offer',
      price: Number(product.basePrice ?? 0),
      priceCurrency: 'IDR',
      availability: 'https://schema.org/InStock',
      url: `${siteUrl}${canonicalPath}`,
    },
  };
  const image = firstImage(product.images);
  if (image) jsonLd.image = [image];

  return {
    metaTitle,
    metaDescription,
    canonicalPath,
    canonicalUrl: `${siteUrl}${canonicalPath}`,
    jsonLd,
    warnings: seoWarnings({ metaTitle, metaDescription, hasImage: Boolean(image) }),
  };
}

export function buildPageSeo(
  page: { title: string; slug: string; metaTitle?: string | null; metaDescription?: string | null; content?: string | null },
  options: { siteUrl?: string; siteName?: string } = {}
): SeoOutput {
  const siteUrl = (options.siteUrl ?? DEFAULT_SITE.siteUrl).replace(/\/+$/, '');
  const siteName = options.siteName ?? DEFAULT_SITE.siteName;

  const fallbackDescription = stripHtml(page.content).slice(0, META_DESCRIPTION_MAX);
  const metaTitle = clampText(page.metaTitle || `${page.title} | ${siteName}`, META_TITLE_MAX);
  const metaDescription = clampText(
    page.metaDescription || fallbackDescription || `${page.title} di ${siteName}.`,
    META_DESCRIPTION_MAX
  );
  const canonicalPath = `/pages/${page.slug}`;

  return {
    metaTitle,
    metaDescription,
    canonicalPath,
    canonicalUrl: `${siteUrl}${canonicalPath}`,
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'WebPage',
      name: page.title,
      description: metaDescription,
      url: `${siteUrl}${canonicalPath}`,
    },
    warnings: seoWarnings({ metaTitle, metaDescription, hasImage: false }),
  };
}

export function seoWarnings(input: { metaTitle: string; metaDescription: string; hasImage: boolean }): string[] {
  const warnings: string[] = [];
  if (input.metaTitle.length === 0) warnings.push('metaTitle kosong');
  if (input.metaTitle.length >= META_TITLE_MAX) warnings.push(`metaTitle mendekati batas ${META_TITLE_MAX} karakter`);
  if (input.metaDescription.length === 0) warnings.push('metaDescription kosong');
  if (input.metaDescription.length >= META_DESCRIPTION_MAX) {
    warnings.push(`metaDescription mendekati batas ${META_DESCRIPTION_MAX} karakter`);
  }
  if (!input.hasImage) warnings.push('belum ada gambar produk untuk rich result');
  return warnings;
}

export async function saveProductSeo(actorId: string, productId: string, input: unknown) {
  const parsed = seoSchema.parse(input);

  const [existing] = await db
    .select({ id: products.id })
    .from(products)
    .where(eq(products.id, productId as any))
    .limit(1);
  if (!existing) throw new SeoError('Produk tidak ditemukan', 404);

  const [row] = await db
    .update(products)
    .set({
      metaTitle: parsed.metaTitle ?? null,
      metaDescription: parsed.metaDescription ?? null,
      updatedAt: new Date(),
    })
    .where(eq(products.id, productId as any))
    .returning({
      id: products.id,
      title: products.title,
      slug: products.slug,
      description: products.description,
      metaTitle: products.metaTitle,
      metaDescription: products.metaDescription,
      basePrice: products.basePrice,
      images: products.images,
    });

  await recordAdminAction({
    actorId,
    action: 'product.seo.update',
    targetType: 'product',
    targetId: productId,
    metadata: { canonicalPath: parsed.canonicalPath ?? null },
  });

  return buildProductSeo(row);
}

export async function getProductSeo(slug: string) {
  const [row] = await db
    .select({
      id: products.id,
      title: products.title,
      slug: products.slug,
      description: products.description,
      metaTitle: products.metaTitle,
      metaDescription: products.metaDescription,
      basePrice: products.basePrice,
      images: products.images,
      status: products.status,
    })
    .from(products)
    .where(eq(products.slug, slug as any))
    .limit(1);

  if (!row || row.status !== 'published') throw new SeoError('Produk tidak ditemukan', 404);
  return buildProductSeo(row);
}

export async function getPageSeo(slug: string) {
  const [row] = await db
    .select({
      title: pages.title,
      slug: pages.slug,
      content: pages.content,
      metaTitle: pages.metaTitle,
      metaDescription: pages.metaDescription,
      isPublished: pages.isPublished,
    })
    .from(pages)
    .where(eq(pages.slug, slug as any))
    .limit(1);

  if (!row || row.isPublished !== true) throw new SeoError('Halaman tidak ditemukan', 404);
  return buildPageSeo(row);
}

export async function seoAudit() {
  const rows = await db
    .select({
      id: products.id,
      slug: products.slug,
      title: products.title,
      metaTitle: products.metaTitle,
      metaDescription: products.metaDescription,
      images: products.images,
    })
    .from(products);

  const missingMetaTitle = rows.filter((row) => !row.metaTitle);
  const missingMetaDescription = rows.filter((row) => !row.metaDescription);

  return {
    total: rows.length,
    missingMetaTitle: missingMetaTitle.map((row) => row.slug),
    missingMetaDescription: missingMetaDescription.map((row) => row.slug),
  };
}
