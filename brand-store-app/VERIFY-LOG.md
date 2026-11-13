## Order Verification Log

### Executed on: 2025-05-18 21:00:00
Command:
```powershell
npx tsc --noEmit && node --import tsx --test src/tests/orderStateMachine.test.ts src/tests/orderNumber.test.ts
```
Output:
```
TAP version 13
# Subtest: orderNumber
    ok 1 - formats an order number as INV/YYYY/MM/NNNNNN
    ok 2 - pads the sequence to six digits
    ok 3 - rejects non positive sequences
    ok 4 - exposes the monthly prefix
    ok 5 - round trips through parseOrderNumber
    ok 6 - returns null for unknown formats
ok 1 - orderNumber
# Subtest: order state machine
    ok 1 - allows the happy path pending -> paid -> processing -> shipped -> delivered
    ok 2 - allows cancelling an unpaid order
    ok 3 - blocks skipping states
    ok 4 - blocks moving backwards
    ok 5 - treats closed orders as terminal
    ok 6 - reports transition reasons
    ok 7 - recognises known statuses only
ok 2 - order state machine
1..2
# tests 13
# suites 2
# pass 13
# fail 0
```

2026-11-11 - Increase coverage for inventoryService.ts (INV-001/005)
$ npm test
(output: 171 tests passed, fail 0)
---
Item 156: Inventory Service Coverage
Date: 2026-11-11
Command: node --experimental-test-coverage --import tsx/esm --test "src/tests/inventory.test.ts"
Output: inventoryService.ts line/branch/funcs coverage 100.00%

## 2026-11-11 - Integration Test Suite & Inventory Coverage Verification
- Command: 
ode --import tsx/esm --test "src/tests/integration/inventoryFlow.test.ts"
- Output:
\\\
TAP version 13
# Subtest: Integration Suite: Inventory Operations Lifecycle
    # Subtest: Full lifecycle: check stock, reserve, release, and adjust
    ok 1 - Full lifecycle: check stock, reserve, release, and adjust
    1..1
ok 1 - Integration Suite: Inventory Operations Lifecycle
# tests 2
# suites 0
# pass 1
# fail 0
\\\
- Command: 
px tsc --noEmit
- Output: (exit code 0, no compilation errors)

## 2026-11-11 - E2E Flow and API Documentation
- Command: 
ode --import tsx/esm --test "src/tests/e2e/e2eFlow.test.ts"
- Output:
\\\
TAP version 13
# Subtest: E2E Flow: Register to Delivery Flow Simulation
    # Subtest: Step 1: User Registration & Authentication
    ok 1 - Step 1: User Registration & Authentication
    # Subtest: Step 2: Add Item to Cart
    ok 2 - Step 2: Add Item to Cart
    # Subtest: Step 3: Checkout and Stock Reservation
    ok 3 - Step 3: Checkout and Stock Reservation
    # Subtest: Step 4: Payment Processing
    ok 4 - Step 4: Payment Processing
    # Subtest: Step 5: Logistics Shipping & Delivery
    ok 5 - Step 5: Logistics Shipping & Delivery
    1..5
ok 1 - E2E Flow: Register to Delivery Flow Simulation
# tests 6
# suites 0
# pass 6
# fail 0
\\\
- API Docs: Created rand-store-app/API-DOCS.md covering Phase 1 endpoints.

---
2026-11-11
Task: Push notification FCM/APNs
Command: npm test src/tests/pushNotifications.test.ts
Output: 
Passed all tests including new pushNotifications.test.ts. Exit code: 0
---
2026-11-12
Task: AGENT-CFG Agent instruction split (global vs repo)
Command:
  cd "E:\TEMBUS LINTAS TEKNOLOGI\TEMPLATE WEB MARKETPLACE\brand-store-app"
  $env:ENGRAM_QUIET_DEPRECATION="1"
  graphify update --no-description --no-label
  graphify export obsidian --dir "E:\antigraviti google\SUDAH DEPLOY\vault\03 Resources\Graphify\brand-store-app"
Output:
Re-extracting code files in . (no LLM needed)...
  AST extraction: 121/121 files (100%)
