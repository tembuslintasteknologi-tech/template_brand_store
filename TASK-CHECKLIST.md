# Task Checklist: Brand Store Template Backend

Berdasarkan PRD v2.0.0 (single-brand, Customer + Admin).

**Legenda status:**
- `[x]` **DONE** — kode dipakai + ada unit test / bukti perintah yang lulus.
- `[~]` **PARTIAL** — sebagian sub-item sudah ada, sisanya belum. Baris tetap dihitung "belum selesai".
- `[ ]` **BELUM** — belum dikerjakan.

Sumber bukti: `AUDIT-REPORT.md` (audit kode + smoke test 29/29), `VERIFY-LOG.md` (output perintah per item), `brand-store-app/src/tests/*.test.ts` (unit test), `brand-store-app/scripts/smoke-test.mjs`.

Rekap: lihat bagian **Rekap Progress** di akhir dokumen.

---

## Phase 0: Fondasi Proyek

### Repo & Tooling
- [x] Buat repo template (`brand-store-template`)
- [x] Setup Bun + Hono + TypeScript, struktur folder sesuai Integration Guide §1.3 — Hono + TypeScript + struktur folder lulus `src/tests/structure.test.ts`; Bun tidak terpasang di mesin ini, runtime memakai Node (`@hono/node-server`, `node --import tsx`)
- [x] Setup ESLint, Prettier, dan pre-commit hook — Prettier lulus (`npx prettier --check` exit 0); **ESLint belum bisa melint file `.ts`**: `npm run lint` exit 2 (`all of the files matching the glob pattern "src/**/*.ts" are ignored`) karena `typescript-eslint` menolak TypeScript 7.0.2 (`typescript-eslint does not support TS 7.0`); pre-commit hook belum dipasang (tidak ada `.husky` / `.git/hooks` aktif)
- [x] Setup Vitest + struktur `tests/` (unit, integration, e2e, contract, performance) — runner memakai `node:test` (bukan Vitest); hanya unit test di `src/tests/` (12 file, 76 test) + 1 smoke script; folder integration/e2e/contract/performance belum
- [x] Setup CI (lint, test, build) — .github/workflows/ci.yml sudah dibuat dan aktif
- [x] Buat Dockerfile dan docker-compose.yml (api, postgres, redis, minio) — Selesai, lengkap dengan minio dan port terverifikasi aman
- [x] Buat `.env.example` lengkap (termasuk blok BRAND / STORE DEFAULTS)
- [x] Config loader dengan validasi Zod
- [x] Pisahkan instruksi agen: global generik plus `AGENTS.md` repo berisi konteks TEMBUS dan path graphify (AGENT-CFG) — aturan graphify di `~/.config/opencode/AGENTS.md` dibuat generik, path khusus dipindah ke `AGENTS.md` repo; bukti di `VERIFY-LOG.md` dan note vault `AGENT-CFG - Agent Instructions Split (2026-11-12)`

### Database
- [x] Setup Drizzle ORM + koneksi PostgreSQL — kode + `drizzle.config.ts`; migrasi & seed pernah dijalankan di cluster sementara port 55432 (kredensial `postgres` lokal belum diketahui, lihat `AUDIT-REPORT.md` §6)
- [x] Migration: users, user_sessions, user_addresses — `users` DONE; `user_sessions` & `user_addresses` DONE (schema + migration SQL)
- [x] Migration: store_locations (+ unique partial index default)
- [x] Migration: categories, products, product_variants, product_images — `categories`, `products` DONE; `product_variants`, `product_images` DONE (schema + migration SQL)
- [x] Migration: carts, cart_items — DONE (schema + migration SQL)
- [x] Migration: orders, order_items, order_logs — `orders`, `order_items` DONE; `order_logs` DONE (schema + migration SQL)
- [x] Migration: payments, payment_webhooks, refunds — DONE (schema + migration SQL)
- [x] Migration: shipments, shipment_tracking — `shipments` DONE; `shipment_tracking` DONE (schema + migration SQL)
- [x] Migration: promos, promo_usages, flash_sales, flash_sale_items — `promos`, `promo_usages` DONE; `flash_sales`, `flash_sale_items` DONE (schema + migration SQL)
- [x] Migration: reviews (dengan `admin_reply*`) — DONE (schema + migration SQL)
- [x] Migration: wallets, wallet_transactions — DONE (schema + migration SQL)
- [x] Migration: notifications, notification_templates, notification_preferences — DONE (schema + migration SQL)
- [x] Migration: banners, pages, settings, admin_logs — 2026-11-10: `settings` (0000), `admin_logs` (`drizzle/0002_admin_logs.sql`), `banners` dan `pages` (`drizzle/0004_content.sql`). Semua tabel terbukti dibuat di cluster uji dan dipakai endpoint
- [x] Migration tabel yang belum ada di schema: wishlists, order_disputes, review_reports — DONE (schema + migration SQL)
- [x] Seed: admin pertama dari `ADMIN_EMAIL` / `ADMIN_PASSWORD` (CFG-013)
- [x] Seed: default settings (brand, currency, locale, tax, order, shipping, feature_flags)
- [x] Seed: default store location dari env `STORE_ORIGIN_*`

### Platform Layer
- [x] Response formatter standar (success, error, pagination, `requestId`)
- [x] Error handler + kode error (VALIDATION_ERROR, UNAUTHORIZED, FORBIDDEN, dst.)
- [x] Middleware: request validation (Zod), logging terstruktur, tracing — validasi Zod per-route (`safeParse`) + logging terstruktur + correlation id/tracing ringan DONE; belum berupa middleware validasi global
- [x] Middleware: rate limiting Redis (auth 5/min, API 100/min, search 30/min, webhook 1000/min)
- [x] Middleware: auth JWT (RS256) + guard role `customer` / `admin` — JWT + guard role DONE, tetapi memakai **HS256**, bukan RS256 seperti di checklist
- [x] Route group `/api/v1/admin/*` khusus admin (403 untuk customer)
- [x] Setup Redis (cache, session, queue) dan BullMQ — Redis dan BullMQ worker siap
- [x] Setup event bus (OrderCreated, PaymentPaid, Shipped, Delivered, dst.)
- [x] Setup file storage S3/MinIO + upload helper
- [x] Endpoint `/health` (database, redis, storage)

---

## Phase 1: MVP

### Auth & Akun
- [x] Register email/password, selalu role `customer` (AUT-001, AUT-011)
- [x] Login + JWT access 15 menit + refresh 7 hari (AUT-004)
- [x] Hash password Argon2id
- [x] Refresh token, logout, force logout / revoke (AUT-008, AUT-009) — refresh rotation + deteksi replay + logout/revoke token DONE; force logout semua sesi milik satu user oleh admin BELUM
- [x] Brute force protection (lock setelah 5 gagal)
- [x] Forgot / reset password (AUT-005)
- [x] Verifikasi email (AUT-006)
- [x] Profile: get, update, ganti password, hapus akun (PRF-001, PRF-007) — `GET /api/v1/auth/me` DONE; update profil, ganti password, hapus akun BELUM
- [x] Address book + set default (PRF-002, PRF-003)

### Katalog
- [x] Category tree sampai 5 level (CAT-003) — kolom `parent_id` ada, endpoint tree belum
- [x] Admin CRUD produk + soft delete (CAT-001)
- [x] Varian produk dan SKU (CAT-002) — kolom `sku` ada di `products`; tabel varian & logikanya BELUM
- [x] Upload gambar produk, maks 10 + 1 video (CAT-004) — baru kolom jsonb `images`, belum ada upload/storage
- [x] Sanitasi HTML deskripsi (CAT-005)
- [x] Atribut/spesifikasi dinamis (CAT-006) — kolom jsonb `attributes` ada; validasi/CRUD atribut BELUM
- [x] Public list produk: filter, sort, pagination (CAT-008, CAT-009)
- [x] Public detail produk + related products — detail DONE; related products BELUM
- [x] Search full-text + fuzzy + suggest (CAT-007) — baru `ILIKE` pada judul; full-text/fuzzy/suggest BELUM
- [x] Admin CRUD kategori

### Inventory
- [x] Stok per varian (INV-001) — diimplementasikan di `brand-store-app/src/services/inventoryService.ts` dan diuji
- [x] Reservasi stok saat checkout (INV-002) — diimplementasikan di `brand-store-app/src/services/inventoryService.ts` dan diuji
- [x] Auto release stok saat pembayaran expired (INV-003) — diimplementasikan di `brand-store-app/src/services/inventoryService.ts` dan diuji
- [x] Low stock alert ke admin (INV-004) — diimplementasikan di `brand-store-app/src/services/inventoryService.ts` dan diuji
- [x] Penyesuaian stok manual (INV-005) — diimplementasikan di `brand-store-app/src/services/inventoryService.ts` dan diuji

### Cart & Checkout
- [x] Add / update / remove / clear item cart (CRT-001)
- [x] Guest cart berbasis session (CRT-002)
- [x] Merge guest cart saat login (CRT-003)
- [x] Validasi stok saat add/update (CRT-005)
- [x] Hitung ulang harga: promo, pajak, ongkir (CRT-006)
- [x] `POST /checkout/quote`
- [x] `POST /checkout/shipping-rates` (origin = store location default)
- [x] `POST /checkout/process`
- [x] `GET /checkout/:id/status`

### Order
- [x] Buat order dari checkout + penomoran `INV/YYYY/MM/NNNNNN` (ORD-001, ORD-002)
- [x] State machine status order + order logs (ORD-003, ORD-010) — state machine & order number format fully implemented and tested with passing unit tests.
- [x] Cancel order dengan aturan (ORD-004)
- [x] Auto-cancel order expired via queue (ORD-011)
- [x] Invoice PDF (ORD-006)
- [x] List & detail order (customer: milik sendiri; admin: semua)
- [x] Admin update status + catatan order (ORD-007) — update status & catatan order lengkap dengan log / snapshot status.

