import type { Context } from 'hono';

export type ErrorCode =
  | 'NOT_FOUND'
  | 'VALIDATION_ERROR'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'INTERNAL_ERROR';

export interface ApiError {
  success: false;
  error: {
    code: ErrorCode;
    message: string;
    details?: unknown;
    requestId: string | null;
  };
}

export function requestId(c: Context): string | null {
  return c.get('requestId') ?? null;
}

export function ok<T>(c: Context, data: T, status: 200 | 201 = 200) {
  return c.json({ success: true, data, requestId: requestId(c) }, status);
}

export function fail(
  c: Context,
  code: ErrorCode,
  message: string,
  status: 400 | 401 | 403 | 404 | 409 | 423 | 429 | 500,
  details?: unknown
) {
  const body: ApiError = { success: false, error: { code, message, requestId: requestId(c) } };
  if (details !== undefined) body.error.details = details;
  return c.json(body, status);
}

/**
 * Logs the underlying failure server-side and returns an opaque error to the client so
 * database messages and connection strings never reach the response body.
 */
export function serverError(c: Context, err: unknown) {
  console.error('[route-error]', {
    requestId: requestId(c),
    method: c.req.method,
    path: c.req.path,
    message: err instanceof Error ? err.message : String(err),
  });
  return fail(c, 'INTERNAL_ERROR', 'Internal Server Error', 500);
}