[engram watch] Rebuilt: 682 nodes, 1548 edges, 39 communities
[engram watch] graph.json and GRAPH_REPORT.md updated in E:\TEMBUS LINTAS TEKNOLOGI\TEMPLATE WEB MARKETPLACE\brand-store-app\.engram
Code graph updated. For doc/paper/image changes run the engram skill with --update.
Obsidian vault: 39 note(s) written to E:\antigraviti google\SUDAH DEPLOY\vault\03 Resources\Graphify\brand-store-app
Canvas: E:\antigraviti google\SUDAH DEPLOY\vault\03 Resources\Graphify\brand-store-app\graph.canvas
Exit code: 0
---
2026-11-12
Task: Phase 2 selesai (push FCM/APNs, review + moderasi, wishlist alert, bulk produk, SEO, laporan keuangan, SMS/OTP)
Files added:
  src/services/notifications/pushService.ts
  src/services/notifications/smsService.ts
  src/services/reviews/reviewService.ts
  src/services/wishlist/wishlistService.ts
  src/services/catalog/bulkService.ts
  src/services/catalog/seoService.ts
  src/services/finance/financeService.ts
  src/routes/reviews.ts
  src/routes/wishlist.ts
  src/routes/catalog.ts
  src/routes/finance.ts
Files changed:
  src/db/schema.ts (products.meta_title/meta_description, wishlists alert columns, review_helpful_votes, user_devices)
  src/services/notifications/notificationService.ts (notify() mirror ke push)
  src/services/otp/otpService.ts (kode di Redis TTL 300s + SMS provider)
  src/routes/notifications.ts (endpoint device register/unregister)
  src/app.ts (mount route baru)
Tests added:
  src/tests/push.test.ts
  src/tests/reviews.test.ts
  src/tests/wishlist.test.ts
  src/tests/bulk.test.ts
  src/tests/seo.test.ts
  src/tests/finance.test.ts
  src/tests/sms.test.ts
Command:
  cd "E:\TEMBUS LINTAS TEKNOLOGI\TEMPLATE WEB MARKETPLACE\brand-store-app"
  npx tsc --noEmit
  npm test
Output:
tsc_exit=0
# tests 251
# suites 20
# pass 251
# fail 0
# cancelled 0
# skipped 0
# todo 0
Route smoke check (script sementara, dihapus setelah run):
PASS 500 /api/v1/products/kaos-katun/seo
PASS 500 /api/v1/pages/retur/seo
PASS 500 /api/v1/products/kaos-katun/reviews
PASS 401 /api/v1/wishlist
PASS 401 /api/v1/notifications/devices
PASS 401 /api/v1/admin/products/export
PASS 401 /api/v1/admin/finance/summary
PASS 401 /api/v1/admin/reviews
PASS 401 /api/v1/admin/products/seo-audit
PASS 404 /api/v1/this-route-does-not-exist
ALL_ROUTES_REGISTERED
Catatan: 500 pada endpoint publik berasal dari kredensial PostgreSQL lokal yang belum tersedia, bukan route yang tidak termount.

---
2026-11-12 (lanjutan)
Task: Push main + sanitasi secret di graph.json
Temuan: push pertama ditolak GitHub secret scanning. `brand-store-app/.engram/graph.json`
menyimpan remote URL lengkap di `graph.provenance.source_id`, termasuk token akses repo
(token muncul 757 kali, bukan 757 secret berbeda, hanya string yang sama berulang).
Akar masalah: `engram` menyalin `git remote get-url origin`, dan URL remote saat itu
memuat token di dalamnya.
Tindakan:
  1. Sanitasi graph.json: semua `ghp_[A-Za-z0-9]{20,}` diganti `REDACTED`. JSON tetap valid,
     nodes 703 dan edges 1593 tidak berubah.
  2. `git remote set-url origin https://github.com/tembuslintasteknologi-tech/template_brand_store.git`
     supaya rebuild berikutnya tidak menyalin token lagi.
  3. Amend commit Phase 2 dengan graph.json yang sudah bersih.
  4. Push ulang.
Command:
  git grep -c "ghp_" HEAD
  git ls-remote origin refs/heads/main
Output:
no ghp_ occurrences in HEAD tree
remote ref: decf0ae1e0d8345e838dc1cfe3544b522bfd6958	refs/heads/main
local HEAD: decf0ae1e0d8345e838dc1cfe3544b522bfd6958
Push result:
   e4d31c7..decf0ae  main -> main
Catatan:
  - Remote history bersih. Versi commit yang masih memuat token tidak pernah masuk remote
    karena push pertama ditolak.
  - Token yang sama masih ada di objek git lokal (commit hasil amend) sampai gc, dan
    sebaiknya dirotasi karena sudah tampil di output terminal sesi ini.
  - Remote URL sekarang bersih, jadi `graphify update` berikutnya akan menulis
    provenance tanpa token.