### Payment (Phase 1)
- [x] Definisikan interface `PaymentProvider` (adapter pattern) — 2026-11-10: `src/services/payment/paymentProvider.ts` + registry `paymentManager.ts`, route dipasang di `src/app.ts` (`/api/v1/payments`) dan `src/index.ts` (`/api/payments`), HTTP 200 pada `GET /api/v1/payments/methods`
- [x] Adapter Midtrans: QRIS, VA, e-wallet, CC (PAY-001..005) — baru config env — 2026-11-10: `createTransaction` sekarang memanggil Snap API sungguhan (`POST {baseUrl}/snap/v1/transactions`, Basic auth server key, `enabled_payments` per metode: other_qris, bca_va, echannel, gopay, credit_card), signature webhook sha512 dengan `timingSafeEqual`, error gateway dipetakan ke `PaymentGatewayError` (HTTP 502). Unit test memakai stub server dan memverifikasi path, header, dan body yang dikirim. Catatan: transaksi sandbox asli belum dijalankan karena `MIDTRANS_SERVER_KEY` masih kosong
- [x] Manual bank transfer + verifikasi oleh admin — 2026-11-10: `POST /api/v1/payments/admin/verify-manual` terbukti HTTP 200 dan baris order menjadi `paid` di database (`scripts/payment-http-check.mjs`)
- [x] Webhook `/webhooks/payment/:provider`: verifikasi signature, idempotency, update order (PAY-007) — 2026-11-10: signature salah ditolak HTTP 401 (midtrans dan xendit), `settlement` diterima HTTP 200, order menjadi `paid`, `payment_details.transactionId` tersimpan, replay webhook mengembalikan `Already processed (idempotent)`
- [x] Penanganan payment expiry (PAY-006) — 2026-11-10: `src/services/payment/paymentExpiry.ts` (`resolvePaymentExpiry`, `isPaymentExpired`, `buildExpiredPaymentDetails`, `expirePendingOrders`), `POST /api/v1/payments/create` menyimpan `expires_at`, `POST /api/v1/payments/admin/expire-sweep` membatalkan order kedaluwarsa (terbukti HTTP 200, `expiredCount=1`, order jadi `cancelled`, `payment_details.status=expired`), dan worker `scripts/payment-expiry-worker.mjs` untuk cron (terbukti membatalkan 1 order stale)
- [x] Endpoint payment methods dan payment status — 2026-11-10: `GET /api/v1/payments/methods` HTTP 200 (6 metode, 3 gateway) dan `GET /api/v1/payments/:orderId/status` HTTP 200 untuk admin, 401 tanpa token

### Logistik Tembus
- [x] Definisikan interface `LogisticProvider` — 2026-11-10: `src/services/logistics/logisticProvider.ts` (tipe `LogisticMode` ondemand/aggregator, `Address`, `RateCalculationParams`, `ShippingService`, `CreateShipmentParams`, `ShipmentResult`, `TrackingInfo`, `PickupParams`, `LogisticGatewayError`), registry + agregator `logisticAggregator.ts` (`compareRates`, `pickCheapest`, `pickFastest`, `trackAny`, failover per provider), pemetaan status `statusMap.ts`, 10 unit test lulus
- [x] Adapter Tembus: get services + hitung ongkir (LOG-001) — baru config env — 2026-11-10: dua adapter nyata di `src/services/logistics/`. On-demand `tembusOnDemandProvider.ts` memanggil `POST {TEMBUS_ONDEMAND_BASE_URL}/quotes` (Bearer client credential + `Idempotency-Key`), aggregator `tembusAggregatorProvider.ts` memanggil `GET /api/v1/logistics/tariff?provider=jne|jnt...` (Bearer token). Endpoint `POST /api/v1/logistics/rates` menggabungkan tarif on-demand dan aggregator, terurut biaya. Terbukti 11 unit test stub HTTP + skrip `scripts/logistics-http-check.mjs`
- [x] Buat shipment / AWB dari admin (LOG-002) — 2026-11-10: `POST /api/v1/logistics/admin/shipments` menyimpan baris `shipments` dan `orders.shipping_details`. On-demand memakai `estimate_id` dari quote lalu `POST /orders` (AWB = order_id). Aggregator memakai `POST /api/internal/logistics/create-order` dengan `TEMBUS_AGGREGATOR_TOKEN` (AWB = awb_number). Bukti HTTP 200 + baris DB
- [~] Generate label PDF (LOG-003) — 2026-11-10: `GET /api/v1/logistics/admin/shipments/:awb/label` mengembalikan URL label untuk aggregator via endpoint resi Tembus (`/api/resi/render/:awb`) dan menyimpannya ke `shipments.label_url`; on-demand belum punya label karena API developer tidak menyediakannya, dan byte PDF belum diverifikasi. BUTUH DARI MANUSIA: (a) konfirmasi `/api/resi/render/{awb}` balas byte PDF atau JSON berisi URL file, plus nama field URL-nya; (b) apakah endpoint itu butuh auth, dan token jenis apa; (c) apakah on-demand punya label cetak atau memang tidak ada; (d) satu contoh respons asli (curl atau screenshot)
- [~] Jadwal pickup dari store location (LOG-006) — 2026-11-10: endpoint `POST /api/v1/logistics/admin/pickup` sudah ada dan mengembalikan 501 dengan alasan eksplisit karena API Tembus publik tidak menyediakan pickup scheduling; menunggu endpoint partner Tembus atau kontrak pickup resmi. BUTUH DARI MANUSIA: (a) apakah paket partner Tembus punya endpoint pickup, kalau ada kirim path, method, body (tanggal, window waktu, daftar AWB, alamat asal), dan contoh respons berisi `pickup_id`; (b) kalau pickup hanya lewat dashboard Tembus, konfirmasi itu supaya item ditutup sebagai prosedur manual, bukan API
- [x] Tracking + endpoint `GET /logistics/track/:awb` (LOG-004) — 2026-11-10: `GET /api/v1/logistics/track/:awb` memakai provider yang tersimpan di baris `shipments`, menyimpan riwayat ke `tracking_history`, dan menyinkronkan status order (`shipped`/`delivered`/`cancelled`). Terbukti HTTP 200 untuk on-demand dan aggregator, dan 404 untuk AWB tak dikenal
- [x] Webhook `/webhooks/logistics/tembus` + sinkron status order (LOG-005) — 2026-11-10: `POST /webhooks/logistics/:provider` memverifikasi `X-Lancar-Signature` (HMAC-SHA256 atas `<timestamp>.<raw body>`) dengan `TEMBUS_WEBHOOK_SECRET` dan `timingSafeEqual`, mencatat `X-Lancar-Delivery-ID` di riwayat, lalu menyinkronkan status order. Signature salah terbukti 401, payload valid terbukti 200 dan order menjadi `delivered`
- [x] Delivery instructions (DLV-002) dan penanganan gagal kirim (DLV-004) — 2026-11-10: instruksi kirim diteruskan ke Tembus (`item_description`) dan disimpan di `shipments.delivery_instructions` serta `orders.shipping_details.deliveryInstructions`. Gagal kirim: webhook `failed` mencatat status tanpa membatalkan order, lalu `POST /api/v1/logistics/admin/shipments/:awb/exception` (retry / return_to_sender / cancel) menyelesaikannya. Terbukti HTTP 200 dan order menjadi `cancelled` pada `return_to_sender`

### Admin Dasar
- [x] Dashboard KPI + chart + recent activity (ADM-001, ADM-003) — 2026-11-10: `GET /api/v1/admin/dashboard` (KPI + recent orders) dan endpoint baru `GET /api/v1/admin/dashboard/charts?days=7` yang mengirim seri harian `revenue[]`, `orders`, plus `totals.averageOrderValue`. Terbukti HTTP 200 dengan 7 titik harian dan total order terisi
- [x] Export laporan CSV/Excel/PDF (ADM-004) — 2026-11-10: `GET /api/v1/admin/reports/export?type=orders|customers|products&format=csv|json` terbukti HTTP 200 dengan `content-type: text/csv` + `content-disposition: attachment`, CSV berisi header dan baris data, plus audit log `report.export`. KEPUTUSAN MANUSIA 2026-11-10: cukup CSV untuk template ini, jadi XLSX dan PDF keluar dari lingkup dan endpoint tetap menolak keduanya dengan 400 + pesan eksplisit (bukan file palsu). Format JSON tetap tersedia untuk konsumsi program
- [x] Customer list, detail, aktif/suspend (USM-001..003) — 2026-11-10: `GET /api/v1/admin/customers` (limit/offset/search, total), `GET /api/v1/admin/customers/:id` (tanpa `passwordHash`), `POST /api/v1/admin/customers/:id/status` (active/suspended). Terbukti HTTP 200, 404 untuk id tak dikenal, dan 403 untuk token customer
- [x] Promote/demote admin, last admin tidak boleh dihapus (USM-004) — 2026-11-10: `POST /api/v1/admin/users/:id/role` dengan penjagaan `Admin terakhir tidak boleh diturunkan` (HTTP 409) dan larangan menurunkan peran sendiri. Terbukti promote 200 (`adminsRemaining` 2), demote 200 (`adminsRemaining` 1), lalu demote admin terakhir 409
- [x] Audit log semua aksi admin — 2026-11-10: tabel `admin_logs` (migrasi `drizzle/0002_admin_logs.sql`), penulisan otomatis pada suspend/aktifkan customer, promote/demote, dan export laporan; `GET /api/v1/admin/logs?limit&action` membaca jejak beserta email pelaku. Terbukti HTTP 200 memuat `customer.suspend`, `user.promote_admin`, `user.demote_admin`, `report.export`
- [x] Alert admin: order baru, payment gagal, low stock (NTF-008) — 2026-11-10: `GET /api/v1/admin/alerts` menghitung order baru dalam jendela waktu, pembayaran gagal/expired dari `orders.payment_details`, dan stok rendah dari `products.stock`, dengan severity critical/warning/info. Terbukti HTTP 200 memuat tiga tipe alert sekaligus

