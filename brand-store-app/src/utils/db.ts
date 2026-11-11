import { eq } from 'drizzle-orm';
import type { PgColumn } from 'drizzle-orm/pg-core';

/**
 * `eq` loses its overload on the current TypeScript release and infers `never`
 * for the right hand side. This wrapper keeps call sites readable and typed.
 */
export function matchUuid(column: PgColumn, value: string) {
  return eq(column, value as never);
}