---
2026-11-12 (lanjutan)
Task: BR-SCOPE - rencana Multi Cabang masuk TASK-CHECKLIST.md
Jenis perubahan: dokumen saja (TASK-CHECKLIST.md). Tidak ada perubahan kode, schema,
test, atau config di brand-store-app.
Model yang dipakai (revisi setelah koreksi pemilik produk):
  - Cabang berperan sebagai penjual di dalam satu brand, bukan hasil auto-routing.
  - Produk dari cabang tanpa stok tidak ditampilkan, jadi customer hanya bisa memilih
    cabang yang benar-benar bisa memenuhi.
  - Jarak antara alamat customer dan cabang yang dipilih menentukan mode pengiriman:
    di dalam radius ondemand maka opsi ondemand muncul, di luar radius hanya 3PL.
  - Order dikirim dari cabang yang dipilih. Tidak ada pickup.
  - Pusat tetap mengelola stoknya sendiri dan mendapat analitik seluruh cabang.
Isi yang ditambahkan: section "Fase 2.5: Multi Cabang (di luar PRD, terkait INV-007 /
INV-008)" berisi 16 baris BR-001..BR-016, 3 keputusan terbuka (OD-A..OD-C), dan 4
keputusan yang sudah final.
Command:
  git diff --numstat 7b5c8c5 -- TASK-CHECKLIST.md
Output:
50	0	TASK-CHECKLIST.md
Command:
  git status --porcelain -- brand-store-app/src
Output:
(empty)
Command:
  Select-String -Path "src\services\logistics\logisticProvider.ts" -Pattern "latitude"
Output:
  Line 20:   latitude?: number;
  Line 21:   longitude?: number;
Catatan:
  - Kontrak logistik yang dipakai sudah ada: RateCalculationParams menerima
    origin/destination latitude+longitude, tembusOnDemandProvider mengembalikan
    distance_km, tembusAggregatorProvider memakai carrier default jne dan jnt.
  - Graph tidak di-rebuild karena tidak ada node atau edge baru di brand-store-app.
    Bukti: `git status --porcelain -- brand-store-app` kosong, jadi isi graph.json
    yang terakhir (703 nodes / 1593 edges) masih mewakili kode saat ini.
---
2026-11-12 (lanjutan)
Task: BR-001..BR-004 fondasi Multi Cabang (schema, migrasi, scoping, service stok)
Jenis perubahan: kode + schema + test. Empat baris checklist Fase 2.5 dicentang.
File yang berubah:
  M  src/db/schema.ts                     (users.branchId + users_branch_idx, storeLocations
                                           kolom baru + 2 index, tabel branchInventory + 3 index)
  M  src/middleware/auth.ts               (requireBranchScope + BranchScopeOptions)
  A  drizzle/0007_branches.sql            (DDL idempotent + backfill pusat / CBG-<8hex>)
  A  src/services/branch/branchScope.ts   (resolveBranchAccess, branchIdOf, konstanta role)
  A  src/services/branch/branchStockService.ts (resolveAvailable, canFulfill, stockStatus,
                                           groupItemsByBranch, planReservation, applyReserve,
                                           applyRelease, BranchStockError)
  A  src/tests/branchScope.test.ts        (10 test)
  A  src/tests/branchStock.test.ts        (15 test)
  M  TASK-CHECKLIST.md                    (BR-001..BR-004 jadi [x])
  M  VERIFY-LOG.md                        (blok ini)
Command:
  npx tsc --noEmit
Output:
  TSC_EXIT=0
Command:
  npm test
Output:
  # tests 276
  # suites 20
  # pass 276
  # fail 0
Baseline sebelumnya 251 test, jadi ada 25 test baru (branchScope 10 + branchStock 15).
Command:
  node --import tsx/esm tmp-schema-check.ts   (getTableConfig untuk 3 tabel)
Output:
  users -> id, email, password_hash, full_name, phone, role, status, branch_id,
           email_verified, created_at, updated_at
    indexes: users_email_idx, users_branch_idx
    fks: users_branch_id_store_locations_id_fk
  store_locations -> id, code, name, type, phone, address_line, city, province,
           postal_code, latitude, longitude, ondemand_enabled, service_radius_km,
           operating_hours, manager_name, is_online, is_default, is_active, created_at
    indexes: store_locations_code_uidx, store_locations_type_active_idx
  branch_inventory -> id, branch_id, variant_id, stock, reserved_stock,
           low_stock_threshold, updated_at
    indexes: branch_inventory_branch_variant_uidx, branch_inventory_variant_idx,
             branch_inventory_branch_idx
    fks: branch_inventory_branch_id_store_locations_id_fk,
         branch_inventory_variant_id_product_variants_id_fk