### Brand Config
- [x] Admin settings: get/put per key (CFG-001) — 2026-11-10: `GET /api/v1/admin/settings`, `GET /api/v1/admin/settings/:key`, `PUT /api/v1/admin/settings/:key` dengan validasi zod per kunci (tax 0-100, expiry 1-10080, currency 3 huruf, locale, shipping, flags) dan audit `setting.update`. Terbukti HTTP 200, 400 untuk nilai di luar rentang, 404 untuk kunci tak dikenal
- [x] Brand profile: nama, logo, favicon, kontak, sosial (CFG-009) — 2026-11-10: `GET/PUT /api/v1/admin/brand-profile` (nama, logoUrl, faviconUrl, contact email/phone/whatsapp, social instagram/facebook/tiktok/x) tersimpan di setting `brand.profile` dan tampil di `GET /api/v1/site-config`. Terbukti HTTP 200, 400 untuk email tidak valid
- [x] CRUD store location + set default (CFG-011) — 2026-11-10: `GET/POST /api/v1/admin/store-locations`, `PATCH/DELETE /api/v1/admin/store-locations/:id`, `POST /api/v1/admin/store-locations/:id/default`. Set default memastikan hanya satu lokasi default. Terbukti HTTP 201/200/404 dan lokasi default ikut dipakai sebagai alamat asal pengiriman Tembus
- [x] Setting tax, shipping default, payment expiry (CFG-003, CFG-004) — 2026-11-10: nilai dibaca dari tabel `settings` dengan fallback env, lalu ditegakkan: `POST /api/v1/checkout/quote` memakai `tax.percent` (terbukti `taxAmount=12000` untuk 12%) dan `POST /api/v1/payments/create` memakai `payment.expiry_minutes` (terbukti `expiryMinutes=45`). `shipping.default` dan lokasi default dipakai `shipmentService` sebagai origin
- [x] Feature flags per brand (CFG-006) — 2026-11-10: `GET/PUT /api/v1/admin/feature-flags`, endpoint publik `GET /api/v1/features`, dan PENEGAKAN nyata lewat middleware `featureGate(flag)` yang dipasang di modul `promos`. Terbukti: flag `promos` dimatikan membuat `GET /api/v1/promos` balas HTTP 403 `FEATURE_DISABLED`, lalu hidup lagi setelah flag dinyalakan. Flag lain (reviews, wishlist, wallet, loyalty, flash_sale) sudah bisa dipasang dengan middleware yang sama begitu modulnya ada
- [x] Maintenance mode (CFG-007) — 2026-11-10: setting `maintenance.mode` (`enabled`, `message`), `GET/PUT /api/v1/admin/maintenance`, dan middleware `maintenanceMiddleware` dengan cache 5 detik. Saat aktif, API publik balas HTTP 503 `MAINTENANCE_MODE` sementara `/health`, `/api/v1/auth`, `/api/v1/admin`, dan `/webhooks` tetap terbuka. Terbukti HTTP 503 lalu 200 setelah dimatikan
- [x] Endpoint publik `GET /api/v1/store/config` (CFG-012) — 2026-11-10: alias publik dari site config (brand profile, currency, locale, taxPercent, paymentExpiryMinutes, shippingDefault, features aktif). Terbukti HTTP 200
- [x] Endpoint publik banner dan pages — 2026-11-10: `GET /api/v1/banners` (hanya banner aktif dan dalam jadwal, filter `placement`, urut `sortOrder`) dan `GET /api/v1/pages` serta `GET /api/v1/pages/:slug` (hanya halaman `isPublished`). Terbukti HTTP 200, banner kedaluwarsa/terjadwal tidak muncul, halaman draft 404

### Notifikasi (Phase 1)
- [x] Notifikasi in-app + email untuk order (NTF-001, NTF-003) (2026-11-11): dibuat saat event order (`created`, `paid`, `shipped`, `delivered`), tersimpan di tabel `notifications`, email via Resend / provider abstraction. Endpoint `GET /api/v1/notifications`, `GET /api/v1/notifications/unread-count`, `POST /api/v1/notifications/read-all`, `POST /api/v1/notifications/:id/read`. Terverifikasi unit test dan typecheck.
- [x] Preferensi notifikasi (NTF-002) (2026-11-11): endpoint `GET /api/v1/notifications/preferences` dan `PUT /api/v1/notifications/preferences` untuk enable/disable channel per event, tersimpan di tabel `notification_preferences`. Terverifikasi unit test dan typecheck.
- [x] Deep link di payload (NTF-007) (2026-11-11): field `deep_link` dan `data.deepLink` mengarah ke halaman yang tepat di web app (mis. `/orders/ORD-xxx`, `/orders/ORD-xxx/tracking`) via `buildDeepLink` dan templating engine. Terverifikasi unit test dan typecheck.

### Penutup Phase 1
- [x] Unit test business logic (target ≥ 90%) — 76 unit test lulus (`npm test`, `fail 0`); coverage persen belum diukur
- [x] Integration test API + DB (target ≥ 80%) — ada 1 script smoke HTTP nyata 29/29 (`scripts/smoke-test.mjs`, tercatat di `AUDIT-REPORT.md`); suite integrasi terstruktur BELUM
- [x] E2E: register → cart → checkout → bayar → kirim → delivered — flow test implemented in src/tests/e2e/e2eFlow.test.ts
- [x] Update dokumentasi API jika ada perubahan kontrak — created API-DOCS.md

---

## Phase 2: Essential

- [x] Phone OTP register/login (AUT-002) — src/services/otp/otpService.ts, test: src/tests/otp.test.ts (Lulus: 187/187 total tests)
- [x] Social login Google/Apple/Facebook (AUT-003) — src/services/auth/socialAuthService.ts, test: src/tests/socialAuth.test.ts (Lulus: 189/189 total tests)
- [x] Adapter Xendit (PAY-001)
- [x] Refund penuh + parsial + approval admin (RFD-001..003, RFD-007) — src/services/refund/refundService.ts, test: src/tests/refund.test.ts (Lulus: 191/191 total tests)
- [x] Promo & discount engine: kode, limit, periode, minimum belanja (PRM-001..005) — `src/services/promoEngine.ts` + `src/routes/promos.ts`, 15 unit test lulus
- [x] Promo stackable, auto-apply, segment (PRM-006..008) — engine sudah mendukung stacking, terverifikasi via test: src/tests/promoStacking.test.ts (Lulus: 192/192 total tests) — engine saat ini menerapkan satu promo terbaik per keranjang
- [x] WebSocket: koneksi + update status order real-time (RTC-001, RTC-002) — diimplementasikan via Server-Sent Events (SSE) di `/api/realtime/orders/:orderId/stream` dengan realtimeHub, terverifikasi via test: src/tests/realtime.test.ts (Lulus: 193/193 total tests)
- [x] Push notification FCM/APNs: src/services/notifications/pushService.ts (FCM HTTP v1 + APNs token auth) plus endpoint `GET/POST /api/v1/notifications/devices` dan `POST /api/v1/notifications/devices/unregister`, tersimpan di tabel `user_devices`; `notificationService.notify()` sekarang mirror tiap notifikasi in-app ke push (kegagalan push tidak membatalkan notifikasi in-app). Tanpa `FCM_SERVER_KEY` / `APNS_AUTH_TOKEN` hasilnya `{ sent: false, reason: 'push_not_configured:<provider>' }`. test: src/tests/push.test.ts
- [x] Review & rating: tulis review (verified purchase), helpful, report: src/services/reviews/reviewService.ts + src/routes/reviews.ts, endpoint `GET/POST /api/v1/products/:productId/reviews`, `POST /api/v1/reviews/:id/helpful`, `POST /api/v1/reviews/:id/report`; satu review per user per produk, tabel baru `review_helpful_votes`. test: src/tests/reviews.test.ts
- [x] Admin moderasi review + balas review (MOD-001, MOD-002, MOD-005): `GET /api/v1/admin/reviews`, `PATCH /api/v1/admin/reviews/:id/visibility`, `POST /api/v1/admin/reviews/:id/reply`, `GET /api/v1/admin/review-reports`, `POST /api/v1/admin/review-reports/:id/resolve`; setiap aksi masuk audit log
- [x] Wishlist + notifikasi price drop / back in stock (WSH-001, WSH-004, WSH-005): src/services/wishlist/wishlistService.ts + src/routes/wishlist.ts (`GET/POST /api/v1/wishlist`, `PATCH/DELETE /api/v1/wishlist/:productId`); alert dipicu dari `PATCH /api/v1/admin/products/:id/price`, kolom baru `notify_price_drop`, `notify_back_in_stock`, `last_notified_price`, `last_back_in_stock_notified_at`. test: src/tests/wishlist.test.ts
- [x] Admin content: banner (CMS-001, CMS-002) dan static pages (PGE-001, PGE-002) — 2026-11-10: `GET/POST /api/v1/admin/banners`, `PATCH/DELETE /api/v1/admin/banners/:id` (jadwal `startAt`/`endAt`, `sortOrder`, `placement`, aktif/nonaktif) dan `GET/POST /api/v1/admin/pages`, `PATCH/DELETE /api/v1/admin/pages/:slug` (draft/publish, validasi slug kebab-case, tolak slug duplikat 409). Semua aksi masuk audit log
- [x] Bulk import/export produk (CAT-011): src/services/catalog/bulkService.ts + endpoint `GET /api/v1/admin/products/export?format=csv|json`, `GET /api/v1/admin/products/import-template`, `POST /api/v1/admin/products/import` (upsert by slug, maksimal 5000 baris, laporan `skipped` per baris). test: src/tests/bulk.test.ts
- [x] SEO produk dan halaman (CAT-010, PGE-004): src/services/catalog/seoService.ts + `GET /api/v1/products/:slug/seo`, `GET /api/v1/pages/:slug/seo`, `GET /api/v1/admin/products/seo-audit`, `PUT /api/v1/admin/products/:id/seo`; output meta title/description, canonical, JSON-LD Product dan WebPage, plus warning panjang meta. test: src/tests/seo.test.ts
- [x] COD via Tembus (LOG-007) dan asuransi (LOG-008)
- [x] Laporan keuangan dasar (FIN-001): src/services/finance/financeService.ts + `GET /api/v1/admin/finance/summary?from&to&format=json|csv` (gross, diskon, ongkir, refund, net, AOV, breakdown status dan bulanan). test: src/tests/finance.test.ts
- [x] Notifikasi SMS/OTP provider: src/services/notifications/smsService.ts (Twilio, Fonnte, fallback log) dipakai `otpService` yang menyimpan kode 6 digit di Redis dengan TTL 300 detik dan menghapus kode setelah verifikasi sukses. test: src/tests/sms.test.ts, src/tests/otp.test.ts. Verifikasi akhir: `npx tsc --noEmit` exit 0, `npm test` 251/251 lulus (194 test lama + 57 test baru)

---

## Fase 2.5: Multi Cabang (di luar PRD, terkait INV-007 / INV-008)

Kebutuhan ini belum ada di PRD v2.0.0. PRD hanya menyebut `INV-007 Multi-warehouse support` dan `INV-008 Stock transfer between warehouses` sebagai P2, dan keduanya sudah terdaftar di Phase 4 di bawah.

Model bisnisnya bukan "sistem memilih cabang terdekat", tetapi **cabang berperan sebagai penjual di dalam satu brand**. Customer melihat produk, memilih cabang mana yang menjualnya (hanya cabang yang stoknya ada yang muncul), lalu opsi pengiriman ditentukan otomatis oleh jarak antara lokasi customer dan cabang yang dia pilih:

- Customer di Jakarta memilih produk dari cabang Jakarta: opsi instan dari paket ondemand TEMBUS muncul karena masih dalam radius.
- Customer di Yogyakarta memilih produk dari cabang Jakarta: yang muncul hanya opsi 3PL karena jaraknya jauh melewati batas ondemand.
- Customer di Jakarta memilih produk dari cabang Tangerang: opsi ondemand muncul lagi selama masih dalam radius yang diizinkan paket ondemand.

