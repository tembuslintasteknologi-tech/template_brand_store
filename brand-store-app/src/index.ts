/**
 * Entrypoint server.
 *
 * File ini sengaja hanya mengekspor `app` dari `app.ts`, bukan membangun Hono sendiri. Versi
 * sebelumnya memasang ulang router dengan prefix `/api`, sehingga `npm run dev` dan `npm start`
 * menjalankan subset route yang berbeda dari yang diuji dan dari yang dipakai klien mobile
 * (`/api/v1`). Satu sumber pemasangan route berarti tidak ada lagi route yang "ada di test tapi
 * hilang di produksi".
 *
 * Scheduler abandoned cart juga dipasang di sini, bukan di dalam route, karena route hanya
 * memanggil satu putaran scan saat admin memintanya. Interval bersifat opsional: tanpa
 * `CART_RECOVERY_INTERVAL_MINUTES` tidak ada timer yang berjalan.
 */

import { unifiedConfig } from './config/unifiedConfig.js';
import { app } from './app.js';
import { runRecoveryScan } from './services/cart/cartPersistence.js';
import { loadAbandonmentPolicy, loadRecoveryBaseUrl } from './routes/cart.js';

export default {
  port: unifiedConfig.port,
  fetch: app.fetch,
};

console.log(`Brand Store API server running on port ${unifiedConfig.port}`);

const intervalMinutes = Number(process.env.CART_RECOVERY_INTERVAL_MINUTES ?? 0);

if (Number.isFinite(intervalMinutes) && intervalMinutes > 0) {
  const intervalMs = Math.max(60_000, intervalMinutes * 60_000);
  const timer = setInterval(() => {
    void (async () => {
      try {
        const policy = await loadAbandonmentPolicy();
        if (!policy.enabled) return;
        const baseUrl = await loadRecoveryBaseUrl();
        const result = await runRecoveryScan(policy, { baseUrl });
        console.log('[cart-recovery] scan', result);
      } catch (err: any) {
        console.error('[cart-recovery] scan failed', { message: err?.message });
      }
    })();
  }, intervalMs);

  // Timer tidak boleh menahan proses tetap hidup saat shutdown atau saat test mengimpor file ini.
  if (typeof (timer as any).unref === 'function') (timer as any).unref();
  console.log(`Cart recovery scanner aktif tiap ${intervalMs / 60_000} menit`);
}
