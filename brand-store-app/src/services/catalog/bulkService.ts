import { db } from '../../db/index.js';
import { categories, products } from '../../db/schema.js';
import { eq } from 'drizzle-orm';
import { buildExport, ExportColumn, ExportFormat, ExportResult } from '../admin/reports.js';
import { recordAdminAction } from '../admin/auditLog.js';

export class BulkError extends Error {
  readonly status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = 'BulkError';
    this.status = status;
  }
}

export const PRODUCT_IMPORT_COLUMNS = [
  'title',
  'slug',
  'description',
  'categorySlug',
  'basePrice',
  'compareAtPrice',
  'sku',
  'stock',
  'status',
  'images',
  'metaTitle',
  'metaDescription',
] as const;

export type ProductImportColumn = (typeof PRODUCT_IMPORT_COLUMNS)[number];

export interface ProductImportRow {
  title: string;
  slug: string;
  description?: string;
  categorySlug?: string;
  basePrice: number;
  compareAtPrice?: number;
  sku?: string;
  stock: number;
  status: 'draft' | 'published' | 'archived';
  images?: string[];
  metaTitle?: string;
  metaDescription?: string;
}

export interface RowValidation {
  valid: boolean;
  errors: string[];
}

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const PRODUCT_STATUSES = ['draft', 'published', 'archived'];