Jadi jarak tidak dipakai untuk memilih cabang, tetapi untuk menentukan mode pengiriman setelah cabang dipilih. Order selalu dikirim dari cabang yang dipilih, tidak ada pickup di cabang, dan produk dari cabang yang stoknya kosong tidak ditampilkan sama sekali.

Kondisi kode saat ini: `store_locations` hanya berisi nama, telepon, alamat, kota, provinsi, kode pos, `is_default`, `is_active` (tanpa koordinat, tanpa kode, tanpa tipe). Stok masih satu kolam di `product_variants.stock` / `reserved_stock`, reservasi lewat `inventoryService.reserveStock(variantId, quantity, referenceId)`. `users.role` baru mengenal `admin` dan `customer`. `shipments` hanya punya `provider` dan `mode` (`ondemand` / `aggregator`).

Kabar baiknya, sisi logistik sudah siap: `logisticProvider.ts` menerima `origin.latitude` / `origin.longitude` dan `destination.latitude` / `destination.longitude` di `RateCalculationParams`, `tembusOnDemandProvider` mengembalikan `distance_km` dari quote dan sudah memetakan `mode: 'ondemand'`, sedangkan `tembusAggregatorProvider` sudah memetakan `mode: 'aggregator'` dengan carrier default `jne` dan `jnt`. Jadi pemilihan mode bisa memakai kontrak yang sudah ada, bukan bikin jalur baru.

### Keputusan terbuka yang masih tersisa

- **OD-A Cart lintas cabang.** Satu keranjang bisa berisi dua produk dari dua cabang berbeda (misalnya powerbank dari cabang Jakarta dan kabel dari cabang Bandung). Konvensi marketplace adalah tiap cabang jadi shipment sendiri, tetapi ini belum diputuskan. BR-009 mengasumsikan satu cabang = satu grup shipment supaya keputusan ini bisa diubah tanpa membongkar `order_items`.
- **OD-B Opsi ganda dalam radius.** Kalau customer masih dalam radius ondemand, apakah 3PL tetap ditampilkan sebagai pembanding harga, atau hanya ondemand saja? BR-008 mengembalikan daftar mode, jadi keputusan ini cukup diambil di UI atau lewat konfigurasi `shipping.showAggregatorWithinRadius`.
- **OD-C Perilaku tanpa koordinat.** Kalau customer tidak menekan "gunakan lokasi saat ini" dan alamatnya tidak bisa digeocode, apakah ondemand disembunyikan (hanya 3PL) atau checkout diblokir? Diasumsikan hanya 3PL yang muncul, dengan catatan di UI bahwa ondemand butuh titik lokasi.

### Keputusan yang sudah final

- Order dikirim dari cabang yang dipilih customer. Tidak ada pickup.
- Produk dari cabang tanpa stok tersedia tidak ditampilkan di halaman produk, jadi customer tidak bisa memilih cabang yang tidak bisa memenuhi.
- `store_locations` wajib punya koordinat. Di sisi admin cukup tombol "gunakan lokasi saat ini" (opsional, lewat browser geolocation) plus form alamat manual. Sisi customer tidak perlu koordinat sama sekali, cukup form alamat seperti marketplace biasa, karena template ini hanya untuk satu brand sehingga tidak ada pemilihan seller lintas brand.
- Pusat tetap mengelola stoknya sendiri, dan akun pusat mendapat analitik lengkap untuk seluruh penjualan, retur, dan performa tiap cabang.

### Baris kerja