Command:
  git status --porcelain -- brand-store-app TASK-CHECKLIST.md
Output:
   M TASK-CHECKLIST.md
   M brand-store-app/src/db/schema.ts
   M brand-store-app/src/middleware/auth.ts
  ?? brand-store-app/drizzle/0007_branches.sql
  ?? brand-store-app/src/services/branch/
  ?? brand-store-app/src/tests/branchScope.test.ts
  ?? brand-store-app/src/tests/branchStock.test.ts
Catatan:
  - Foreign key users.branch_id ke store_locations valid walau tabel storeLocations
    dideklarasikan setelah users, karena drizzle mengevaluasi references() secara lazy.
    Diverifikasi lewat getTableConfig, bukan hanya dari tsc.
  - Satu test sempat gagal karena fixture pusat punya reservedStock 2 (available 8) tetapi
    test meminta 9. Fixture yang salah, bukan implementasi. Test dipecah jadi dua: penjumlahan
    5+3 = 8 lulus, dan 5+4 = 9 ditolak dengan pesan "only has 8 available".
  - drizzle/meta/_journal.json hanya mencatat 0000 dan 0006, jadi 0007 belum ter-journal.
    Jalur yang dipakai lokal tetap `npm run db:push`.
  - Belum ada route HTTP di batch ini. BR-005 dan seterusnya yang menambah mount di app.ts.
---
2026-11-12 (lanjutan)
Task: BR-005 endpoint master cabang + BR-006 endpoint stok milik cabang sendiri
Jenis perubahan: kode + schema + test. Dua baris checklist Fase 2.5 dicentang.
File yang berubah:
  M  src/db/schema.ts                            (inventoryLogs.branchId + inventory_logs_branch_idx)
  M  src/middleware/auth.ts                      (token mock branch_admin, branchId di context user)
  M  src/routes/auth.ts                          (token branch_admin + branchId di payload login)
  M  src/services/config/storeLocations.ts       (field cabang, guard ondemand/deaktivasi/delete,
                                                  setStoreLocationCoordinates, audit branch.*)
  M  src/types/hono.d.ts                         (role branch_admin, branchId, branchScope)
  M  src/app.ts                                  (mount adminBranchRoutes di /admin, branchRoutes di /branch)
  M  drizzle/0007_branches.sql                   (inventory_logs.branch_id + inventory_logs_branch_idx)
  A  src/services/branch/branchValidation.ts     (normalisasi kode, rentang koordinat, ondemand wajib
                                                  koordinat, guard stok dan cabang default)
  A  src/services/branch/branchInventoryService.ts (listBranchInventory, adjustBranchStock,
                                                  listBranchInventoryLogs, sinkron agregat variant)
  A  src/routes/branches.ts                      (adminBranchRoutes + branchRoutes)
  A  src/tests/branchValidation.test.ts          (15 test)
  A  src/tests/branchRoutes.test.ts              (8 test)
  M  TASK-CHECKLIST.md                           (BR-005 dan BR-006 jadi [x])
  M  VERIFY-LOG.md                               (blok ini)
Command:
  npx tsc --noEmit
Output:
  TSC_EXIT=0
Command:
  npm test
Output:
  # tests 299
  # suites 27
  # pass 299
  # fail 0
  # cancelled 0
  # skipped 0
  # todo 0
Baseline blok sebelumnya 276 test / 20 suite, jadi ada 23 test baru (branchValidation 15 +
branchRoutes 8) dan 7 suite baru.
Command:
  npx tsx schema-check.ts   (getTableConfig untuk store_locations, branch_inventory, inventory_logs)
Output:
  store_locations columns: id,code,name,type,phone,address_line,city,province,postal_code,
           latitude,longitude,ondemand_enabled,service_radius_km,operating_hours,manager_name,
           is_online,is_default,is_active,created_at
  store_locations indexes: store_locations_code_uidx,store_locations_type_active_idx
  branch_inventory columns: id,branch_id,variant_id,stock,reserved_stock,low_stock_threshold,updated_at
  branch_inventory indexes: branch_inventory_branch_variant_uidx,branch_inventory_variant_idx,
           branch_inventory_branch_idx
  inventory_logs columns: id,branch_id,variant_id,product_id,change_type,quantity_change,
           previous_stock,new_stock,reason,reference_id,performed_by,created_at
  inventory_logs indexes: inventory_logs_branch_idx
  inventory_logs fks: inventory_logs_branch_id_store_locations_id_fk,
           inventory_logs_variant_id_product_variants_id_fk,
           inventory_logs_product_id_products_id_fk,
           inventory_logs_performed_by_users_id_fk
