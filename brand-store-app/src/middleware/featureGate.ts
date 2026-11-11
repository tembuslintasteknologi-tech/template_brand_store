import { Context, Next } from 'hono';
import { isFeatureEnabled } from '../services/config/settings.js';

/**
 * Blocks a route when its feature flag is disabled, so the flag has a real
 * effect instead of only being stored in the settings table.
 */
export function featureGate(flag: string) {
  return async (c: Context, next: Next) => {
    let enabled = false;
    try {
      enabled = await isFeatureEnabled(flag);
    } catch {
      enabled = false;
    }

    if (!enabled) {
      return c.json(
        {
          success: false,
          error: {
            code: 'FEATURE_DISABLED',
            message: `Fitur "${flag}" sedang dinonaktifkan oleh admin`,
            feature: flag,
          },
        },
        403
      );
    }

    await next();
  };
}