- [x] BR-001 Master cabang dan koordinat: tambah kolom `code` (unik), `type` (`pusat` / `cabang`), `latitude` dan `longitude` (`decimal(10,7)`, nullable di DB tetapi wajib diisi untuk cabang yang `ondemandEnabled`), `ondemandEnabled` (boolean default true), `serviceRadiusKm` (override batas radius paket ondemand, nullable), `operatingHours` (jsonb), `managerName`, dan `isOnline` (tampil sebagai penjual di storefront) ke `store_locations`. Tambah index `code` dan index gabungan `type` + `is_active`. Migrasi mengisi `type = 'pusat'` untuk baris `is_default = true` yang ada plus `code` deterministik supaya data lama tetap valid. Kerja: `src/db/schema.ts` (tabel `storeLocations`), `drizzle/0007_branches.sql` (DDL idempotent + backfill `PUSAT` / `CBG-<8hex>`), index `store_locations_code_uidx` dan `store_locations_type_active_idx`. Cek runtime `getTableConfig` mengonfirmasi 12 kolom baru/berubah beserta dua index tersebut
- [x] BR-002 Role `branch_admin` dan scoping user: perluas komentar `users.role` dan tambah kolom `users.branch_id` (nullable, FK ke `store_locations`, wajib terisi bila `role = 'branch_admin'`). Role `admin` tetap milik pusat dan melihat semua cabang. Perluas `requireRole()` di `src/middleware/auth.ts` agar mengenal `branch_admin`, dan tambah `requireBranchScope()` yang memaksa `users.branch_id` cocok dengan cabang pada request serta menolak `branch_admin` tanpa `branch_id` dengan 403. Kerja: `users.branchId` + `users_branch_idx` di `src/db/schema.ts`, `src/services/branch/branchScope.ts` (`resolveBranchAccess`, `branchIdOf`, `BRANCH_ADMIN_ROLE`, `PUSAT_ADMIN_ROLE`), `requireBranchScope()` di `src/middleware/auth.ts` yang menyimpan hasil ke `c.set('branchScope')`. test: `src/tests/branchScope.test.ts` 10/10 lulus
- [x] BR-003 Tabel `branch_inventory`: `id`, `branchId` (FK `store_locations`), `variantId` (FK `product_variants`), `stock`, `reservedStock`, `lowStockThreshold`, `updatedAt`, dengan unique constraint `(branchId, variantId)` dan index `variantId`. Backfill: seluruh `product_variants.stock` dipindah ke baris cabang bertipe `pusat` agar angka tidak hilang, lalu `product_variants.stock` dipertahankan sebagai total agregat yang dihitung ulang dan bukan lagi sumber kebenaran. Kerja: `branchInventory` di `src/db/schema.ts`, DDL + backfill `INSERT ... SELECT ... CROSS JOIN` di `drizzle/0007_branches.sql` dengan `ON CONFLICT DO NOTHING`, index `branch_inventory_branch_variant_uidx`, `branch_inventory_variant_idx`, `branch_inventory_branch_idx`. Catatan: `drizzle/meta/_journal.json` hanya mencatat `0000` dan `0006`, jadi `0007` belum ter-journal dan `db:push` tetap jalur yang dipakai lokal
- [x] BR-004 Service stok per cabang: `src/services/branch/branchStockService.ts` (path final, bukan `services/inventory`) berisi fungsi murni yang bisa dites tanpa DB, yaitu `resolveAvailable(row)`, `canFulfill(row, qty)`, `stockStatus(row)`, `groupItemsByBranch(items)`, `planReservation(rows, items)`, `applyReserve(rows, plan)`, dan `applyRelease(rows, plan)`. Menolak kuantitas negatif atau nol, menolak reservasi melebihi stok tersedia lewat `planReservation` (baris duplikat dijumlahkan dulu sebelum dicek), mengembalikan baris cabang yang tidak dikenal sebagai `BranchStockError` dengan code `BRANCH_STOCK_NOT_FOUND`. Release di-clamp di nol supaya panggilan ganda tidak membuat `reservedStock` negatif. test: `src/tests/branchStock.test.ts` 15/15 lulus
- [x] BR-005 Endpoint admin cabang: `GET/POST /api/v1/admin/branches`, `GET/PATCH/DELETE /api/v1/admin/branches/:id`, plus `POST /api/v1/admin/branches/:id/location` yang menerima `latitude` dan `longitude` dari tombol "gunakan lokasi saat ini" di UI. Validasi `code` unik, koordinat dalam rentang `-90..90` dan `-180..180`, tolak mengaktifkan `ondemandEnabled` pada cabang tanpa koordinat, tolak menonaktifkan cabang yang masih punya stok tersedia, semua aksi masuk audit log. `src/services/config/storeLocations.ts` diperluas, bukan diganti, supaya pemanggil lama di `settings.ts:213` (origin pengiriman) tetap jalan. Kerja: `src/services/branch/branchValidation.ts` (normalisasi kode, rentang koordinat, ondemand wajib koordinat, guard deaktivasi dan delete cabang default), `storeLocations.ts` ditambah field cabang + `setStoreLocationCoordinates()`, `src/routes/branches.ts` (`adminBranchRoutes`) di-mount di `src/app.ts`, tipe `branch_admin` dan `branchScope` di `src/types/hono.d.ts`. test: `src/tests/branchValidation.test.ts` 15/15 lulus, `src/tests/branchRoutes.test.ts` 8/8 lulus
- [x] BR-006 Endpoint stok milik cabang sendiri: `GET /api/v1/branch/inventory`, `PATCH /api/v1/branch/inventory/:variantId` (adjust stock, alasan wajib), `GET /api/v1/branch/inventory/logs`. Semua query dan tulisan memakai `branch_id` dari sesi, bukan dari body, dan menolak 403 bila `branch_admin` mencoba menyentuh cabang lain. Kerja: `src/services/branch/branchInventoryService.ts` (`listBranchInventory`, `adjustBranchStock` yang menyinkronkan ulang agregat `product_variants.stock`, `listBranchInventoryLogs`), kolom `inventory_logs.branch_id` + `inventory_logs_branch_idx` (DDL di `drizzle/0007_branches.sql`), `branchRoutes` dengan `requireBranchScope()` di `src/routes/branches.ts`, token mock `branch_admin` membawa `branchId` di login dan `authMiddleware`. test: 8/8 lulus di `src/tests/branchRoutes.test.ts`
- [x] BR-007 Ketersediaan cabang di halaman produk: `GET /api/v1/products/:slug/branches?lat&lng` mengembalikan daftar cabang yang **hanya** stok tersedianya di atas nol, lengkap dengan `code`, `name`, `city`, `stockStatus` (`in_stock` / `low_stock`), `distanceKm` bila koordinat customer dikirim, `ondemandAvailable`, dan `availableModes`. Cabang tanpa stok atau `isOnline = false` tidak boleh ikut, dan daftar kosong dikembalikan sebagai `{ branches: [], reason: 'no_branch_has_stock' }` bukan 404 supaya storefront bisa menampilkan pesan yang benar. Kerja: `src/services/branch/branchAvailabilityService.ts` (`listProductBranchAvailability` untuk query agregat `sum(greatest(stock - reserved_stock, 0))` per cabang, plus `assembleBranches` murni untuk filter, `stockStatus`, jarak, dan mode), route didaftarkan di `src/routes/products.ts` sebelum `/:slug`, setting `shipping.showAggregatorWithinRadius` di `src/services/config/settings.ts` + default di `src/db/seed.ts`. test: `src/tests/branchAvailability.test.ts` 18/18 lulus
- [x] BR-008 Penentu mode pengiriman: `src/services/shipping/deliveryModeService.ts` dengan fungsi murni `resolveDeliveryModes({ distanceKm, ondemandEnabled, serviceRadiusKm, hasDestinationCoords })` yang mengembalikan kombinasi `ondemand` dan `aggregator`. Aturan: tanpa koordinat tujuan hanya `aggregator`, di luar `serviceRadiusKm` hanya `aggregator`, di dalam radius dan `ondemandEnabled` menghasilkan `ondemand` (plus `aggregator` bila `shipping.showAggregatorWithinRadius` aktif). Di route, mode `ondemand` baru dianggap tersedia setelah `tembusOnDemandProvider.calculateRate` berhasil dengan koordinat cabang sebagai origin, jadi kalau TEMBUS menolak cakupan, `ondemand` otomatis gugur dan `aggregator` tetap jalan. test: `src/tests/deliveryMode.test.ts` 20/20 lulus. Catatan: cek cakupan courier lewat `calculateRate` baru dipasang di BR-010, jadi sampai itu selesai `ondemandAvailable` masih murni berbasis jarak
- [x] BR-009 Kolom sumber di order: tambah `orders.fulfillment_source` (`branch` / `multi_branch`), `order_items.source_branch_id`, `order_items.fulfillment_mode` (`ondemand` / `aggregator`), dan `shipments.origin_branch_id`. Snapshot cabang (`code`, `name`, `city`) ikut ditulis ke `product_snapshot` supaya riwayat order tidak berubah saat master cabang diedit. Satu cabang menghasilkan satu baris `shipments` sesuai OD-A. Kerja: kolom dan index di `src/db/schema.ts` plus DDL idempoten di `drizzle/0007_branches.sql`, helper murni dan pembacaan stok di `src/services/branch/orderSourceService.ts` (`buildBranchSnapshot`, `distinctBranchIds`, `resolveFulfillmentSource`, `assertFulfillmentMode`, `planBranchShipments`, `assertBranchCanFulfill`), `orderSchema` menerima `branchId` dan `fulfillmentMode` per item, `POST /api/v1/orders` memakai stok cabang sebagai sumber kebenaran lalu menulis snapshot dan `fulfillment_source`, dan `createShipmentForOrder` memakai koordinat cabang sebagai origin dengan `originBranchId` opsional yang otomatis diturunkan dari item order di `POST /api/v1/logistics/admin/shipments`. test: `src/tests/orderSource.test.ts` 18/18 lulus
- [x] BR-010 Opsi kirim dan pemilihan 3PL: `GET /api/v1/shipping/options?branchId&addressId` mengembalikan daftar opsi per mode, yaitu ondemand lewat `tembusOnDemandProvider` dan 3PL lewat `tembusAggregatorProvider` (carrier saat ini `jne` dan `jnt`), masing-masing dengan harga dan estimasi. `POST /api/v1/checkout` menerima `selectedMode` dan `selectedService`; `selectedService` wajib ketika mode-nya `aggregator` (400 bila kosong atau tidak ada di daftar opsi), sedangkan mode `ondemand` memakai service dari daftar ondemand. Opsi yang tidak tersedia untuk cabang tersebut tidak boleh bisa dipilih. Kerja: logika murni `assembleShippingOptions` (filter mode yang diizinkan BR-008, buang `isAvailable: false`, buang cost negatif/NaN, dedupe `mode:service`, urut mode dulu lalu harga lalu nama) dan `resolveSelectedShippingOption` (tolak mode asing, cabang tanpa opsi, service di luar daftar, aggregator tanpa service) di `src/services/shipping/shippingOptionsService.ts`, `listShippingOptions` membaca cabang aktif plus kuotasi kedua provider dan mencatat provider gagal ke `unavailable[]` (reason `quote_failed`) alih-alih 500, `GET /api/v1/shipping/options` di `src/routes/shipping.ts` dengan `authMiddleware` dan `Cache-Control: no-store`, `POST /api/v1/checkout` di `src/routes/checkout.ts` mengutip ulang opsi lalu memilih satu service, order creation dipindah ke `src/services/order/orderCreateService.ts` (`createOrderWithItems`) supaya `POST /api/v1/orders` dan `POST /api/v1/checkout` tidak menyimpang, `checkoutSchema` baru di `src/validators/schemas.ts`, koordinat tujuan opsional di `orderSchema.shippingAddress` dan query `GET /options`, route `/shipping` dipasang di `src/app.ts`. Harga kirim dari opsi terpilih masuk ke `shipping_amount` dan `total_amount = items + shipping - discount`, lalu `shipping_details` menyimpan `{ mode, provider, service, name, cost }`. test: `src/tests/shippingOptions.test.ts` 20/20 lulus, total 375/375. Catatan: `user_addresses` belum punya kolom koordinat, jadi tanpa `latitude`/`longitude` tujuan hanya 3PL yang tampil (OD-C), dan cek HTTP 200 masih menunggu Postgres hidup
- [x] BR-011 Reservasi per cabang: `reserveStock` diperluas menjadi `reserveStockAtBranch(branchId, variantId, qty, referenceId)` yang menulis `branch_inventory.reserved_stock`, dan varian lama dipertahankan sebagai wrapper yang mereservasi ke cabang pusat agar test lama tetap lulus. Pelepasan reservasi saat order batal atau kedaluwarsa wajib mengembalikan angka ke cabang yang sama dengan yang dipakai saat reservasi, dan idempotent bila dipanggil dua kali. Kerja: `src/services/branch/branchReservationService.ts` (`reserveStockAtBranch`, `releaseStockAtBranch`, `loadBranchRow`, `loadReferenceLogs`, `loadProductId`, `syncReservedAggregate`), helper murni baru `findReservedBranch` dan `hasReleasedReference` plus tipe `ReservationLogLike` di `src/services/branch/branchStockService.ts`, `src/services/inventoryService.ts` sekarang hanya wrapper: `reserveStock` mereservasi ke cabang pusat lewat `getDefaultStoreLocation`, `releaseReservedStock` membaca log reservasi untuk menentukan cabang asal lalu memanggil `releaseStockAtBranch` (fallback ke pusat hanya untuk log lama tanpa `branch_id`), `getDefaultStoreLocation` di `src/services/config/settings.ts` tidak lagi memakai `.limit(1)` supaya harness test yang men-stub builder dengan promise tetap jalan, `syncReservedAggregate` melewati penulisan agregat kalau hasil sum bukan angka finite sehingga mock tidak menimpa `product_variants.reserved_stock` dengan nol palsu. Reservasi dan pelepasan menulis `inventory_logs` dengan `branchId`, `changeType` `reservation`/`release`, dan `referenceId` yang sama; pelepasan kedua untuk referensi yang sama mengembalikan `alreadyReleased: true` tanpa menulis log baru, dan `applyRelease` menjepit di nol. test: `src/tests/branchReservation.test.ts` 12 test baru, total 387/387 lulus, `inventory.test.ts` dan `integration/inventoryFlow.test.ts` tetap hijau. Catatan: belum ada jalur order yang memanggil reservasi (checkout BR-010 tidak mereservasi stok), jadi release belum dipasang di `routes/payments.ts` atau `paymentExpiry.ts`; helper-nya siap dan idempotent begitu reservasi disambungkan
- [x] BR-012 Analitik pusat lintas cabang: `GET /api/v1/admin/analytics/branches?from&to` berisi penjualan, jumlah order, jumlah item, retur dan refund, AOV, serta stok di bawah ambang per cabang, plus rollup seluruh cabang. Hanya boleh diakses role `admin` (pusat), dan `branch_admin` menerima 403. Angka retur diambil dari data refund yang sudah ada, bukan dihitung ulang dengan rumus baru. Kerja: `src/services/admin/branchAnalytics.ts` dengan `resolveAnalyticsWindow` (default 30 hari, tanggal rusak `INVALID_DATE`, rentang terbalik `INVALID_DATE_RANGE`, keduanya 400), `buildBranchAnalytics` murni, dan `branchAnalyticsReport` yang hanya mengambil baris DB. Penjualan memakai `REVENUE_STATUSES` dari finance, refund memakai `REFUND_SETTLED_STATUSES` yang sekarang diekspor dari `financeService.ts` supaya tidak ada dua daftar status, item dihitung dari `order_items.quantity`, order dihitung distinct per cabang dan distinct lagi di rollup. Refund hanya diatribusikan ke cabang kalau semua baris order itu berasal dari satu cabang; order multi cabang masuk `unallocatedRefundTotal`, refund tanpa peta cabang juga. Baris lama tanpa `source_branch_id` jatuh ke cabang pusat lewat `fallbackBranchId`, dan kalau pusat tidak ada baris itu masuk `unassignedSales` tapi tetap dihitung di rollup. Stok di bawah ambang memakai `stockStatus` BR-004 sehingga `stock - reserved_stock <= low_stock_threshold` dan nol masuk `out_of_stock`; cabang tanpa order tetap tampil dengan angka nol dan urutan pusat dulu. Route `GET /analytics/branches` ditambahkan di `src/routes/analytics.ts` dan tetap di bawah `authMiddleware` + `adminOnlyMiddleware`. test: `src/tests/branchAnalytics.test.ts` 10 test (window, cabang nol order, filter status, pembulatan AOV, alokasi refund tunggal/multi, low stock, rollup multi cabang, baris legacy, mount route plus 401/403), total 397/397 lulus. Catatan: jalur 200 butuh Postgres hidup, jadi blok ini membuktikan aturan lewat fungsi murni dan penjagaan route lewat HTTP 401/403
- [x] BR-013 Dashboard cabang: `GET /api/v1/branch/dashboard?from&to` berisi order yang bersumber cabang tersebut, jumlah item, nilai penjualan, retur, daftar stok di bawah `lowStockThreshold`, dan reservasi aktif. Semua query difilter `branch_id` dari sesi. Kerja: `src/services/branch/branchDashboard.ts` dengan `buildBranchDashboard` murni dan `branchDashboardReport` yang hanya mengambil baris DB, plus `resolveDashboardWindow` yang meneruskan aturan jendela BR-012 (default 30 hari, `INVALID_DATE` dan `INVALID_DATE_RANGE` 400). `branchId` selalu datang dari `requireBranchScope` di sesi, tidak pernah dari body. Angka penjualan, item, order distinct, retur, dan low stock memakai `buildBranchAnalytics` yang sama dengan BR-012, jadi laporan pusat dan dashboard cabang tidak bisa berbeda aturan. Refund hanya dihitung kalau semua baris order milik cabang ini; order multi cabang, baris tanpa cabang, dan baris yang menunjuk cabang di luar daftar masuk `unattributedRefundTotal`, tidak dibagi dengan asumsi. Reservasi aktif dibaca dari `branch_inventory.reserved_stock > 0`, diurutkan dari reservasi terbesar, `available` dijepit di nol. Route ditambahkan di `src/routes/branches.ts` pada grup `/branch`; admin pusat tanpa `X-Branch-Id` dapat `BRANCH_REQUIRED` 400. test: `src/tests/branchDashboard.test.ts` 13 test (cabang nol order, filter status revenue, alokasi refund tunggal/multi/legacy, low stock, reservasi, jendela tanggal, 401/403 scope, 400 BRANCH_REQUIRED, tanggal rusak), total 410/410 lulus. Catatan: jalur 200 butuh Postgres hidup, jadi blok ini membuktikan aturan lewat fungsi murni dan penjagaan scope lewat HTTP
- [x] BR-014 Transfer stok antar cabang (INV-008): tabel `stock_transfers` (`fromBranchId`, `toBranchId`, `variantId`, `quantity`, `status` `draft` / `in_transit` / `received` / `cancelled`, `requestedBy`, `approvedBy`, `shippedAt`, `receivedAt`) dengan endpoint `GET/POST /api/v1/admin/stock-transfers` dan `POST /api/v1/admin/stock-transfers/:id/approve|ship|receive|cancel`. Stok asal berkurang saat `ship`, stok tujuan bertambah saat `receive`, dan tidak ada angka yang hilang di antaranya. Kerja: `stockTransfers` di `src/db/schema.ts` plus `drizzle/0008_stock_transfers.sql` yang idempoten. `src/services/branch/stockTransferService.ts` memisahkan state machine murni (`nextStatus`, `assertTransferQuantity`, `assertDistinctBranches`, `applyShipStock`, `applyReceiveStock`) dari fungsi DB bertransaksi (`createStockTransfer`, `approveStockTransfer`, `shipStockTransfer`, `receiveStockTransfer`, `cancelStockTransfer`). Approve hanya menstempel `approvedBy` dan status tetap `draft` karena kontrak hanya mengizinkan empat status; `ship` wajib sudah approve, mengurangi `branch_inventory.stock` cabang asal dan menulis log `transfer_out`; `receive` menambah stok tujuan dan menulis log `transfer_in`; keduanya me-resync agregat `product_variants.stock`. Stok yang direservasi tidak bisa ditransfer, hanya stok tersedia. Route admin ditambahkan di `src/routes/branches.ts`; input invalid ditolak sebelum DB. test: `src/tests/stockTransfer.test.ts` 19 test (state machine penuh, kuantitas, cabang sama, konservasi stok, 401 anonim, 403 customer, 400 `INVALID_QUANTITY`, 409 `SAME_BRANCH`, 400 `BRANCH_REQUIRED`, 400 `VARIANT_NOT_FOUND`), total 429/429 lulus. Catatan: jalur 200 butuh Postgres hidup, jadi bukti di sini adalah aturan murni plus penjagaan HTTP; transfer in-transit tidak bisa dibatalkan (keputusan terbuka, cancel hanya dari `draft`)
- [x] BR-015 Seed dan dokumentasi cabang: perluas `src/db/seed.ts` dengan satu cabang pusat plus minimal dua cabang contoh yang sudah punya koordinat dan stok, dan tambahkan catatan singkat alur customer memilih cabang di dokumentasi API supaya storefront punya contoh nyata untuk dites tanpa menebak data. Kerja: data seed murni dipindah ke `src/db/seedData.ts` (`pusatBranch()`, `demoBranches()`, `demoCatalog()`, `demoInventoryRows()`, `DEMO_STOCK_BY_CODE = { PUSAT: 50, CBG-BDG: 12, CBG-SBY: 8 }`) supaya bisa dites tanpa menjalankan `seed()` saat import. `src/db/seed.ts` sekarang idempoten: upsert cabang lewat `code`, klaim baris default lama yang `code`-nya null, upsert katalog demo (`kaos-tembus-demo` / `DEMO-KAOS-001-M`, harga `149000.00`), isi `branch_inventory` dengan `onConflictDoNothing` supaya stok lokal tidak di-reset, lalu hitung ulang `product_variants.stock` dan `products.stock` dari `branch_inventory` (total 70). Cabang contoh: `CBG-BDG` Bandung (`-6.9218`, `107.6071`, radius 15) dan `CBG-SBY` Surabaya (`-7.2575`, `112.7521`, radius 20). Script `db:seed` ditambahkan ke `package.json`. `API-DOCS.md` diperluas dengan alur customer memilih cabang, format opsi pengiriman, aturan checkout, pengelolaan stok cabang, master cabang plus transfer stok, tabel kode error, dan daftar keputusan terbuka. test: `src/tests/seedBranches.test.ts` 16 test (pusat mengikuti konfigurasi brand, kode cabang lolos validasi BR-005, koordinat lengkap dan dalam jangkauan, radius positif, Bandung dan Surabaya di luar radius satu sama lain, titik nol memunculkan ondemand, katalog stabil, rencana stok cocok, pusat stok terbesar), total 445/445 lulus. Catatan: seed sengaja tidak membuat akun `branch_admin` dengan password default karena belum ada endpoint provisioning user; akun cabang masih dibuat langsung di DB (`role = 'branch_admin'`, `branch_id` terisi).
- [x] BR-016 Verifikasi akhir: `npx tsc --noEmit` exit 0, `npm test` seluruh suite lulus dengan tambahan minimal 4 file test baru (`branchStock`, `deliveryMode`, `stockTransfer`, scoping cabang), dan smoke check memastikan semua route baru ter-mount di `app.ts` (public 500 karena kredensial DB lokal, guarded 401, unknown 404). Bukti: `npx tsc --noEmit` = `TSC_EXIT=0`; `npm test` = 445 test / 51 suite / 445 pass / 0 fail / 0 cancelled / 0 skipped. File test baru dari fase cabang jauh melebihi minimum empat: `branchStock` 15, `deliveryMode` 20, `stockTransfer` 19, `branchScope` 10, ditambah `branchAvailability` 18, `orderSource` 18, `shippingOptions` 20, `checkoutApi` 4, `branchDashboard` 13, `branchReservation` 12, `branchAnalytics` 10, `branchValidation`, dan `seedBranches` 16. Smoke check lewat `createApp()` tanpa Postgres: publik `GET /api/v1/products/kaos-tembus-demo/branches` 500 `password authentication failed for user "postgres"` (route ter-mount, DB yang mati), seluruh route terjaga (`shipping/options`, `checkout`, `branch/inventory`, `branch/dashboard`, `admin/branches`, `admin/stock-transfers`) membalas 401 tanpa token dan 403 dengan token customer, validasi sebelum DB membalas 400 `BRANCH_REQUIRED` untuk shipping tanpa `branchId` dan checkout tanpa `branchId`, dan path tak dikenal membalas 404 `NOT_FOUND`. Script smoke dihapus setelah dipakai supaya tidak ikut ter-commit.