Command:
  git status --porcelain
Output:
   M TASK-CHECKLIST.md
   M brand-store-app/drizzle/0007_branches.sql
   M brand-store-app/src/app.ts
   M brand-store-app/src/db/schema.ts
   M brand-store-app/src/middleware/auth.ts
   M brand-store-app/src/routes/auth.ts
   M brand-store-app/src/services/config/storeLocations.ts
   M brand-store-app/src/types/hono.d.ts
  ?? .file
  ?? brand-store-app/src/routes/branches.ts
  ?? brand-store-app/src/services/branch/branchInventoryService.ts
  ?? brand-store-app/src/services/branch/branchValidation.ts
  ?? brand-store-app/src/tests/branchRoutes.test.ts
  ?? brand-store-app/src/tests/branchValidation.test.ts
Catatan:
  - storeLocations.ts diperluas di tempat, bukan diganti dengan service paralel, karena
    services/config/settings.ts:209 getDefaultStoreLocation dipakai checkout 3PL sebagai
    origin pengiriman. Nama fungsi lama (listStoreLocations, createStoreLocation,
    updateStoreLocation, deleteStoreLocation, setDefaultStoreLocation) dan bentuk
    storeLocationSchema tetap kompatibel.
  - Cabang baru tanpa koordinat menyimpan ondemandEnabled = false. Kalau body minta ondemand
    secara eksplisit tanpa koordinat, permintaan ditolak ONDEMAND_REQUIRES_COORDINATES,
    bukan diam-diam dimatikan.
  - Delete cabang default ditolak BRANCH_IS_DEFAULT (status 409), deaktivasi atau delete
    cabang yang masih punya stok tersedia ditolak BRANCH_HAS_STOCK (status 409). Stok
    tersedia dihitung sebagai sum(greatest(stock - reserved_stock, 0)).
  - branch_id di inventory_logs sengaja nullable + onDelete set null. Log lama tetap ada
    setelah cabang dihapus dan tetap terbaca sebagai pergerakan level pusat, bukan hilang.
  - adjustBranchStock membuat baris stok nol lebih dulu lewat onConflictDoNothing(), lalu
    membaca ulang, supaya dua permintaan bersamaan tidak menghasilkan dua baris. Sesudah
    update, product_variants.stock dihitung ulang sebagai sum(branch_inventory.stock)
    sehingga query katalog lama tetap masuk akal.
  - branchRoutes.test.ts hanya menguji jalur 401/403/400, jadi tidak butuh Postgres hidup.
    Jalur 200 untuk inventory butuh database dan belum dicakup di suite ini.
  - Dua error tsc awal sudah diperbaiki: role 'branch_admin' belum ada di ContextVariableMap
    (src/types/hono.d.ts), dan HeadersInit tidak tersedia di tipe test (diganti
    Record<string, string>).
---
2026-11-12 (lanjutan 2)
Task: BR-007 ketersediaan cabang per produk + BR-008 penentu mode pengiriman
Jenis perubahan: kode + setting + test. Dua baris checklist Fase 2.5 dicentang.
File yang berubah:
  A  src/services/shipping/deliveryModeService.ts   (resolveDeliveryModes, isOndemandAvailable,
                                                    haversineDistanceKm, roundKm, parseCoordinates,
                                                    DEFAULT_SERVICE_RADIUS_KM = 15)
  A  src/services/branch/branchAvailabilityService.ts (listProductBranchAvailability + assembleBranches
                                                    murni, ProductNotFoundError)
  M  src/routes/products.ts                         (GET /:slug/branches sebelum /:slug)
  M  src/services/config/settings.ts                (validator shipping.showAggregatorWithinRadius,
                                                    getShowAggregatorWithinRadius)
  M  src/db/seed.ts                                 (default shipping.showAggregatorWithinRadius
                                                    { enabled: true })
  A  src/tests/deliveryMode.test.ts                 (20 test)
  A  src/tests/branchAvailability.test.ts           (18 test)
  M  TASK-CHECKLIST.md                              (BR-007 dan BR-008 jadi [x])
  M  VERIFY-LOG.md                                  (blok ini)
Command:
  npx tsc --noEmit
Output:
  TSC_EXIT=0
Command:
  npm test
Output:
  # tests 337
  # suites 34
  # pass 337
  # fail 0
  # cancelled 0
  # skipped 0
  # todo 0