/** RFC4180-ish CSV parser: handles quoted fields, escaped quotes, CRLF and LF. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  const input = String(text ?? '').replace(/^\uFEFF/, '');

  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];

    if (inQuotes) {
      if (char === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\r') {
      if (input[i + 1] === '\n') i += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (char === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += char;
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter((cells) => cells.some((cell) => String(cell).trim() !== ''));
}

export function buildProductImportTemplate(): string {
  return PRODUCT_IMPORT_COLUMNS.join(',') + '\r\n' +
    'Kaos Katun Combed,kaos-katun-combed,Bahan adem 30s,atasan,89000,120000,KAOS-001,25,published,,,Kaos Katun Combed,Bahan adem 30s\r\n';
}

export function validateImportRow(raw: Record<string, string>, index: number): RowValidation {
  const errors: string[] = [];
  const label = `baris ${index + 2}`;

  const title = String(raw.title ?? '').trim();
  const slug = String(raw.slug ?? '').trim();
  const basePrice = Number(raw.basePrice);
  const stock = Number(raw.stock ?? 0);
  const status = String(raw.status ?? 'draft').trim() || 'draft';

  if (title.length < 3) errors.push(`${label}: title minimal 3 karakter`);
  if (!SLUG_PATTERN.test(slug)) errors.push(`${label}: slug harus huruf kecil, angka, dan tanda hubung`);
  if (!Number.isFinite(basePrice) || basePrice <= 0) errors.push(`${label}: basePrice harus angka positif`);
  if (!Number.isInteger(stock) || stock < 0) errors.push(`${label}: stock harus bilangan bulat >= 0`);
  if (!PRODUCT_STATUSES.includes(status)) errors.push(`${label}: status harus draft, published, atau archived`);

  const compareAtPrice = raw.compareAtPrice ? Number(raw.compareAtPrice) : undefined;
  if (compareAtPrice !== undefined && (!Number.isFinite(compareAtPrice) || compareAtPrice <= 0)) {
    errors.push(`${label}: compareAtPrice harus angka positif`);
  }

  const metaTitle = String(raw.metaTitle ?? '').trim();
  if (metaTitle.length > 200) errors.push(`${label}: metaTitle maksimal 200 karakter`);
  const metaDescription = String(raw.metaDescription ?? '').trim();
  if (metaDescription.length > 400) errors.push(`${label}: metaDescription maksimal 400 karakter`);

  return { valid: errors.length === 0, errors };
}

export function normalizeImportRow(raw: Record<string, string>): ProductImportRow {
  const imagesRaw = String(raw.images ?? '').trim();
  return {
    title: String(raw.title ?? '').trim(),
    slug: String(raw.slug ?? '').trim(),
    description: String(raw.description ?? '').trim() || undefined,
    categorySlug: String(raw.categorySlug ?? '').trim() || undefined,
    basePrice: Number(raw.basePrice),
    compareAtPrice: raw.compareAtPrice ? Number(raw.compareAtPrice) : undefined,
    sku: String(raw.sku ?? '').trim() || undefined,
    stock: Number(raw.stock ?? 0),
    status: (String(raw.status ?? 'draft').trim() || 'draft') as ProductImportRow['status'],
    images: imagesRaw
      ? imagesRaw.split('|').map((value) => value.trim()).filter(Boolean)
      : [],
    metaTitle: String(raw.metaTitle ?? '').trim() || undefined,
    metaDescription: String(raw.metaDescription ?? '').trim() || undefined,
  };
}

export interface ParsedImport {
  rows: Array<{ index: number; raw: Record<string, string>; errors: string[] }>;
  errors: string[];
  headerErrors: string[];
}

export function parseProductImport(text: string): ParsedImport {
  const cells = parseCsv(text);
  if (cells.length === 0) {
    return { rows: [], errors: ['File kosong'], headerErrors: ['File kosong'] };
  }

  const header = cells[0].map((cell) => String(cell).trim());
  const headerErrors: string[] = [];
  for (const required of ['title', 'slug', 'basePrice', 'stock']) {
    if (!header.includes(required)) headerErrors.push(`Kolom wajib hilang: ${required}`);
  }
  if (headerErrors.length > 0) {
    return { rows: [], errors: headerErrors, headerErrors };
  }

  const rows = [];
  const errors: string[] = [];
  for (let i = 1; i < cells.length; i += 1) {
    const raw: Record<string, string> = {};
    header.forEach((key, position) => {
      raw[key] = cells[i][position] ?? '';
    });

    const validation = validateImportRow(raw, i - 1);
    if (!validation.valid) errors.push(...validation.errors);
    rows.push({ index: i - 1, raw, errors: validation.errors });
  }

  return { rows, errors, headerErrors };
}

export async function importProducts(actorId: string, text: string) {
  const parsed = parseProductImport(text);
  if (parsed.headerErrors.length > 0) {
    throw new BulkError(parsed.headerErrors.join('; '), 400);
  }
  if (parsed.rows.length === 0) {
    throw new BulkError('Tidak ada baris produk untuk diimpor', 400);
  }
  if (parsed.rows.length > 5000) {
    throw new BulkError('Maksimal 5000 baris per impor', 413);
  }

  const categoryRows = await db.select({ id: categories.id, slug: categories.slug }).from(categories);
  const categoryBySlug = new Map(categoryRows.map((row) => [String(row.slug), String(row.id)]));

  let created = 0;
  let updated = 0;
  const skipped: Array<{ row: number; errors: string[] }> = [];

  for (const row of parsed.rows) {
    if (row.errors.length > 0) {
      skipped.push({ row: row.index + 2, errors: row.errors });
      continue;
    }

    const normalized = normalizeImportRow(row.raw);
    let categoryId: string | null = null;
    if (normalized.categorySlug) {
      const found = categoryBySlug.get(normalized.categorySlug);
      if (!found) {
        skipped.push({ row: row.index + 2, errors: [`Kategori tidak ditemukan: ${normalized.categorySlug}`] });
        continue;
      }
      categoryId = found;
    }

    const values = {
      title: normalized.title,
      slug: normalized.slug,
      description: normalized.description ?? null,
      categoryId: categoryId as any,
      basePrice: String(normalized.basePrice),
      compareAtPrice: normalized.compareAtPrice !== undefined ? String(normalized.compareAtPrice) : null,
      sku: normalized.sku ?? null,
      stock: normalized.stock,
      status: normalized.status,
      images: (normalized.images ?? []) as any,
      metaTitle: normalized.metaTitle ?? null,
      metaDescription: normalized.metaDescription ?? null,
      updatedAt: new Date(),
    };

    const [existing] = await db
      .select({ id: products.id })
      .from(products)
      .where(eq(products.slug, normalized.slug as any))
      .limit(1);

    if (existing) {
      await db.update(products).set(values).where(eq(products.id, existing.id as any));
      updated += 1;
    } else {
      await db.insert(products).values({ ...values, createdBy: actorId as any });
      created += 1;
    }
  }

  await recordAdminAction({
    actorId,
    action: 'product.import',
    targetType: 'product',
    metadata: { created, updated, skipped: skipped.length, rows: parsed.rows.length },
  });

  return { created, updated, skipped, total: parsed.rows.length };
}

export interface ProductExportRow extends Record<string, unknown> {
  id: string;
  title: string;
  slug: string;
  sku: string | null;
  categoryId: string | null;
  basePrice: string;
  compareAtPrice: string | null;
  stock: number;
  status: string;
  metaTitle: string | null;
  metaDescription: string | null;
  createdAt: Date | string;
}

export const PRODUCT_EXPORT_COLUMNS: ExportColumn<ProductExportRow>[] = [
  { key: 'id', header: 'id' },
  { key: 'title', header: 'title' },
  { key: 'slug', header: 'slug' },
  { key: 'sku', header: 'sku' },
  { key: 'categoryId', header: 'categoryId' },
  { key: 'basePrice', header: 'basePrice' },
  { key: 'compareAtPrice', header: 'compareAtPrice' },
  { key: 'stock', header: 'stock' },
  { key: 'status', header: 'status' },
  { key: 'metaTitle', header: 'metaTitle' },
  { key: 'metaDescription', header: 'metaDescription' },
  { key: 'createdAt', header: 'createdAt' },
];

export async function exportProducts(format: ExportFormat = 'csv'): Promise<ExportResult> {
  const rows = await db
    .select({
      id: products.id,
      title: products.title,
      slug: products.slug,
      sku: products.sku,
      categoryId: products.categoryId,
      basePrice: products.basePrice,
      compareAtPrice: products.compareAtPrice,
      stock: products.stock,
      status: products.status,
      metaTitle: products.metaTitle,
      metaDescription: products.metaDescription,
      createdAt: products.createdAt,
    })
    .from(products);

  return buildExport('products', format, rows as ProductExportRow[], PRODUCT_EXPORT_COLUMNS);
}