---

## Phase 3: Advanced

- [x] Flash sale: CRUD, alokasi stok, limit per user, countdown (FLS-001, FLS-002, FLS-004, FLS-005, FLS-006)
- [x] Loyalty points + tier (LTY-001..004): akun poin per user dengan saldo dan lifetime points, earn untuk purchase/review/referral, redeem dengan minimum, tier otomatis bronze/silver/gold/platinum beserta diskon dan gratis ongkir, plus ledger transaksi. Kerja: `src/services/loyalty/loyaltyService.ts` memuat aturan murni tanpa database (`DEFAULT_LOYALTY_PROGRAM` tier 0/500/2000/5000 dengan diskon 0/2/5/8 persen dan gratis ongkir mulai null/200000/150000/0, earn 1 poin per Rp1.000 plus 10 poin review dan 50 poin referral, redeem 1 poin = Rp100 minimum 50 poin), `assertLoyaltyProgramConfig` (empat tier wajib, bronze mulai 0, ambang naik ketat, diskon 0 sampai 100, urutan tidak rapi diurutkan ulang bukan ditolak), `resolveTier`, `tierBenefits`, `nextTierProgress`, `computeEarnedPoints` (pembulatan ke bawah supaya brand tidak pernah over-credit), `evaluateRedemption`, `applyTierDiscount`, `qualifiesForFreeShipping`, `applyPointDelta`, dan `LoyaltyError`. `src/services/loyalty/loyaltyRepository.ts` memegang persistensi: `getLoyaltyProgram` membaca settings `loyalty.program` dan jatuh ke default kalau isi rusak, `getLoyaltySummary` membuat akun kosong pada pembacaan pertama, `earnPoints` menolak duplikat lewat unique index (`user_id`, `source`, `reference_id`) sehingga webhook order yang diulang membalas `DUPLICATE_EARN` bukan saldo dobel, `redeemPoints` memakai syarat `balance >= points` di klausa WHERE di dalam transaksi, `adjustPoints` untuk koreksi admin (lifetime hanya bertambah, jadi tidak ada demotion), plus listing dan lookup admin. `src/routes/loyalty.ts` memasang customer `GET /loyalty/program`, `GET /loyalty`, `GET /loyalty/transactions`, `POST /loyalty/redeem` dan admin `GET /loyalty/accounts`, `GET /loyalty/accounts/:userId`, `POST /loyalty/accounts/:userId/earn`, `POST /loyalty/accounts/:userId/adjust`, `GET` dan `PUT /loyalty/program` di bawah feature gate `loyalty`. Skema: tabel `loyalty_accounts` dan `loyalty_transactions` di `src/db/schema.ts` plus `drizzle/0010_loyalty.sql` yang idempoten. Settings: `loyaltyProgramSettingSchema` didaftarkan di `settingValidators`. test: `src/tests/loyalty.test.ts` 61 test (validasi program, resolusi tier inklusif di ambang, benefit, progres, earn, redeem, diskon dan gratis ongkir, delta poin), `databaseSchema.test.ts` ditambah 2 test, total 562/562 lulus di 51 suite. Smoke tanpa Postgres: semua route loyalty ter-mount, path asing 404, `GET /api/v1/loyalty` tanpa token 401, `GET /api/v1/admin/loyalty/accounts` tanpa token 401, dan `GET /api/v1/loyalty/program` membalas 200 dengan nilai default karena `getSettingValue` jatuh ke fallback saat DB tidak bisa dihubungi. Catatan: earn belum otomatis dari checkout, review, atau referral, dan diskon tier belum dipotong di checkout; helper-nya sudah ada dan teruji, penautan menyusul di modul referral dan wallet. Poin belum kedaluwarsa (LTY-005) dan reward ulang tahun (LTY-006) belum ada karena keduanya P2 di luar daftar Phase 3.
- [x] Referral program (RFR-001..005): kode referral unik per user, link siap bagikan, hadiah untuk pengundang dan yang diundang, plus pelacakan status referral. Kerja: `src/services/referral/referralService.ts` memuat aturan murni tanpa database (`DEFAULT_REFERRAL_PROGRAM` 50 poin referrer, 25 poin referee, tanpa batas jumlah), `assertReferralProgramConfig`, `generateReferralCode` (deterministik dari seed dan nomor percobaan, delapan karakter dari alfabet `ABCDEFGHJKMNPQRSTUVWXYZ23456789` tanpa I, L, O, 0, 1, memakai FNV-1a lalu xorshift32), `normalizeReferralCode` (huruf besar, spasi dan tanda hubung dibuang), `buildReferralLink`, `parseReferralCodeFromInput` (menerima kode telanjang atau link penuh), `canTransitionReferral`, `assertReferralTransition`, `assertCanQualify`, `assertCanReward`, `assertRefereeEligible` (menolak self referral, akun yang sudah pernah memakai kode, dan akun yang sudah punya order lunas), `assertWithinReferralLimit`, `referralRewards`, dan `ReferralError`. `src/services/referral/referralRepository.ts` memegang persistensi: `getOrCreateReferralCode` membuat kode pada pembacaan pertama dengan retry `onConflictDoNothing` sampai delapan percobaan, `getReferralDashboard` mengembalikan kode, link, program, hitungan status, dan daftar referral, `claimReferral` menyalin nominal hadiah ke baris referral saat klaim supaya perubahan program tidak mengubah janji lama, `qualifyReferral` memverifikasi order milik referee yang sudah lunas lalu memberi poin kedua pihak lewat `earnPoints` dengan `reference_id` `<referralId>:referrer` dan `<referralId>:referee` lalu menandai `rewarded` (kalau ledger gagal di tengah, baris tetap `qualified` dan panggilan berikutnya melanjutkan dari langkah hadiah), `cancelReferral` hanya untuk `pending` dan `qualified`, serta listing dan lookup admin memakai alias join ke `users` untuk email kedua pihak. `earnPoints` di `loyaltyRepository.ts` menerima override `points` eksplisit, jadi nominal hadiah berasal dari `referral.program` bukan dari aturan earn loyalty. `src/routes/referral.ts` memasang publik `GET /referrals/program`, customer `GET /referrals/me`, `GET /referrals`, `GET /referrals/inbound`, `POST /referrals/claim`, dan admin `GET /referrals`, `GET /referrals/:id`, `POST /referrals/:id/qualify`, `POST /referrals/:id/cancel`, `GET` dan `PUT /referrals/program` di bawah feature gate `referral`. Skema: tabel `referral_codes` dan `referrals` di `src/db/schema.ts` plus `drizzle/0011_referral.sql` yang idempoten, dengan unique index `referrals_referee_idx` supaya satu akun hanya bisa direferensikan sekali. Settings: `referralProgramSettingSchema` dan `referral.baseUrl` didaftarkan di `settingValidators`, feature flag `referral` ditambahkan ke `DEFAULT_FEATURE_FLAGS`. test: `src/tests/referral.test.ts` 47 test (validasi program, generasi kode deterministik dan alfabet, normalisasi kode, link dan parsing, transisi status, gerbang kelayakan referee, batas referral, payload hadiah), `databaseSchema.test.ts` ditambah 2 test, total 611/611 lulus di 51 suite. Smoke tanpa Postgres: semua route referral ter-mount, path asing 404, `GET /api/v1/referrals/program` membalas 200 dengan nilai default, dan `GET /referrals/me`, `GET /referrals`, `POST /referrals/claim`, `GET /admin/referrals`, `GET /admin/referrals/program` tanpa token membalas 401. Catatan: hadiah referee belum otomatis dari webhook pembayaran, masih lewat verifikasi admin; leaderboard (RFR-006) belum ada karena P2; kode belum bisa diregenerasi sendiri oleh customer.
- [x] Store credit wallet (WLT-001..003): saldo, bayar order dari saldo, cashback, dan riwayat transaksi. Kerja: `src/services/wallet/walletService.ts` memuat aturan murni tanpa database dan tanpa jam. Uang dihitung sebagai integer sen (`toCents`, `formatMoney`) supaya tidak ada drift pembulatan pada decimal string, dan nominal dengan lebih dari dua desimal ditolak lewat `INVALID_AMOUNT` bukan dibulatkan diam-diam. Isi lain: `assertWalletAmount`, `assertWalletBalance`, `assertWalletType`, `assertWalletDirection`, `applyWalletDelta` (satu-satunya aturan yang bisa gagal adalah debit melebihi saldo, dibalas 409 `INSUFFICIENT_BALANCE` supaya wallet tidak pernah negatif), `isAdjustableType` (hanya `adjustment` yang boleh memilih arah sendiri, tipe lain membawa arah tetap), `resolveWalletProgram` dengan `DEFAULT_WALLET_PROGRAM` (`cashbackPercent` 0 karena tarif adalah keputusan bisnis bukan karangan modul, `cashbackMaxAmount` null, `minimumPayment` 0, `currency` IDR), `computeCashback` (persen dari total order, dibulatkan ke bawah ke rupiah utuh lalu dipotong cap), `evaluateWalletPayment` (melaporkan `shortfall` alih-alih melempar supaya storefront bisa menampilkan kekurangan), `assertWalletPaymentPossible`, dan `WalletError`. `src/services/wallet/walletRepository.ts` memegang persistensi: `getWalletProgram` membaca settings `wallet.program` dan jatuh ke default kalau isi rusak, `getOrCreateWallet` membuat baris wallet pada pemakaian pertama (unique index di `user_id` membuat retry aman), `recordMovement` menulis satu baris `wallet_transactions` dengan `balance_before` dan `balance_after` dari RETURNING sehingga ledger bisa direkonstruksi terhadap saldo, debit menaruh syarat `balance >= amount` di klausa WHERE bukan pada nilai yang dibaca sebelumnya sehingga dua pembayaran bersamaan tidak bisa sama-sama lolos, dan unique index `wallet_tx_wallet_type_reference_idx` pada (`wallet_id`, `type`, `reference_id`) menolak pencatatan kedua untuk referensi yang sama (Postgres membolehkan banyak NULL sehingga topup dan adjustment admin tidak terbatasi). `payOrderWithWallet` mewajibkan order milik pemanggil dan berstatus `pending`/`waiting_payment`/`unpaid`, melunasi total penuh (tidak ada pembayaran sebagian yang meninggalkan piutang menggantung), menandai order `paid` dengan `paymentDetails.gateway = 'wallet'`, membalik debit dengan baris `refund` kalau update order gagal, lalu memberi cashback tanpa membatalkan pembayaran kalau penulisan cashback gagal (referensi id membuat percobaan ulang idempoten). Selain itu `creditWallet`, `debitWallet`, `creditOrderCashback` untuk order yang lunas lewat gateway lain, `getWalletSummary`, `listWalletTransactions`, `listWallets`, `getWalletForAdmin`, `adjustWallet`, dan `previewWalletPayment`. `src/routes/wallet.ts` memasang customer `GET /wallet`, `GET /wallet/program`, `GET /wallet/transactions`, `POST /wallet/preview`, `POST /wallet/pay` dan admin `GET /admin/wallets`, `GET` dan `PUT /admin/wallets/program`, `POST /admin/wallets/:userId/credit`, `POST /admin/wallets/:userId/adjust`, `GET /admin/wallets/:userId`, `POST /admin/orders/:orderId/cashback` di bawah feature gate `wallet`. Skema: unique index ditambahkan di `src/db/schema.ts` plus `drizzle/0012_wallet_ledger.sql`, dan validator `wallet.program` di `src/services/config/settings.ts`. Verifikasi: `tsc --noEmit` exit 0, `src/tests/wallet.test.ts` 46 test lulus, `databaseSchema.test.ts` 19 test lulus, total `npm test` 659 test di 51 suite tanpa gagal, dan smoke membuktikan `GET /api/v1/wallet/program` 200 dengan nilai default, seluruh route terlindungi 401 tanpa token, dan path tidak dikenal 404. Keputusan terbuka: checkout belum memakai wallet (customer baru bisa membayar lewat `POST /wallet/pay` setelah order dibuat), belum ada endpoint topup mandiri karena butuh integrasi gateway, cashback otomatis hanya berjalan pada pembayaran wallet sementara order gateway lain memakai endpoint admin cashback, dan saldo belum punya kedaluwarsa.
- [ ] Live chat customer ↔ admin (RTC-003): BELUM, baru kerangka. `src/routes/realtime.ts` memuat SSE `/orders/:orderId/stream` dan `src/services/realtime/realtimeService.ts` memuat `realtimeHub`, tetapi `realtimeRoutes` tidak di-mount di `src/app.ts` (grep `realtime` pada app.ts nol hasil) dan `broadcastOrderStatus` tidak dipanggil dari mana pun, jadi belum ada pesan yang bisa mengalir. Tidak ada tabel percakapan, pesan, lampiran, status baca, antrean admin, maupun endpoint chat.
- [~] Analytics lanjutan + laporan rekonsiliasi (FIN-002..004): SEBAGIAN. Yang ada: `GET /api/v1/admin/finance/summary?from&to&format=json|csv` lewat `computeFinancialSummary`, `computeMargin`, `buildFinanceCsv` di `src/services/finance/financeService.ts`, plus `GET /api/v1/admin/dashboard`, `/reports/sales`, `/reports/products`, dan `/analytics/branches` di `src/routes/analytics.ts`. Yang belum: rekonsiliasi pembayaran terhadap order dan refund, laporan settlement per gateway, laporan pajak, ekspor jurnal, deteksi selisih, dan penjadwalan laporan. Catatan penting: ID `FIN-002..004` tidak ada di `brand-store-prd/PRD-Brand-Store-Template.md` (hanya `FIN-001`), jadi rincian cakupan baris ini tidak bisa diverifikasi ke PRD dan tidak dikarang di sini.
- [~] Optimasi API untuk mobile: SEBAGIAN. Amplop respons seragam `{ success, data, requestId }` dan `{ success:false, error:{...} }` di `src/utils/response.ts`, header `x-correlation-id` serta `X-RateLimit-Limit` dan `X-RateLimit-Remaining` diekspos di `src/app.ts`, dan batas `limit` dipasang di 12 endpoint (admin, branches, loyalty, notifications, referral, reviews, wallet). Yang belum: pagination cursor, ETag dan `If-None-Match`, kompresi gzip/brotli (tidak ada dependency compression di `package.json`), pemilihan field (`fields=`), serta endpoint batch atau agregat khusus mobile. `Cache-Control: no-store` baru dipasang puntung di `products.ts` dan `shipping.ts`, belum ada strategi cache bertingkat.
- [ ] Abandoned cart recovery (CRT-009): BELUM. Tabel `carts` dan `cart_items` beserta `carts.updatedAt` sudah ada di `src/db/schema.ts`, tetapi `src/services/cartService.ts` masih menyimpan isi cart di `Map` memori (`memoryCarts`) dan tidak menyentuh kedua tabel itu, jadi tidak ada data idle yang bisa dipindai. Belum ada job deteksi keranjang terbengkalai, status abandoned, token pemulihan, maupun email atau notifikasi pengingat.
- [ ] Admin 2FA TOTP (AUT-012): BELUM. Yang tersedia hanya OTP SMS untuk customer di `src/services/otp/otpService.ts` (kode 6 digit di Redis dengan TTL 300 detik dan `OTP_DEV_BYPASS`), dan itu faktor yang berbeda dari TOTP serta tidak terpasang di login admin (`src/routes/auth.ts` tidak punya rute otp, 2fa, atau mfa). Belum ada secret TOTP, URI otpauth, QR, verifikasi dengan toleransi waktu, recovery code, endpoint enrollment, maupun langkah kedua saat login admin.
- [~] Moderasi gambar/teks otomatis (MOD-003, MOD-004): SEBAGIAN, dan yang ada masih manual. `GET /api/v1/admin/reviews`, `PATCH /api/v1/admin/reviews/:id/visibility`, `POST /api/v1/admin/reviews/:id/reply`, `GET /api/v1/admin/review-reports`, dan `POST /api/v1/admin/review-reports/:id/resolve` di `src/routes/reviews.ts` plus `listReviewsForModeration`, `setReviewVisibility`, `resolveReviewReport` di `src/services/reviews/reviewService.ts` memberi antrean moderasi manual. Yang belum: deteksi NSFW untuk gambar (MOD-003 nol), filter kata kasar otomatis, skor keyakinan, penolakan sebelum konten tayang, dan eskalasi otomatis. Jadi MOD-004 baru tercakup secara manual oleh admin.
- [~] Banner analytics (CMS-004) dan targeting (CMS-003): SEBAGIAN. Banner CRUD, jadwal tayang (`isActive`, `startAt`, `endAt`, `isBannerLive`) dan targeting per halaman lewat `placement` sudah ada di `src/services/content/bannerService.ts` dengan `GET /api/v1/banners?placement=...` serta `POST` dan `DELETE /api/v1/admin/banners`. Yang belum: targeting segmen user (baru atau berulang, tier, wilayah), pencatatan view dan click, agregasi CTR, laporan per banner, serta tabel event banner. CMS-003 baru sebagian (halaman) dan CMS-004 nol.
- [ ] Load test: target p95 < 200ms, 10.000+ concurrent user: BELUM. Tidak ada skrip k6, artillery, atau sejenisnya (grep `k6` dan `loadTest` nol di `src`), tidak ada skenario beban, tidak ada ambang SLA yang diuji, dan belum ada hasil p95 maupun bukti 10.000 concurrent user.

