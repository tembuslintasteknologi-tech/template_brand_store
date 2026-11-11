import { Context, Next } from 'hono';
import { getMaintenanceMode, shouldBlockForMaintenance } from '../services/config/settings.js';

const CACHE_TTL_MS = 5000;

let cached: { enabled: boolean; message?: string; checkedAt: number } | null = null;

export function resetMaintenanceCache(): void {
  cached = null;
}

async function readMaintenanceState(): Promise<{ enabled: boolean; message?: string }> {
  const now = Date.now();
  if (cached && now - cached.checkedAt < CACHE_TTL_MS) {
    return cached;
  }
  try {
    const state = await getMaintenanceMode();
    cached = { ...state, checkedAt: now };
    return state;
  } catch {
    cached = { enabled: false, checkedAt: now };
    return { enabled: false };
  }
}

export function maintenanceMiddleware() {
  return async (c: Context, next: Next) => {
    const state = await readMaintenanceState();

    if (shouldBlockForMaintenance(state.enabled, c.req.path)) {
      return c.json(
        {
          success: false,
          error: {
            code: 'MAINTENANCE_MODE',
            message: state.message ?? 'Toko sedang dalam mode pemeliharaan. Coba lagi nanti.',
          },
        },
        503
      );
    }

    await next();
  };
}