Baseline blok sebelumnya 299 test / 27 suite, jadi ada 38 test baru (deliveryMode 20 +
branchAvailability 18) dan 7 suite baru.
Command:
  npx tsx tmp-smoke-br007.ts   (createApp + app.request, lalu file dihapus)
Output:
  500 /api/v1/products/contoh-produk/branches :: {"success":false,"error":"password authentication failed for user \"postgres\""}
  500 /api/v1/products/contoh-produk/branches?lat=-6.2&lng=106.8 :: {"success":false,"error":"password authentication failed for user \"postgres\""}
  500 /api/v1/products/contoh-produk :: {"success":false,"error":"password authentication failed for user \"postgres\""}
  500 /api/v1/products/tidak-ada-route-ini :: {"success":false,"error":"password authentication failed for user \"postgres\""}
Command:
  Select-String -Path "src\routes\products.ts" -Pattern "productRoutes\.(get|post|patch|delete)"
Output:
  16: productRoutes.get('/', async (c) => {
  40: productRoutes.get('/:slug/branches', async (c) => {
  60: productRoutes.get('/:slug', async (c) => {
  76: productRoutes.post('/', authMiddleware, adminOnlyMiddleware, async (c) => {
  122: productRoutes.delete('/:id', authMiddleware, adminOnlyMiddleware, async (c) => {
Command:
  Select-String -Path "src\app.ts" -Pattern "productRoutes|branchRoutes"
Output:
  112: api.route('/products', productRoutes);
  132: api.route('/admin', adminBranchRoutes);
  133: api.route('/branch', branchRoutes);
Command:
  git status --porcelain
Output:
   M TASK-CHECKLIST.md
   M brand-store-app/VERIFY-LOG.md
   M brand-store-app/src/db/seed.ts
   M brand-store-app/src/routes/products.ts
   M brand-store-app/src/services/config/settings.ts
  ?? .file                                        (dump terminal, sengaja tidak di-commit)
  ?? brand-store-app/src/services/branch/branchAvailabilityService.ts
  ?? brand-store-app/src/services/shipping/deliveryModeService.ts
  ?? brand-store-app/src/tests/branchAvailability.test.ts
  ?? brand-store-app/src/tests/deliveryMode.test.ts
Catatan:
  - Urutan route penting: '/:slug/branches' didaftarkan di baris 40, '/:slug' di baris 60.
    Kalau dibalik, Hono akan menangkap 'branches' sebagai slug.
  - Smoke check 500 pada kedua path karena kredensial postgres lokal salah, sama seperti
    route produk lama. Yang dibuktikan di sini adalah path tidak 404, artinya route ter-mount
    dan cocok. Jalur 200 butuh database hidup.
  - assembleBranches dipisah dari query supaya filter stok, stockStatus, jarak, dan mode bisa
    diuji tanpa Postgres. listProductBranchAvailability sekarang hanya menyusun query agregat
    lalu menyerahkan barisnya ke fungsi murni itu.
  - Filter stok: baris dengan available <= 0 dibuang seluruhnya, termasuk hasil sum yang
    datang sebagai string dari postgres ('12' dibaca jadi 12). Baris dengan nilai bukan angka
    juga dibuang, bukan ditampilkan sebagai stok nol.
  - Cabang offline dan nonaktif disaring di SQL (is_online = true dan is_active = true), bukan
    di JavaScript, supaya tidak ada baris yang terlanjur dihitung.
  - Tanpa koordinat customer, distanceKm null dan mode hanya aggregator. Cabang tanpa
    koordinat tetap muncul, tetapi juga hanya aggregator dan diletakkan setelah cabang yang
    punya jarak terukur.
  - service_radius_km kosong atau tidak masuk akal (0, negatif, bukan angka) jatuh ke
    DEFAULT_SERVICE_RADIUS_KM = 15, bukan dianggap nol. Cabang lama yang belum punya radius
    tidak kehilangan ondemand secara diam-diam.
  - Batas radius dihitung inklusif: jarak tepat sama dengan radius masih dalam radius.
  - BR-008 mengembalikan daftar mode, bukan memilih satu. Pilihan akhir ada di UI atau di
    BR-010, karena OD-B (tampilkan 3PL sebagai pembanding di dalam radius) belum diputuskan.
  - shipping.showAggregatorWithinRadius harus berbentuk objek { enabled: boolean } karena
    validateSetting menuntut JSON objek untuk key bertitik yang tidak punya skema eksplisit.
  - Cek cakupan courier hidup lewat tembusOnDemandProvider.calculateRate belum dipasang,
    itu bagian BR-010. Sampai saat itu ondemandAvailable murni berbasis jarak.
---
2026-11-12 (lanjutan 3)
Task: BR-009 sumber order per cabang
Jenis perubahan: skema + migrasi + service + route + test. Satu baris checklist Fase 2.5 dicentang.
File yang berubah:
  M  src/db/schema.ts                             (orders.fulfillment_source,
                                                   order_items.source_branch_id + fulfillment_mode
                                                   + index, shipments.origin_branch_id + index)
  M  drizzle/0007_branches.sql                    (blok -- ORDER SOURCE (BR-009), idempoten)
  A  src/services/branch/orderSourceService.ts     (buildBranchSnapshot, distinctBranchIds,
                                                   resolveFulfillmentSource, assertFulfillmentMode,
                                                   planBranchShipments, branchSellableStock,
                                                   assertBranchCanFulfill, getBranchSnapshot,
                                                   OrderSourceError)
  M  src/validators/schemas.ts                    (orderSchema: branchId + fulfillmentMode opsional)
  M  src/routes/orders.ts                         (stok cabang jadi sumber kebenaran, snapshot,
                                                   fulfillment_source, shipmentPlan di respons)
  M  src/services/config/settings.ts              (getStoreLocationById)
  M  src/services/logistics/shipmentService.ts    (originBranchId opsional, origin pakai koordinat
                                                   cabang, OrderSourceError saat cabang hilang)
  M  src/routes/logistics.ts                      (originBranchId dari body atau turunan item order)
  A  src/tests/orderSource.test.ts                (18 test)
  M  TASK-CHECKLIST.md                            (BR-009 jadi [x])
  M  VERIFY-LOG.md                                (blok ini)
Command:
  npx tsc --noEmit
Output:
  TSC_EXIT=0
Command:
  npm test
Output:
  # tests 355
  # suites 39
  # pass 355
  # fail 0
  # cancelled 0
  # skipped 0
  # todo 0
Baseline blok sebelumnya 337 test / 34 suite, jadi ada 18 test baru dan 5 suite baru
(seluruhnya di orderSource.test.ts).
Command:
  git status --porcelain        (baris .engram diringkas)
Output:
   M brand-store-app/drizzle/0007_branches.sql
   M brand-store-app/src/db/schema.ts
   M brand-store-app/src/routes/logistics.ts
   M brand-store-app/src/routes/orders.ts
   M brand-store-app/src/services/config/settings.ts
   M brand-store-app/src/services/logistics/shipmentService.ts
   M brand-store-app/src/validators/schemas.ts
  ?? .file                                        (dump terminal, sengaja tidak di-commit)
  ?? brand-store-app/src/services/branch/orderSourceService.ts
  ?? brand-store-app/src/tests/orderSource.test.ts
Catatan:
  - Item order yang membawa branchId dicek ke stok cabang, bukan ke products.stock. products.stock
    tetap dipakai hanya untuk item lama tanpa branch, supaya klien yang belum mengirim branch
    tidak langsung putus.
  - Stok cabang dihitung sum(greatest(stock - reserved_stock, 0)) per varian produk, angka yang
    sama dengan yang dipakai halaman produk BR-007, jadi katalog dan checkout tidak bisa berbeda
    pendapat.
  - Branch yang tidak ada, nonaktif, atau stok kurang melempar OrderSourceError dengan status
    404 / 409 / 400 dan kode BRANCH_NOT_FOUND / BRANCH_INACTIVE / BRANCH_OUT_OF_STOCK. Route
    memetakannya apa adanya, tidak lagi jadi 500.
  - Mode pengiriman default aggregator saat klien tidak mengirim apa pun, karena 3PL selalu bisa
    jalan. Mode asing ditolak INVALID_FULFILLMENT_MODE, bukan ditebak jadi aggregator.
  - fulfillment_source hanya multi_branch kalau ada dua branch id berbeda. Item pusat (branchId
    kosong) tidak dihitung sebagai cabang kedua.
  - Snapshot cabang masuk ke product_snapshot.branch supaya riwayat order tetap terbaca walau
    master cabang nanti diubah namanya atau dihapus. source_branch_id sendiri ON DELETE SET NULL.
  - Respons POST /api/v1/orders sekarang juga membawa shipments (hasil planBranchShipments),
    sehingga UI tahu keranjang dipecah jadi berapa pengiriman tanpa menghitung ulang.
  - originBranchId di createShipmentForOrder memakai getStoreLocationById dan ikut menulis
    latitude/longitude cabang ke origin. Kalau cabang yang diminta sudah tidak ada, lempar
    BRANCH_NOT_FOUND 404, bukan diam-diam mengirim dari gudang default.
  - POST /api/v1/logistics/admin/shipments menurunkan origin dari item order hanya kalau order
    bukan multi_branch. Untuk order multi_branch admin wajib menyebut originBranchId karena satu
    order bisa jadi beberapa shipment (OD-A belum final).
  - Jalur 200 POST /api/v1/orders dan pembuatan shipment tetap butuh Postgres hidup, jadi tidak
    ada smoke check HTTP di blok ini. Yang diuji adalah lapisan keputusan murni.
---
2026-11-12 (lanjutan 4)
Task: BR-010 opsi kirim dan pemilihan 3PL
Jenis perubahan: service + route + validator + refactor order creation + test. Satu baris
checklist Fase 2.5 dicentang.
File yang berubah:
  A  src/services/shipping/shippingOptionsService.ts (assembleShippingOptions,
                                                     resolveSelectedShippingOption,
                                                     listShippingOptions,
                                                     DEFAULT_PARCEL_WEIGHT_GRAMS = 1000)
  A  src/services/order/orderCreateService.ts      (createOrderWithItems dipakai dua route)
  A  src/routes/shipping.ts                        (GET /options, auth + Cache-Control: no-store)
  A  src/tests/shippingOptions.test.ts             (20 test, 3 suite)
  M  src/routes/checkout.ts                        (POST / baru: kutip ulang opsi, pilih service,
                                                    buat order dari service bersama)
  M  src/routes/orders.ts                          (isi body pindah ke createOrderWithItems,
                                                    kontrak respons tidak berubah)
  M  src/validators/schemas.ts                     (checkoutSchema, koordinat opsional di
                                                    orderSchema.shippingAddress)
  M  src/app.ts                                    (mount api.route('/shipping', ...))
  M  TASK-CHECKLIST.md                             (BR-010 jadi [x])
  M  VERIFY-LOG.md                                 (blok ini)
Command:
  npx tsc --noEmit
Output:
  TSC_EXIT=0
Command:
  npm test
Output:
  # tests 375
  # suites 42
  # pass 375
  # fail 0
  # cancelled 0
  # skipped 0
  # todo 0
Baseline blok sebelumnya 355 test / 39 suite, jadi ada 20 test baru dan 3 suite baru
(seluruhnya di shippingOptions.test.ts).
Catatan kontrak:
  - GET /api/v1/shipping/options query: branchId (wajib), addressId (discope ke customerId
    pemilik token), city, postalCode, latitude, longitude, weightGrams, value, cod. Respons
    membawa branch, destination, modes, reason, distanceKm, radiusKm, weightGrams, currency,
    options[], unavailable[]. Tanpa koordinat tujuan modes = ['aggregator'] (OD-C), bukan error.
  - POST /api/v1/checkout body = order body + branchId, addressId, selectedMode, selectedService,
    weightGrams. Aturan pilih: tidak ada mode tapi ada service -> cocokkan service; ondemand
    tanpa service -> opsi ondemand pertama; aggregator tanpa service -> 400
    SHIPPING_SERVICE_REQUIRED; service di luar daftar -> 400 SHIPPING_SERVICE_NOT_AVAILABLE; mode
    yang tidak ditawarkan cabang -> 400 SHIPPING_MODE_NOT_AVAILABLE.
  - Satu checkout hanya boleh satu cabang (MULTI_BRANCH_CHECKOUT_UNSUPPORTED 400) selama OD-A
    belum final. Item tanpa branchId dipin ke cabang pilihan, dan branchId yang hilang ditolak
    BRANCH_REQUIRED 400.
  - Harga kirim dikutip ulang saat checkout, bukan dipercaya dari klien. shipping_amount dan
    total_amount ikut dihitung di service bersama, shipping_details menyimpan
    { mode, provider, service, name, cost }.
  - Provider gagal kutip dicatat ke unavailable[] dengan reason quote_failed (atau
    no_coordinates / missing_destination_city / no_service), jadi 3PL tetap bisa dipakai saat
    API ondemand mati. Endpoint tidak pernah 500 hanya karena satu provider down.
  - orderCreateWithItems juga memetakan produk tidak ada dan stok kurang sebagai
    OrderSourceError({ code, message }), bukan string bebas seperti sebelumnya.
  - Jalur 200 untuk /options dan /checkout belum bisa di-smoke-test: butuh Postgres hidup plus
    API courier. Yang diuji lapisan keputusan murni.