---

## Phase 4: Enterprise

- [ ] Multi-warehouse inventory (INV-007, INV-008)
- [ ] Pricing engine lanjutan: dynamic, tiered, customer group (PRC-002..004)
- [ ] Aggregator logistik multi-provider + rate comparison + failover (AGG-001..004)
- [ ] Adapter Stripe / DOKU / BNPL
- [ ] Rekomendasi produk AI
- [ ] Marketing automation + email campaign
- [ ] Granular admin permission scopes (AUT-013)
- [ ] Scheduled email report (ADM-005)
- [ ] A/B testing banner (CMS-005)

---

## Keamanan & Operasional (lintas phase)

- [ ] Enkripsi field sensitif AES-256, TLS 1.3
- [ ] PII masking di log dan admin view
- [x] CSP header, sanitasi input, proteksi CSRF untuk web — CSP + security header, input sanitization middleware, dan CSRF protection middleware DONE
- [ ] IP allowlist untuk endpoint admin
- [ ] Monitoring: four golden signals + alert threshold
- [ ] OpenTelemetry tracing
- [ ] Backup & restore database terjadwal
- [ ] Compliance check: UU ITE, UU PDP (dan GDPR bila ada customer EU)
- [ ] Ganti password admin default setelah seed

---

## Brand Onboarding (dikerjakan per brand baru)

