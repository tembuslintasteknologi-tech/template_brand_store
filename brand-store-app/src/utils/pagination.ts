/**
 * Cursor pagination and field projection for mobile clients.
 *
 * Offset pagination forces the database to walk and discard every preceding row, and the
 * page drifts when new rows land between two requests. The cursor here is opaque to the
 * client: base64url of `<createdAt ISO>|<id>`, matched with a strict less-than on the pair
 * so a shared `created_at` does not skip or repeat rows.
 */

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

export interface CursorValue {
  createdAt: string;
  id: string;
}

export interface CursorPage<T> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
  limit: number;
}

export class PaginationError extends Error {
  readonly status = 400;
  readonly code = 'INVALID_CURSOR';

  constructor(message: string) {
    super(message);
    this.name = 'PaginationError';
  }
}

function base64UrlEncode(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64url');
}

function base64UrlDecode(value: string): string {
  return Buffer.from(value, 'base64url').toString('utf8');
}

/**
 * Clamps a raw query value into `1..max`. Non numeric or sub-1 values fall back instead of
 * throwing, because a bad page size is a client bug worth correcting quietly.
 */
export function clampPageSize(
  raw: unknown,
  fallback: number = DEFAULT_PAGE_SIZE,
  max: number = MAX_PAGE_SIZE
): number {
  const parsed = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(parsed)) return fallback;
  const floored = Math.floor(parsed);
  if (floored < 1) return fallback;
  return Math.min(floored, max);
}

export function encodeCursor(row: { createdAt?: Date | string | null; id?: string | null }): string | null {
  const id = row?.id;
  if (!id) return null;
  const createdAt = row?.createdAt instanceof Date ? row.createdAt.toISOString() : row?.createdAt;
  if (!createdAt) return null;
  const time = new Date(createdAt).getTime();
  if (Number.isNaN(time)) return null;
  return base64UrlEncode(`${new Date(time).toISOString()}|${id}`);
}

/**
 * Returns `null` for an absent cursor and throws `PaginationError` for a malformed one, so a
 * truncated or hand-edited cursor is a 400 rather than a silent restart from page one.
 */
export function decodeCursor(raw: unknown): CursorValue | null {
  if (raw === undefined || raw === null) return null;
  const text = String(raw).trim();
  if (text.length === 0) return null;

  let decoded: string;
  try {
    decoded = base64UrlDecode(text);
  } catch {
    throw new PaginationError('Cursor tidak bisa dibaca');
  }

  const separator = decoded.lastIndexOf('|');
  if (separator <= 0) {
    throw new PaginationError('Cursor tidak valid');
  }

  const createdAt = decoded.slice(0, separator);
  const id = decoded.slice(separator + 1);
  const time = new Date(createdAt).getTime();
  if (Number.isNaN(time) || id.length === 0) {
    throw new PaginationError('Cursor tidak valid');
  }

  return { createdAt: new Date(time).toISOString(), id };
}

/**
 * Parses `fields=id,title,price`. Returns `null` when the caller asked for no projection so
 * the response keeps every column, and de-duplicates while dropping empty segments.
 */
export function parseFields(raw: unknown): string[] | null {
  if (raw === undefined || raw === null) return null;
  const parts = String(raw)
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  if (parts.length === 0) return null;
  return [...new Set(parts)];
}

/**
 * Keeps only the requested keys. Unknown keys are ignored rather than invented, so a typo in
 * `fields` narrows the payload instead of leaking a phantom property.
 */
export function projectRow<T extends Record<string, unknown>>(row: T, fields: string[] | null): Partial<T> | T {
  if (!fields || fields.length === 0) return row;
  const projected: Record<string, unknown> = {};
  for (const field of fields) {
    if (Object.prototype.hasOwnProperty.call(row, field)) {
      projected[field] = row[field];
    }
  }
  return projected as Partial<T>;
}

/**
 * Builds the page from rows fetched with `limit + 1`. The extra row is how `hasMore` is known
 * without a second count query.
 */
export function buildCursorPage<T extends { createdAt?: Date | string | null; id?: string | null }>(
  rows: T[],
  limit: number,
  options: { fields?: string[] | null } = {}
): CursorPage<T | Partial<T>> {
  const size = clampPageSize(limit);
  const hasMore = rows.length > size;
  const window = hasMore ? rows.slice(0, size) : rows;
  const last = window[window.length - 1];
  const nextCursor = hasMore && last ? encodeCursor(last) : null;
  const fields = options.fields ?? null;
  const items = fields
    ? window.map((row) => projectRow(row as Record<string, unknown>, fields) as Partial<T>)
    : window;
  return { items, nextCursor, hasMore, limit: size };
}