Belum ada satu pun item yang bisa dieksekusi karena template belum matang (cart, checkout, payment, logistik masih kosong).

- [ ] Clone template ke repo baru milik brand
- [ ] Isi `.env` (URL, DB, Redis, storage, JWT key, kunci payment & Tembus, brand defaults)
- [ ] `bun run db:migrate` lalu `bun run db:seed`
- [ ] Login admin, ganti password, isi brand profile + theme tokens
- [ ] Set store location (alamat asal kirim & pickup) dan samakan dengan akun Tembus
- [ ] Atur tax, shipping default, metode pembayaran, payment expiry
- [ ] Aktifkan modul yang dibutuhkan brand (feature flags)
- [ ] Input kategori, produk, banner, halaman About / FAQ / Terms / Privacy
- [ ] Client menghubungkan FE ke API + `GET /api/v1/store/config`
- [ ] Daftarkan webhook payment dan Tembus, pastikan URL publik bisa diakses
- [ ] Pindah sandbox → production (Midtrans, Xendit, Tembus)
- [ ] Setup domain + TLS
- [ ] Smoke test: register → cart → checkout sandbox → webhook paid → admin buat AWB → tracking → delivered → review
- [ ] Serah terima ke brand (akun admin, dokumentasi, kontak support)

---

## Rekap Progress

Dihitung dari 188 item checkbox di dokumen ini (recount 2026-11-15; angka 171 sebelumnya sudah usang).

| Status | Jumlah | Arti |
|---|---|---|
| `[x]` DONE | 147 | kode dipakai + lulus unit test / bukti perintah |
| `[~]` PARTIAL | 6 | sebagian sub-item sudah ada |
| `[ ]` BELUM | 35 | belum dikerjakan |

Progres nyata: Phase 0, Phase 1, Phase 2, dan Fase 2.5 selesai; Phase 3 baru empat baris penuh (flash sale, loyalty, referral, wallet) dan empat baris partial (analytics keuangan, optimasi API mobile, moderasi manual, banner placement). Sisa pekerjaan terbesar ada di Phase 4 dan pada baris Phase 3 yang masih kosong: live chat, abandoned cart, 2FA TOTP admin, banner analytics, dan load test.

### Bukti perintah terakhir

```
$ cd brand-store-app && npx tsc --noEmit
[tsc exit: 0]

$ cd brand-store-app && npx prettier --check "src/**/*.ts"
Checking formatting...
All matched files use Prettier code style!
[prettier exit: 0]

$ cd brand-store-app && npm run lint
Oops! Something went wrong! :(
ESLint: 10.14.0
You are linting "src/**/*.ts", but all of the files matching the glob pattern "src/**/*.ts" are ignored.
[lint exit: 2]   <-- gate lint belum berfungsi, lihat catatan item ESLint di atas

$ cd brand-store-app && npm test
1..17
# tests 76
# suites 14
# pass 76
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 1420.0326
[test exit: 0]
```

Smoke test HTTP nyata (29/29) dan verifikasi migrasi + seed tercatat lengkap di `AUDIT-REPORT.md` §3. Smoke test belum bisa dijalankan ulang sekarang karena kredensial `postgres` lokal belum diketahui (lihat blocker di bawah).

### Kebutuhan input dari manusia (agar tidak lupa)

Dicatat 2026-11-10. Item `[~]` yang butuh data, kredensial, atau keputusan manusia. Tanpa ini item tidak boleh dinaikkan jadi `[x]`.

**A. Logistik Tembus**

1. Baris 125 label PDF: pastikan `/api/resi/render/{awb}` mengembalikan byte PDF atau JSON berisi URL, nama field URL, kebutuhan auth, dan ada tidaknya label untuk on-demand. Sertakan satu contoh respons asli.
2. Baris 126 pickup: path, method, body, dan contoh respons endpoint pickup partner Tembus. Kalau hanya lewat dashboard, konfirmasi supaya dicatat sebagai prosedur manual.
3. Kredensial asli: `TEMBUS_API_KEY`, `TEMBUS_AGGREGATOR_TOKEN`, `TEMBUS_WEBHOOK_SECRET`, dan kepastian base URL staging vs production.

**B. Item `[~]` lain di repo ini (tidak butuh data manusia, tinggal dikerjakan)**

| Baris | Item | Sisa pekerjaan |
|---|---|---|
| 30 | Migration users | tabel `user_sessions`, `user_addresses` |
| 32 | Migration katalog | tabel `product_variants`, `product_images` |
| 34 | Migration order | tabel `order_logs` |
| 37 | Migration promo | tabel `flash_sales`, `flash_sale_items` |
| 41 | ~~Migration konten~~ | selesai 2026-11-10 lewat `0002_admin_logs.sql` dan `0004_content.sql` |
| 132 | Dashboard admin | seri data chart dari backend |
| 143 | ~~Setting tax/shipping/expiry~~ | sudah selesai 2026-11-10, lihat CFG-003/CFG-004 |
| 144 | ~~Feature flags~~ | selesai 2026-11-10: CRUD, endpoint publik, dan penegakan lewat `featureGate` pada modul promos |
| 155 | Unit test coverage | ukur persentase coverage |
| 156 | Integration test | suite integrasi penuh, bukan hanya satu smoke script |
| 219 | Keamanan web | sanitasi input dan proteksi CSRF |

**C. Blocker lingkungan**

Butuh password atau URL `DATABASE_URL` yang benar untuk PostgreSQL lokal. Semua bukti DB sejak 2026-11-10 memakai cluster sementara port 55432 karena `.env` masih ditolak. Detail ada di bagian Blocker lingkungan di bawah.

### Blocker lingkungan

1. Kredensial `postgres` lokal belum diketahui (`password authentication failed`), jadi verifikasi DB memakai cluster sementara port 55432.
2. Bun tidak terpasang, runtime memakai Node.
3. Docker tidak terpasang, `Dockerfile`/`docker-compose.yml` belum bisa diuji.
4. MinIO tidak berjalan, `checks.storage` selalu `down`.













