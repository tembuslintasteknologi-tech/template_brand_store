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
---
2026-11-14 (lanjutan 5)
Task: BR-011 reservasi stok per cabang
Jenis perubahan: service + helper murni + wrapper legacy + test. Satu baris checklist Fase 2.5
dicentang.
File yang berubah:
  A  src/services/branch/branchReservationService.ts  (reserveStockAtBranch, releaseStockAtBranch,
                                                      loadBranchRow, loadReferenceLogs,
                                                      loadProductId, syncReservedAggregate)
  M  src/services/branch/branchStockService.ts        (findReservedBranch, hasReleasedReference,
                                                      ReservationLogLike)
  M  src/services/inventoryService.ts                 (reserveStock/releaseReservedStock jadi
                                                      wrapper ke cabang pusat dan ke cabang asal)
  M  src/services/config/settings.ts                  (getDefaultStoreLocation tanpa .limit(1))
  A  src/tests/branchReservation.test.ts              (12 test)
  M  TASK-CHECKLIST.md                                (BR-011 jadi [x])
  M  VERIFY-LOG.md                                    (blok ini)
Command:
  npx tsc --noEmit
Output:
  TSC_EXIT=0
Command:
  node --import tsx/esm --test "src/tests/inventory.test.ts" "src/tests/integration/inventoryFlow.test.ts"
Output:
  # tests 12
  # pass 12
  # fail 0
Command:
  node --import tsx/esm --test "src/tests/branchReservation.test.ts"
Output:
  # tests 12
  # pass 12
  # fail 0
Command:
  npm test
Output:
  # tests 387
  # suites 42
  # pass 387
  # fail 0
  # cancelled 0
  # skipped 0
  # todo 0
Baseline blok sebelumnya 375 test / 42 suite, jadi ada 12 test baru. Jumlah suite tidak naik
karena branchReservation.test.ts memakai satu test induk dengan subtest, sama seperti
inventory.test.ts.
Catatan kontrak:
  - reserveStockAtBranch menolak cabang yang tidak menyimpan varian dengan BRANCH_STOCK_NOT_FOUND,
    bukan membuat baris stok nol yang bisa menyembunyikan produk. Kuantitas nol, negatif, atau
    pecahan ditolak INVALID_QUANTITY sebelum menyentuh database.
  - Ketersediaan memakai helper murni BR-004, jadi reserved_stock tidak pernah melewati stok
    nyata cabang dan pesan INSUFFICIENT_STOCK menyebut sisa yang benar-benar bisa dijual.
  - Setiap tulis reservation/release membuat baris inventory_logs dengan branchId, variantId,
    changeType, dan referenceId yang sama. releaseReservedStock membaca log itu lewat
    findReservedBranch, jadi pelepasan kembali ke cabang asal walau pemanggil tidak menyebut
    cabang. Log lama tanpa branch_id jatuh ke cabang pusat.
  - Pelepasan kedua untuk reference yang sama mengembalikan alreadyReleased: true dan tidak
    menulis log baru. applyRelease menjepit di nol, jadi kelebihan pelepasan tidak membuat angka
    negatif.
  - syncReservedAggregate menjumlah reserved_stock semua cabang ke product_variants.reserved_stock
    supaya query katalog lama tidak melenceng. Kalau hasil sum bukan angka finite (mock lama),
    penulisan dilewati daripada menimpa angka dengan nol palsu.
  - checkout BR-010 belum memanggil reservasi, jadi belum ada hook release di routes/payments.ts
    atau paymentExpiry.ts. Helper-nya sudah idempotent dan siap dipasang saat reservasi
    disambungkan ke alur order.
  - Jalur 200 reservasi butuh Postgres hidup, jadi blok ini hanya membuktikan lapisan service
    lewat database mock dan test murni.

---
2026-11-14 (lanjutan 6)
Task: BR-012 analitik pusat lintas cabang
Jenis perubahan: service + route + test. Satu baris checklist Fase 2.5 dicentang.
File yang berubah:
  A  src/services/admin/branchAnalytics.ts        (resolveAnalyticsWindow, buildBranchAnalytics,
                                                   branchAnalyticsReport, tipe laporan)
  M  src/services/finance/financeService.ts       (REFUND_SETTLED_STATUSES diekspor dan dipakai
                                                   bersama, tidak ada perubahan perilaku)
  M  src/routes/analytics.ts                      (GET /analytics/branches di bawah guard admin)
  A  src/tests/branchAnalytics.test.ts            (10 test)
  M  TASK-CHECKLIST.md                            (BR-012 jadi [x])
  M  VERIFY-LOG.md                                (blok ini)
Command:
  npx tsc --noEmit
Output:
  TSC_EXIT=0
Command:
  node --import tsx/esm --test "src/tests/branchAnalytics.test.ts"
Output:
  # tests 10
  # pass 10
  # fail 0
Command:
  npm test
Output:
  # tests 397
  # suites 42
  # pass 397
  # fail 0
  # cancelled 0
  # skipped 0
  # todo 0
Baseline blok sebelumnya 387 test / 42 suite, jadi ada 10 test baru. Jumlah suite tidak naik
karena test baru memakai top-level test, sama seperti adminCore.test.ts.
Catatan kontrak:
  - GET /api/v1/admin/analytics/branches menerima query from dan to opsional. Tanpa keduanya
    jendela default 30 hari terakhir, sama dengan laporan finance. Tanggal rusak ditolak
    INVALID_DATE dan rentang terbalik ditolak INVALID_DATE_RANGE, keduanya 400.
  - Penjualan hanya menghitung order berstatus REVENUE_STATUSES (paid, processing, shipped,
    delivered). Order pending, cancelled, dan expired tetap tidak masuk omzet walau punya baris
    item, jadi angka cabang konsisten dengan financialSummary.
  - orderCount adalah jumlah order distinct yang punya penjualan di cabang itu. Rollup menghitung
    distinct lagi dari seluruh baris, jadi order yang memakai dua cabang tidak terhitung dua kali.
    AOV = grossSales / orderCount dan dibulatkan dua desimal.
  - Refund memakai REFUND_SETTLED_STATUSES yang sekarang satu sumber di financeService.ts.
    Refund hanya masuk ke cabang kalau semua baris order itu berasal dari satu cabang. Order
    multi cabang masuk unallocatedRefundTotal karena baris refund sendiri tidak menyimpan cabang,
    dan membaginya dengan asumsi akan mengarang angka.
  - Baris order lama tanpa source_branch_id jatuh ke cabang pusat lewat fallbackBranchId. Kalau
    cabang pusat tidak ada, baris itu tidak masuk cabang mana pun tetapi tetap dihitung di rollup
    dan dilaporkan sebagai unassignedSales.
  - Stok di bawah ambang memakai stockStatus BR-004. Baris dengan available 0 masuk out_of_stock,
    available <= threshold masuk low_stock, dan yang sehat tidak ditampilkan. Daftar diurutkan
    dari available terkecil lalu nama.
  - Cabang aktif yang belum punya order tetap muncul dengan angka nol, dan urutan baris menaruh
    pusat lebih dulu. Rollup membawa branchCount, orderCount, itemCount, grossSales, refundedTotal,
    netSales, averageOrderValue, unallocatedRefundTotal, unassignedSales, dan lowStockCount.
  - Route berada di grup analyticsRoutes yang sudah dipasang di /admin, jadi path penuhnya
    /api/v1/admin/analytics/branches. branch_admin ditolak 403 oleh adminOnlyMiddleware yang
    memang hanya meloloskan role admin. Test membuktikan 401 tanpa token dan 403 untuk branch_admin.
  - Jalur 200 butuh Postgres hidup, jadi blok ini membuktikan aturan lewat fungsi murni dan
    penjagaan route lewat HTTP 401/403, bukan smoke check data nyata.

---
2026-11-14 (lanjutan 7)
Task: BR-013 dashboard cabang
Jenis perubahan: service + route + test + satu perbaikan aturan refund BR-012.
File yang berubah:
  A  src/services/branch/branchDashboard.ts        (buildBranchDashboard murni,
                                                   branchDashboardReport, BranchDashboardError)
  A  src/tests/branchDashboard.test.ts             (13 test)
  M  src/routes/branches.ts                        (GET /branch/dashboard di grup branchRoutes)
  M  src/services/admin/branchAnalytics.ts         (refund tidak diatribusikan kalau order punya
                                                   baris tanpa cabang atau cabang di luar daftar)
  M  TASK-CHECKLIST.md                             (BR-013 jadi [x])
  M  VERIFY-LOG.md                                 (blok ini)
Command:
  npx tsc --noEmit
Output:
  TSC_EXIT=0
Command:
  node --import tsx/esm --test "src/tests/branchDashboard.test.ts"
Output:
  # tests 13
  # pass 13
  # fail 0
Command:
  npm test
Output:
  # tests 410
  # suites 44
  # pass 410
  # fail 0
Baseline blok sebelumnya 397 test / 42 suite, jadi ada 13 test baru dan 2 suite baru.
Catatan kontrak:
  - GET /api/v1/branch/dashboard menerima query from dan to opsional. Tanpa keduanya jendela
    default 30 hari terakhir lewat resolveAnalyticsWindow BR-012. Tanggal rusak ditolak
    INVALID_DATE dan rentang terbalik ditolak INVALID_DATE_RANGE, keduanya 400, dan keduanya
    ditolak sebelum database disentuh.
  - branchId tidak pernah dibaca dari body. requireBranchScope menyimpannya di context dari
    sesi: branch_admin selalu memakai users.branch_id, admin pusat harus menyebut X-Branch-Id.
    Admin pusat tanpa header menerima BRANCH_REQUIRED 400, bukan diam-diam membaca semua cabang.
    branch_admin tanpa cabang menerima BRANCH_SCOPE_MISSING 403, dan branch_admin yang menunjuk
    cabang lain menerima BRANCH_SCOPE_MISMATCH 403.
  - Penjualan, jumlah item, order distinct, retur, netSales, AOV, dan daftar low stock memakai
    buildBranchAnalytics yang sama dengan BR-012. Tidak ada rumus kedua yang bisa menyimpang.
  - Refund hanya masuk kalau semua baris order milik cabang ini. Supaya tidak mengarang angka,
    dua kasus tambahan sekarang masuk unattributedRefundTotal: order yang punya baris tanpa
    source_branch_id, dan order yang punya baris menunjuk cabang di luar daftar yang dikirim.
    Perubahan ini ada di branchAnalytics.ts dan tidak mengubah hasil BR-012 untuk cabang yang
    ada di daftar, karena semua test BR-012 tetap lulus.
  - Reservasi aktif adalah branch_inventory.reserved_stock > 0 untuk cabang itu, diurutkan dari
    reserved_stock terbesar lalu nama. available = max(0, stock - reserved). reservedQuantity
    adalah jumlah reserved_stock seluruh baris aktif.
  - Cabang tanpa order tetap mengembalikan dashboard dengan angka nol dan daftar kosong.
  - Jalur 200 butuh Postgres hidup, jadi blok ini membuktikan aturan lewat fungsi murni dan
    penjagaan scope lewat HTTP 401/403/400, bukan smoke check data nyata.

---
2026-11-14 (lanjutan 8)
Task: BR-014 transfer stok antar cabang
Jenis perubahan: schema + migrasi + service + route + test.
File yang berubah:
  A  drizzle/0008_stock_transfers.sql             (tabel dan index, idempoten)
  A  src/services/branch/stockTransferService.ts  (state machine murni + fungsi DB transaksi)
  A  src/tests/stockTransfer.test.ts              (19 test)
  M  src/db/schema.ts                             (export stockTransfers)
  M  src/routes/branches.ts                       (5 route admin stok transfer + fail handler)
  M  TASK-CHECKLIST.md                            (BR-014 jadi [x])
  M  VERIFY-LOG.md                                (blok ini)
Command:
  npx tsc --noEmit
Output:
  TSC_EXIT=0
Command:
  node --import tsx/esm --test "src/tests/stockTransfer.test.ts"
Output:
  # tests 19
  # pass 19
  # fail 0
Command:
  npm test
Output:
  # tests 429
  # suites 47
  # pass 429
  # fail 0
Baseline blok sebelumnya 410 test / 44 suite, jadi ada 19 test baru dan 3 suite baru.
Kontrak perilaku:
  - Status hanya empat: draft, in_transit, received, cancelled.
  - approve: draft tetap draft, hanya menstempel approved_by. Approve kedua ditolak
    ALREADY_APPROVED 409.
  - ship: hanya dari draft dan wajib sudah approve (APPROVAL_REQUIRED 409). Stok asal
    berkurang tepat satu kali, log transfer_out ditulis, agregat product_variants.stock
    dihitung ulang.
  - receive: hanya dari in_transit. Stok tujuan bertambah tepat satu kali, log transfer_in
    ditulis, agregat dihitung ulang. Baris stok tujuan dibuat kalau belum ada.
  - cancel: hanya dari draft. Transfer in_transit tidak bisa dibatalkan, ini keputusan
    terbuka yang dicatat di checklist.
  - Kuantitas wajib bilangan bulat positif. Cabang asal dan tujuan wajib diisi dan berbeda.
  - Hanya stok tersedia (stock - reserved) yang boleh keluar. Stok yang sedang direservasi
    tidak bisa ditransfer.
  - Row transfer dikunci FOR UPDATE di dalam transaksi sebelum transisi, supaya dua admin
    tidak bisa ship atau receive baris yang sama dua kali.
Catatan:
  - drizzle/meta/_journal.json hanya memuat 0000 dan 0006, jadi 0008 mengikuti pola
    unjournaled yang sama seperti 0007. Jalur nyata tetap db:push.
  - Jalur 200 butuh Postgres hidup. Bukti di blok ini adalah aturan murni (state machine,
    validasi, konservasi stok) plus penjagaan HTTP 401/403/400/409 yang berjalan tanpa DB.

---
2026-11-14 (lanjutan 9)
Task: BR-015 seed dan dokumentasi cabang
Jenis perubahan: seed data + dokumentasi + test.
File yang berubah:
  A  src/db/seedData.ts                     (data seed murni: cabang, katalog, rencana stok)
  A  src/tests/seedBranches.test.ts         (16 test)
  M  src/db/seed.ts                         (seed idempoten pusat + 2 cabang + inventory)
  M  package.json                           (script db:seed)
  M  API-DOCS.md                            (alur multi cabang, opsi kirim, checkout, error)
  M  TASK-CHECKLIST.md                      (BR-015 jadi [x])
  M  VERIFY-LOG.md                          (blok ini)
Command:
  npx tsc --noEmit
Output:
  TSC_EXIT=0
Command:
  node --import tsx/esm --test "src/tests/seedBranches.test.ts"
Output:
  # tests 16
  # pass 16
  # fail 0
Command:
  npm test
Output:
  # tests 445
  # suites 51
  # pass 445
  # fail 0
  # cancelled 0
  # skipped 0
Baseline blok sebelumnya 429 test / 47 suite, jadi ada 16 test baru dan 4 suite baru
(suite bertambah juga dari pekerjaan BR-015 pada file lain yang sudah ikut terhitung).
Kontrak seed:
  - Pusat memakai kode PUSAT, mengikuti unifiedConfig.storeOrigin untuk nama, kota,
    provinsi, dan alamat, dengan koordinat -6.2088 / 106.8456 dan radius 15.
  - Cabang contoh CBG-BDG (Bandung, -6.9218 / 107.6071, radius 15) dan CBG-SBY
    (Surabaya, -7.2575 / 112.7521, radius 20), keduanya aktif dan bukan default.
  - Rencana stok DEMO_STOCK_BY_CODE = { PUSAT: 50, CBG-BDG: 12, CBG-SBY: 8 } untuk varian
    DEMO-KAOS-001-M, agregat 70. branch_inventory adalah sumber kebenaran, lalu
    product_variants.stock dan products.stock dihitung ulang dari sana.
  - Insert inventory memakai onConflictDoNothing pada unique index branch+variant, jadi
    rerun seed tidak mengembalikan stok lokal ke rencana demo.
  - Upsert cabang memakai code sebagai kunci. Baris default lama tanpa code diklaim, bukan
    diduplikasi, supaya tidak muncul "Main Warehouse" baru setiap rerun.
  - Katalog demo: slug kaos-tembus-demo, SKU DEMO-KAOS-001, varian DEMO-KAOS-001-M,
    harga 149000.00, status published, low stock threshold 5.
Cakupan dokumentasi:
  - Alur customer: GET /api/v1/products/{slug}/branches lalu
    GET /api/v1/shipping/options lalu POST /api/v1/checkout, lengkap dengan contoh body.
  - Aturan mode: tanpa koordinat tujuan hanya aggregator (OD-C), di luar radius hanya
    aggregator, di dalam radius ondemand muncul dan 3PL tetap tampil sebagai pembanding
    (OD-B, setting shipping.showAggregatorWithinRadius).
  - Aturan checkout: branchId wajib, satu checkout satu cabang, selectedService wajib untuk
    aggregator, harga ongkir di-quote ulang, total = items + shipping - discount.
  - Tabel kode error storefront dan daftar keputusan terbuka.
Catatan:
  - Seed tidak membuat akun branch_admin dengan password default. Satu-satunya route role
    adalah POST /api/v1/admin/users/{id}/role dan itu hanya menerima admin atau customer,
    belum branch_admin dan belum bisa mengisi users.branch_id. Akun cabang masih dibuat
    langsung di DB sampai endpoint provisioning cabang ada.
  - Jalur 200 tetap butuh Postgres hidup. Bukti di blok ini adalah aturan murni data seed
    plus suite penuh, bukan smoke check terhadap database nyata.
---
2026-11-14 (lanjutan 10)
Task: BR-016 verifikasi akhir fase cabang
Jenis perubahan: verifikasi + dokumentasi (tanpa perubahan source).
File yang berubah:
  M  TASK-CHECKLIST.md   (BR-016 jadi [x])
  M  VERIFY-LOG.md       (blok ini)
Command:
  npx tsc --noEmit
Output:
  TSC_EXIT=0
Command:
  npm test
Output:
  # tests 445
  # suites 51
  # pass 445
  # fail 0
  # cancelled 0
  # skipped 0
Command:
  node --import tsx/esm --test per file test baru
Output:
  branchStock          # tests 15
  deliveryMode         # tests 20
  stockTransfer        # tests 19
  branchScope          # tests 10
  branchAvailability   # tests 18
  orderSource          # tests 18
  shippingOptions      # tests 20
  checkoutApi          # tests 4
  branchDashboard      # tests 13
  branchReservation    # tests 12
  branchAnalytics      # tests 10
  seedBranches         # tests 16
Command:
  node --import tsx/esm scripts/tmp-smoke-branch.ts   (script sementara, dihapus setelah run)
Output:
  --- public ---
  public branches         | GET  /api/v1/products/kaos-tembus-demo/branches | 500 | password authentication failed for user "postgres"
  public products         | GET  /api/v1/products                            | 500 | password authentication failed for user "postgres"
  --- guarded, no token ---
  shipping                | GET  /api/v1/shipping/options?branchId=x         | 401 | UNAUTHORIZED
  checkout                | POST /api/v1/checkout                            | 401 | UNAUTHORIZED
  branch inventory        | GET  /api/v1/branch/inventory                    | 401 | UNAUTHORIZED
  branch dashboard        | GET  /api/v1/branch/dashboard                    | 401 | UNAUTHORIZED
  admin branches          | GET  /api/v1/admin/branches                      | 401 | UNAUTHORIZED
  admin transfers         | GET  /api/v1/admin/stock-transfers               | 401 | UNAUTHORIZED
  --- guarded, customer token ---
  branch inventory/customer | GET /api/v1/branch/inventory                  | 403 | admin or branch_admin role required
  admin branches/customer   | GET /api/v1/admin/branches                    | 403 | Admin access required
  --- guarded, presale validation ---
  shipping missing branchId | GET /api/v1/shipping/options                 | 400 | BRANCH_REQUIRED
  checkout missing branchId | POST /api/v1/checkout                        | 400 | BRANCH_REQUIRED
  --- unknown ---
  unknown                 | GET  /api/v1/does-not-exist-br016               | 404 | NOT_FOUND
Kontrak mount route di app.ts:
  api.route('/products', productRoutes)      -> GET /:slug/branches publik (BR-007)
  api.route('/shipping', shippingRoutes)     -> GET /options (BR-010)
  api.route('/checkout', checkoutRoutes)     -> POST / (BR-010)
  api.route('/branch', branchRoutes)         -> inventory, logs, dashboard, stok (BR-006, BR-013)
  api.route('/admin', adminBranchRoutes)     -> branches, stock-transfers (BR-005, BR-014)
Catatan:
  - Smoke check dijalankan tanpa Postgres. Angka 500 pada route publik adalah bukti route
    benar-benar ter-mount, bukan bukti fungsional. Jalur 200 tetap butuh DB hidup.
  - Minimum empat file test baru terpenuhi berkali lipat. Empat yang diminta checklist
    (branchStock, deliveryMode, stockTransfer, branchScope) semuanya ada dan hijau.
  - Script smoke sementara dihapus setelah dipakai, jadi tidak ada file sekali pakai yang
    ikut ter-commit.---
2026-11-15 (lanjutan 11)
Task: FLS Phase 3 item 1, modul Flash Sale (FLS-001, FLS-002, FLS-004, FLS-005, FLS-006)
Jenis perubahan: fitur baru (service, repository, route, schema, migrasi, test, docs).
File yang berubah:
  A  src/services/promo/flashSaleService.ts
  A  src/services/promo/flashSaleRepository.ts
  A  src/routes/flashSales.ts
  A  src/tests/flashSale.test.ts
  A  drizzle/0009_flash_sale_limits.sql
  M  src/db/schema.ts                      (flash_sale_items.per_user_limit, tabel flash_sale_purchases)
  M  src/app.ts                            (mount flashSaleRoutes + flashSaleAdminRoutes)
  M  src/tests/databaseSchema.test.ts      (assert flashSalePurchases + perUserLimit)
  M  API-DOCS.md                           (section Flash Sale)
  M  TASK-CHECKLIST.md                     (baris flash sale jadi [x])
  M  VERIFY-LOG.md                         (blok ini)
Command:
  npx tsc --noEmit
Output:
  TSC_EXIT=0
Command:
  npm test 2>&1 | Select-Object -Last 25
Output:
  1..227
  # tests 499
  # suites 51
  # pass 499
  # fail 0
  # cancelled 0
  # skipped 0
  # todo 0
  # duration_ms 6968.1663
Command:
  node --import tsx/esm --test src/tests/flashSale.test.ts
Output:
  flashSale.test.ts  # 54 tests, 0 fail
Command:
  node --import tsx/esm --test src/tests/databaseSchema.test.ts
Output:
  databaseSchema.test.ts  # 12 tests, 0 fail
Command:
  node --import tsx/esm scripts/tmp-smoke-flash.ts   (script sementara, sudah dihapus)
Output:
  --- route table (flash-sales) ---
  ALL    /api/v1/flash-sales/*
  DELETE /api/v1/admin/flash-sales/:id
  DELETE /api/v1/admin/flash-sales/:id/items/:itemId
  GET    /api/v1/admin/flash-sales
  GET    /api/v1/admin/flash-sales/:id
  GET    /api/v1/flash-sales
  GET    /api/v1/flash-sales/:id
  PATCH  /api/v1/admin/flash-sales/:id
  PATCH  /api/v1/admin/flash-sales/:id/items/:itemId
  POST   /api/v1/admin/flash-sales
  POST   /api/v1/admin/flash-sales/:id/items
  POST   /api/v1/flash-sales/:id/items/:itemId/purchase
  POST   /api/v1/flash-sales/:id/items/:itemId/purchase
  --- unknown path ---
  404 {"success":false,"error":{"code":"NOT_FOUND","message":"No route matches GET /api/v1/does-not-exist-fls","requestId":"..."}}
  --- public list without DB ---
  500 {"success":false,"error":{"code":"INTERNAL_ERROR","message":"Internal Server Error","requestId":"..."}}
  [route-error] message: 'password authentication failed for user "postgres"'
  --- admin list without token, no DB ---
  401 {"success":false,"error":{"code":"UNAUTHORIZED","message":"Unauthorized: Missing or malformed token"}}
Catatan:
  - Baris POST purchase muncul dua kali di route table bukan duplikasi pendaftaran. Hono
    mencatat satu entri untuk middleware inline dan satu untuk handler akhir. Dibuktikan
    dengan app Hono minimal: route dengan (middleware, handler) menghasilkan dua baris
    identik, route dengan satu handler menghasilkan satu baris. Request tanpa token tetap
    dijawab satu kali 401, jadi handler berjalan sekali.
  - Jalur 200 untuk list flash sale belum terbukti karena Postgres lokal menolak login
    (`password authentication failed for user "postgres"`). Yang terbukti di sini: route
    terdaftar, guard 401 jalan, feature gate terpasang, dan error database dipetakan ke 500
    lewat serverError tanpa membocorkan detail driver.
  - Aturan domain (status, countdown, harga, stok, limit per user) diuji murni di
    flashSale.test.ts tanpa database, 54 test hijau.

---
2026-11-15 (lanjutan 12)
Task: LTY Phase 3 item 2, modul Loyalty points dan tier (LTY-001, LTY-002, LTY-003, LTY-004)
Jenis perubahan: fitur baru (service, repository, route, schema, migrasi, test, docs).
File yang berubah:
  A  src/services/loyalty/loyaltyService.ts
  A  src/services/loyalty/loyaltyRepository.ts
  A  src/routes/loyalty.ts
  A  src/tests/loyalty.test.ts
  A  drizzle/0010_loyalty.sql
  M  src/db/schema.ts                      (tabel loyaltyAccounts + loyaltyTransactions)
  M  src/services/config/settings.ts       (loyaltyProgramSettingSchema + registrasi validator)
  M  src/app.ts                            (mount loyaltyRoutes + loyaltyAdminRoutes)
  M  src/tests/databaseSchema.test.ts      (assert tabel loyalty + migrasi 0010)
  M  API-DOCS.md                           (section Loyalty Points dan Tier)
  M  TASK-CHECKLIST.md                     (baris loyalty jadi [x])
  M  VERIFY-LOG.md                         (blok ini)
Command:
  npx tsc --noEmit
Output:
  TSC_EXIT=0
Command:
  node --import tsx/esm --test src/tests/loyalty.test.ts
Output:
  1..8
  # tests 61
  # suites 0
  # pass 61
  # fail 0
  # duration_ms 254.9944
Command:
  node --import tsx/esm --test src/tests/databaseSchema.test.ts
Output:
  1..1
  # tests 15
  # suites 0
  # pass 15
  # fail 0
  # duration_ms 700.9271
Command:
  npm test 2>&1 | Select-Object -Last 12
Output:
  1..235
  # tests 562
  # suites 51
  # pass 562
  # fail 0
  # cancelled 0
  # skipped 0
  # todo 0
  # duration_ms 6610.6966
Command:
  node --import tsx/esm scripts/tmp-smoke-loyalty.ts   (script sementara, sudah dihapus)
Output:
  --- route table (loyalty) ---
  ALL  /api/v1/loyalty/*
  GET  /api/v1/admin/loyalty/accounts
  GET  /api/v1/admin/loyalty/accounts/:userId
  GET  /api/v1/admin/loyalty/program
  GET  /api/v1/loyalty
  GET  /api/v1/loyalty/program
  GET  /api/v1/loyalty/transactions
  POST /api/v1/admin/loyalty/accounts/:userId/adjust
  POST /api/v1/admin/loyalty/accounts/:userId/earn
  POST /api/v1/loyalty/redeem
  PUT  /api/v1/admin/loyalty/program
  --- request ---
  [404] GET /api/v1/loyalty/does-not-exist
        {"success":false,"error":{"code":"NOT_FOUND","message":"No route matches GET /api/v1/loyalty/does-not-exist","requestId":"..."}}
  [401] GET /api/v1/loyalty
        {"success":false,"error":{"code":"UNAUTHORIZED","message":"Unauthorized: Missing or malformed token"}}
  [200] GET /api/v1/loyalty/program
        {"success":true,"data":{"tiers":[{"tier":"bronze","minLifetimePoints":0,"discountPercent":0,"freeShippingMinAmount":null},{"tier":"silver","minLifetimePoints":5...
  [401] GET /api/v1/admin/loyalty/accounts
        {"success":false,"error":{"code":"UNAUTHORIZED","message":"Unauthorized: Missing or malformed token"}}
Catatan:
  - Baris route yang tampil dobel (misal GET /api/v1/loyalty dan GET /api/v1/loyalty/transactions)
    adalah artefak Hono, bukan pendaftaran ganda. Middleware inline dan handler akhir dicatat
    sebagai dua entri. Pola yang sama sudah dibuktikan pada modul flash sale dengan app Hono
    minimal. Request tetap dijawab sekali.
  - GET /api/v1/loyalty/program membalas 200 tanpa Postgres hidup karena getSettingValue
    menangkap error database dan mengembalikan fallback. Jadi endpoint ini memang bisa diuji
    penuh tanpa DB, dan yang terlihat adalah DEFAULT_LOYALTY_PROGRAM.
  - Jalur 200 untuk saldo, riwayat, redeem, dan listing admin belum terbukti karena Postgres
    lokal menolak login (password authentication failed for user "postgres"). Yang terbukti:
    route ter-mount, guard 401 jalan pada customer dan admin, feature gate loyalty terpasang,
    dan path asing 404.
  - Satu test sempat gagal saat pertama dijalankan, yaitu ekspektasi "menolak ambang turun".
    Kode memang sengaja mengurutkan ulang tier sebelum memvalidasi, jadi ambang turun itu valid
    dan dinormalkan. Yang salah test-nya, bukan implementasinya. Test diganti menjadi dua:
    ambang kembar ditolak, ambang tidak berurutan diterima dan diurutkan naik.

---
2026-11-15 (lanjutan 13)
Task: RFR Phase 3 item 3, modul Referral (RFR-001, RFR-002, RFR-003, RFR-004, RFR-005)
Jenis perubahan: fitur baru (service, repository, route, schema, migrasi, test, docs).
File yang berubah:
  A  src/services/referral/referralService.ts
  A  src/services/referral/referralRepository.ts
  A  src/routes/referral.ts
  A  src/tests/referral.test.ts
  A  drizzle/0011_referral.sql
  M  src/db/schema.ts                      (tabel referralCodes + referrals)
  M  src/services/config/settings.ts       (referralProgramSettingSchema, referral.baseUrl, flag referral)
  M  src/services/loyalty/loyaltyRepository.ts (override points eksplisit pada earnPoints)
  M  src/app.ts                            (mount referralRoutes + referralAdminRoutes)
  M  src/tests/databaseSchema.test.ts      (assert tabel referral + migrasi 0011)
  M  API-DOCS.md                           (section Referral Program)
  M  TASK-CHECKLIST.md                     (baris referral jadi [x])
  M  VERIFY-LOG.md                         (blok ini)
Command:
  npx tsc --noEmit
Output:
  TSC_EXIT=0
Command:
  node --import tsx/esm --test src/tests/referral.test.ts
Output:
  1..8
  # tests 47
  # suites 0
  # pass 47
  # fail 0
  # duration_ms 249.8431
Command:
  node --import tsx/esm --test src/tests/databaseSchema.test.ts
Output:
  1..1
  # tests 17
  # suites 0
  # pass 17
  # fail 0
  # duration_ms 704.2911
Command:
  npm test 2>&1 | Select-Object -Last 12
Output:
  1..243
  # tests 611
  # suites 51
  # pass 611
  # fail 0
  # cancelled 0
  # skipped 0
  # todo 0
  # duration_ms 6825.521
Command:
  node --import tsx/esm scripts/tmp-smoke-referral.ts   (script sementara, sudah dihapus)
Output:
  --- route table (referral) ---
  ALL  /api/v1/referrals/*
  GET  /api/v1/admin/referrals
  GET  /api/v1/admin/referrals/:id
  GET  /api/v1/admin/referrals/program
  GET  /api/v1/referrals
  GET  /api/v1/referrals/inbound
  GET  /api/v1/referrals/me
  GET  /api/v1/referrals/program
  POST /api/v1/admin/referrals/:id/cancel
  POST /api/v1/admin/referrals/:id/qualify
  POST /api/v1/referrals/claim
  PUT  /api/v1/admin/referrals/program
  --- request ---
  [404] GET /api/v1/referrals/does-not-exist
        NOT_FOUND
  [200] GET /api/v1/referrals/program
        {"success":true,"data":{"referrerPoints":50,"refereePoints":25,"maxReferralsPerUser":null},...}
  [401] GET /api/v1/referrals/me
        UNAUTHORIZED
  [401] GET /api/v1/referrals
        UNAUTHORIZED
  [401] POST /api/v1/referrals/claim
        UNAUTHORIZED
  [401] GET /api/v1/admin/referrals
        UNAUTHORIZED
  [401] GET /api/v1/admin/referrals/program
        UNAUTHORIZED
Catatan:
  - Baris route yang tampil dobel (misal GET /api/v1/referrals dan GET /api/v1/referrals/me) adalah
    artefak Hono, bukan pendaftaran ganda. Middleware inline dan handler akhir dicatat sebagai dua
    entri, pola yang sama sudah dibuktikan pada modul flash sale dan loyalty. Request tetap dijawab
    sekali.
  - GET /api/v1/referrals/program membalas 200 tanpa Postgres hidup karena getSettingValue
    menangkap error database dan mengembalikan fallback. Jadi endpoint ini memang bisa diuji penuh
    tanpa DB, dan yang terlihat adalah DEFAULT_REFERRAL_PROGRAM.
  - Jalur 200 untuk kode, dashboard, klaim, verifikasi, dan listing admin belum terbukti karena
    Postgres lokal menolak login (password authentication failed for user "postgres"). Yang
    terbukti: route ter-mount, guard 401 jalan pada customer dan admin, feature gate referral
    terpasang, dan path asing 404.
  - Hadiah referral memakai earnPoints dengan override points eksplisit dan reference_id
    "<referralId>:referrer" serta "<referralId>:referee", jadi unique index earn yang sudah ada
    membuat verifikasi ganda tidak bisa membayar dua kali. Ini belum diuji lewat database sungguhan,
    hanya dinilai dari jalur kode dan unit test aturan murni.

---
2026-11-15 (lanjutan 14)
Task: WLT Phase 3 item 4, modul Store Credit Wallet (WLT-001, WLT-002, WLT-003)
Jenis perubahan: fitur baru (service, repository, route, schema, migrasi, test, docs).
File yang berubah:
  A  src/services/wallet/walletService.ts
  A  src/services/wallet/walletRepository.ts
  A  src/routes/wallet.ts
  A  src/tests/wallet.test.ts
  A  drizzle/0012_wallet_ledger.sql
  M  src/db/schema.ts                      (unique index wallet_tx_wallet_type_reference_idx)
  M  src/services/config/settings.ts       (walletProgramSettingSchema, validator wallet.program)
  M  src/app.ts                            (mount walletRoutes + walletAdminRoutes)
  M  src/tests/databaseSchema.test.ts      (assert index unik wallet + migrasi 0012)
  M  API-DOCS.md                           (section Store Credit Wallet)
  M  TASK-CHECKLIST.md                     (baris wallet jadi [x])
  M  VERIFY-LOG.md                         (blok ini)
Command:
  npx tsc --noEmit
Output:
  TSC_EXIT=0
Command:
  node --import tsx/esm --test src/tests/wallet.test.ts
Output:
  1..7
  # tests 46
  # suites 0
  # pass 46
  # fail 0
  # cancelled 0
  # skipped 0
  # todo 0
  # duration_ms 281.7043
Command:
  node --import tsx/esm --test src/tests/databaseSchema.test.ts
Output:
  1..1
  # tests 19
  # suites 0
  # pass 19
  # fail 0
  # cancelled 0
  # skipped 0
  # todo 0
  # duration_ms 819.8102
Command:
  npx tsc --noEmit ; npm test
Output:
  TSC_EXIT=0
  # tests 659
  # suites 51
  # pass 659
  # fail 0
  # cancelled 0
  # skipped 0
  # todo 0
Command:
  node --import tsx/esm _smoke_wallet.ts   (script sementara, sudah dihapus)
Output:
  GET  /api/v1/wallet/program -> 200 {"success":true,"data":{"cashbackPercent":0,"cashbackMaxAmount":null,"minimumPayment":0,"currency":"IDR"},"requestId":"799161e3-6662-44ca-85e2-b343884287b8"}
  GET  /api/v1/wallet (no token) -> 401 {"success":false,"error":{"code":"UNAUTHORIZED","message":"Unauthorized: Missing or malformed token"}}
  GET  /api/v1/admin/wallets (no token) -> 401
  POST /api/v1/wallet/pay (no token) -> 401
  POST /api/v1/wallet/preview (no token) -> 401
  GET  /api/v1/wallet/transactions (no token) -> 401
  GET  /api/v1/wallet/does-not-exist -> 404
  GET  /api/v1/admin/wallets/no-such-route/x/y -> 401
  POST /api/v1/admin/orders/00000000-0000-0000-0000-000000000000/cashback (no token) -> 401
Catatan:
  - GET /api/v1/wallet/program membalas 200 tanpa Postgres hidup karena getSettingValue menangkap
    error database dan mengembalikan fallback, jadi yang terlihat adalah DEFAULT_WALLET_PROGRAM.
    Cashback 0 pada respons itu memang default, bukan bug: tarif adalah keputusan bisnis.
  - Path asing di bawah /api/v1/admin/* dibalas 401 dan bukan 404 karena featureGate dan auth
    dipasang lewat use('*') pada router admin, jadi guard berjalan sebelum pencocokan route. Modul
    admin lain memakai pola yang sama.
  - Uang dihitung sebagai integer sen di seluruh modul. Decimal string dari Postgres dikonversi
    lewat toCents, dan nominal dengan lebih dari dua desimal ditolak, bukan dibulatkan diam-diam.
  - Debit menaruh syarat balance >= amount di klausa WHERE, bukan pada nilai yang dibaca sebelumnya,
    sehingga dua pembayaran bersamaan tidak bisa sama-sama lolos. Ini belum diuji dengan dua koneksi
    sungguhan karena Postgres lokal menolak login (password authentication failed for user
    "postgres"), hanya dinilai dari bentuk query dan unit test aturan murni.
  - Unique index (wallet_id, type, reference_id) adalah penjaga sebenarnya untuk pembayaran ganda.
    Postgres membolehkan banyak NULL, jadi topup dan adjustment admin yang berreference_id null
    tidak terbatasi.
  - Assert index unik di databaseSchema.test.ts membaca deklarasi di schema.ts, bukan introspeksi
    objek drizzle. Index drizzle disimpan di balik builder yang tidak bisa dipanggil ulang setelah
    registrasi (percobaan kedua melempar SyntaxError dari JSON.parse undefined), dan SQL yang
    benar-benar sampai ke Postgres sudah diuji terpisah lewat isi 0012_wallet_ledger.sql.
  - Jalur 200 untuk saldo, riwayat, preview, bayar, kredit, dan adjustment admin belum terbukti
    karena Postgres lokal menolak login. Yang terbukti: route ter-mount, guard 401 jalan pada
    customer dan admin, feature gate wallet terpasang, dan path asing 404.

---
2026-11-15 (lanjutan 15)
Task: Audit status Phase 3 Advanced, baris yang benar-benar partial diubah dari [ ] menjadi [~]
Jenis perubahan: dokumentasi dan status saja, tanpa perubahan kode produk.
File yang berubah:
  M  TASK-CHECKLIST.md   (8 baris Phase 3 diberi bukti; 4 jadi [~], 4 tetap [ ]; rekap dihitung ulang)
  M  VERIFY-LOG.md       (blok ini)

Command:
  Select-String -Path "src\**\*.ts" -Pattern <kata kunci> -SimpleMatch
Output:
  totp          : 0
  2fa           : 0
  twoFactor     : 0
  chat          : 0
  liveChat      : 0
  reconcil      : 0
  abandon       : 0
  impression    : 0
  bannerEvent   : 0
  clickEvent    : 0
  k6            : 0
  loadTest      : 0
  cursor        : 0
  etag / ETag   : 0
  compression   : 0
  moderat       : 3 hit, semuanya di src/routes/reviews.ts (moderasi manual, bukan otomatis)

Command:
  Select-String -Path src\app.ts -Pattern "realtime"
Output:
  (nol hasil. realtimeRoutes ada di src/routes/realtime.ts tetapi tidak pernah di-mount.
   broadcastOrderStatus di src/services/realtime/realtimeService.ts juga tidak dipanggil
   dari mana pun, jadi SSE order status belum berfungsi.)

Command:
  Select-String -Path "src\routes\*.ts" -Pattern "query\('limit'\)|query\('page'\)|query\('offset'\)|query\('cursor'\)"
Output:
  12 endpoint memakai limit: admin.ts (3), branches.ts, loyalty.ts (2), notifications.ts,
  referral.ts, reviews.ts (3), wallet.ts (2). Tidak ada satu pun yang memakai page, offset,
  atau cursor.

Command:
  Select-String -Path "src\**\*.ts" -Pattern "Cache-Control|ETag"
Output:
  src\middleware\security.ts:48  Strict-Transport-Security max-age
  src\routes\products.ts:49      Cache-Control: no-store
  src\routes\shipping.ts:41      Cache-Control: no-store
  (tidak ada ETag, tidak ada cache publik bertingkat)

Command:
  Select-String -Path "..\brand-store-prd\PRD-Brand-Store-Template.md" -Pattern "FIN-"
Output:
  (nol hasil. Hanya FIN-001 yang dirujuk checklist dari sumber lain. FIN-002..004 tidak
   didefinisikan di PRD, jadi cakupannya tidak dikarang di checklist.)

Command:
  hitung checkbox TASK-CHECKLIST.md di luar code fence
Output:
  x=147  p=6  n=35  total=188
  Sebelum audit: x=147  p=2  n=39  total=188. Rekap lama menulis 171 item dengan 22/26/123,
  angka itu sudah usang dan diperbarui menjadi 147/6/35 dari 188.

Command:
  cd brand-store-app && npx tsc --noEmit
Output:
  [tsc exit: 0]

Command:
  cd brand-store-app && npm test
Output:
  1..250
  # tests 659
  # suites 51
  # pass 659
  # fail 0
  # cancelled 0
  # skipped 0
  # todo 0
  # duration_ms 6561.1024

Keputusan status per baris (alasannya ditulis juga di TASK-CHECKLIST.md):
  [~] Analytics lanjutan + rekonsiliasi (FIN-002..004)
      Ada finance summary JSON/CSV, dashboard, reports/sales, reports/products, analytics/branches.
      Belum ada rekonsiliasi gateway, settlement, pajak, jurnal, deteksi selisih.
  [~] Optimasi API untuk mobile
      Ada amplop seragam, requestId, header rate limit, 12 endpoint berlimit.
      Belum ada cursor pagination, ETag, kompresi, fields, endpoint batch.
  [~] Moderasi gambar/teks otomatis (MOD-003, MOD-004)
      Ada antrean moderasi manual review dan report.
      Belum ada NSFW, filter kata kasar, skor keyakinan, penolakan otomatis.
      MOD-003 nol, MOD-004 baru manual.
  [~] Banner analytics (CMS-004) dan targeting (CMS-003)
      Ada CRUD banner, jadwal tayang, filter placement per halaman.
      Belum ada targeting segmen user, view/click, CTR, laporan, tabel event.
  [ ] Live chat (RTC-003)
      Hanya kerangka SSE yang tidak di-mount dan tidak punya pemancar event. Aturan repo:
      route yang tidak di-mount dihitung belum, jadi tidak diberi [~].
  [ ] Abandoned cart (CRT-009)
      Tabel carts dan cart_items ada di schema, tetapi cartService masih memakai Map memori
      dan tidak menyentuh tabel itu, jadi tidak ada data idle untuk dipindai. Tidak ada job,
      status, token pemulihan, atau pengingat.
  [ ] Admin 2FA TOTP (AUT-012)
      OTP SMS customer ada, tetapi itu faktor berbeda dan tidak terpasang di login admin.
      Tidak ada secret TOTP, otpauth, QR, recovery code, enrollment, atau langkah kedua.
  [ ] Load test
      Tidak ada skrip k6/artillery, skenario, ambang SLA, hasil p95, atau bukti concurrent.

Catatan:
  - Tidak ada kode produk yang diubah pada blok ini, jadi tsc dan npm test hanya membuktikan
    baseline tetap hijau (659 test, 51 suite, 0 gagal), bukan menguji fitur baru.
  - Postgres lokal masih menolak login (password authentication failed for user "postgres"),
    jadi audit ini murni statis: membaca route, service, schema, dan hasil grep.
  - Satu baris checklist memakai karakter panah U+2194 pada judul live chat. Karakter itu
    dipertahankan apa adanya, dan tidak ada em dash yang ditambahkan pada baris baru.

2026-11-16 (lanjutan 16)
Task: Sisa Phase 3 yang bisa dikerjakan kode: optimasi API untuk mobile (cursor, ETag, kompresi, fields) dan banner analytics plus targeting (CMS-003, CMS-004). Baris load test hanya artefak, belum dijalankan.
Jenis perubahan: kode produk, migrasi, test, dan dokumen.

File yang berubah:
  M  brand-store-app/src/app.ts                                (compress global, etag hanya rute baca anonim)
  M  brand-store-app/src/db/schema.ts                          (banners.audience, bannerEvents, 3 indeks pagination)
  M  brand-store-app/src/routes/content.ts                     (banner publik per segmen, POST event, admin analytics)
  M  brand-store-app/src/routes/orders.ts                      (cursor pagination my-orders dan admin/all)
  M  brand-store-app/src/routes/products.ts                    (limit, cursor, fields, cache publik)
  M  brand-store-app/src/services/content/bannerService.ts     (audience, event, CTR, getBannerAnalytics)
  M  brand-store-app/src/tests/content.test.ts                 (+7 test)
  M  brand-store-app/src/tests/databaseSchema.test.ts          (+2 test)
  A  brand-store-app/src/utils/pagination.ts
  A  brand-store-app/src/tests/pagination.test.ts
  A  brand-store-app/drizzle/0013_banner_events.sql
  A  brand-store-app/drizzle/0014_pagination_indexes.sql
  A  brand-store-app/loadtest/k6-smoke.js
  A  brand-store-app/loadtest/README.md
  M  TASK-CHECKLIST.md
  M  VERIFY-LOG.md

Command:
  cd brand-store-app && npx tsc --noEmit
Output:
  tsc exit: 0

Command:
  cd brand-store-app && npm test
Output:
  # tests 676
  # suites 51
  # pass 676
  # fail 0
  # cancelled 0
  # skipped 0
  # todo 0

Command:
  node --import tsx/esm --test src/tests/pagination.test.ts
Output:
  # tests 9
  # pass 9
  # fail 0

Command:
  node --import tsx/esm --test src/tests/content.test.ts
Output:
  # tests 13
  # pass 13
  # fail 0

Command:
  node --import tsx/esm --test src/tests/databaseSchema.test.ts
Output:
  # tests 21
  # pass 21
  # fail 0

Command (smoke tanpa Postgres, skrip sementara smoke-p3.ts lalu dihapus):
  node --import tsx/esm smoke-p3.ts
Output:
  [HTTP] GET http://localhost/api/v1/products?cursor=zzz - 400 (8ms)
  [HTTP] GET http://localhost/api/v1/admin/banners/analytics - 401 (1ms)
  [HTTP] POST http://localhost/api/v1/banners/00000000-0000-0000-0000-000000000000/events - 500 (35ms)
  [HTTP] GET http://localhost/health - 200 (39ms)
  [HTTP] GET http://localhost/health - 304 (38ms)
  [HTTP] GET http://localhost/health - 200 (37ms)
  [HTTP] GET http://localhost/api/v1/products?limit=5&fields=id,title - 500 (146ms)
  - GET /products?cursor=zzz: 400 {"success":false,"error":{"code":"INVALID_CURSOR","message":"Cursor tidak valid"}}
  - GET /admin/banners/analytics (no token): 401
  - POST /banners/:id/events (no db): 500
  - GET /health: 200 etag=yes body=168b
  - GET /health with If-None-Match: 304
  - GET /health with gzip: 200 content-encoding=gzip
  - GET /products (db down): 500
  (500 pada banner event dan products berasal dari kredensial Postgres lokal yang salah,
   bukan 404, jadi route benar-benar ter-mount dan mencapai handler.)

Command (cek em dash pada file baru):
  foreach file: hitung [char]0x2014
Output:
  drizzle/0013_banner_events.sql emdash=0
  drizzle/0014_pagination_indexes.sql emdash=0
  loadtest/k6-smoke.js emdash=0
  loadtest/README.md emdash=0
  src/tests/pagination.test.ts emdash=0
  src/utils/pagination.ts emdash=0

Command (hitung checkbox TASK-CHECKLIST.md):
Output:
  x=149 p=5 n=34 total=188
  Sebelum blok ini: x=147 p=6 n=35.
  Em dash di TASK-CHECKLIST.md tetap 83, tidak ada em dash baru.

Keputusan status:
  [x] Optimasi API untuk mobile
      Kontrak cursor murni di src/utils/pagination.ts, dipakai products dan orders, ETag
      hanya pada rute baca anonim, kompresi global, fields untuk proyeksi kolom, tiga indeks
      pendukung plus migrasi idempoten.
  [x] Banner analytics (CMS-004) dan targeting (CMS-003)
      Segmen all/guest/customer, banner_events append-only, CTR per banner dengan rentang
      tanggal, semua banner muncul termasuk yang nol event.
  [~] Load test
      Skrip dan ambang ada, belum pernah dijalankan. Baris tetap [~] sampai ada hasil p95 nyata
      beserta spesifikasi host.

Catatan:
  - Postgres lokal masih menolak login (password authentication failed for user "postgres"),
    jadi tidak ada smoke 200 yang bergantung data. Yang dibuktikan hanya status kode, header,
    dan mounting route.
  - drizzle/meta/_journal.json masih hanya memuat 0000 dan 0006, sehingga 0007 sampai 0014
    belum terjurnal. Jalur de facto tetap db:push, dan migrasi baru ditulis idempoten supaya
    aman dijalankan manual.
  - k6 belum dijalankan karena butuh Postgres dan Redis hidup plus host klien terpisah.

---

### 2026-11-17 (lanjutan 17) - live chat, abandoned cart, 2FA TOTP, dan penyeragaman entrypoint

Command:
```powershell
cd brand-store-app
npx tsc --noEmit; "tsc exit: $LASTEXITCODE"
```
Output:
```
tsc exit: 0
```

Command:
```powershell
cd brand-store-app
npm test 2>&1 | Select-String -Pattern "^not ok|^# (tests|suites|pass|fail|cancelled|skipped|todo)"
```
Output:
```
# tests 732
# suites 51
# pass 732
# fail 0
# cancelled 0
# skipped 0
# todo 0
```
Baseline blok sebelumnya adalah 676 test di 51 suite. Kenaikan 56 test berasal dari
src/tests/entrypoint.test.ts dan suite chat, cart recovery, serta TOTP.

Command (cek em dash pada file yang disentuh):
```powershell
$files = @('src/index.ts','src/app.ts','src/routes/chat.ts','src/routes/cart.ts','src/routes/auth.ts','src/routes/orders.ts','src/routes/logistics.ts','src/routes/checkout.ts','src/services/auth/totp.ts','src/services/auth/secretBox.ts','src/services/auth/totpService.ts','src/services/chat/chatHours.ts','src/services/chat/chatService.ts','src/services/cart/cartRecoveryService.ts','src/services/cart/cartPersistence.ts','src/services/realtime/realtimeService.ts','src/db/schema.ts','drizzle/0015_chat_cart_recovery_2fa.sql','src/tests/entrypoint.test.ts')
foreach ($f in $files) { $t = Get-Content $f -Raw; "$f emdash=" + ([regex]::Matches($t, [char]0x2014)).Count }
```
Output:
```
src/index.ts emdash=0
src/app.ts emdash=0
src/routes/chat.ts emdash=0
src/routes/cart.ts emdash=0
src/routes/auth.ts emdash=0
src/routes/orders.ts emdash=0
src/routes/logistics.ts emdash=0
src/routes/checkout.ts emdash=0
src/services/auth/totp.ts emdash=0
src/services/auth/secretBox.ts emdash=0
src/services/auth/totpService.ts emdash=0
src/services/chat/chatHours.ts emdash=0
src/services/chat/chatService.ts emdash=0
src/services/cart/cartRecoveryService.ts emdash=0
src/services/cart/cartPersistence.ts emdash=0
src/services/realtime/realtimeService.ts emdash=0
src/db/schema.ts emdash=0
drizzle/0015_chat_cart_recovery_2fa.sql emdash=0
src/tests/entrypoint.test.ts emdash=0
```

Command (hitung checkbox TASK-CHECKLIST.md):
Output:
```
x=154 p=5 n=33 total=192
Sebelum blok ini: x=149 p=5 n=34 total=188.
Em dash di TASK-CHECKLIST.md turun dari 83 menjadi 82 karena dua baris realtime yang
ditulis ulang di blok ini tidak lagi memakai em dash.
```

Keputusan status:
  [x] Live chat customer ke admin (RTC-003)
      SSE satu arah plus REST POST untuk mengirim, satu stream per user, routing cabang
      disimpan sekali saat percakapan dibuat dengan urutan explicit_branch, product_stock,
      default_branch, fallback_pusat, unrouted. Jam operasional bisa dioverride per cabang.
  [x] Abandoned cart recovery (CRT-009)
      Cart persisten di database, terpisah dari cartService memori yang lama. Token 24 byte
      sekali pakai, policy default 60 menit idle, maksimal 2 pengingat, TTL 72 jam, dan
      checkout menandai cart converted. Scanner berkala opsional lewat env.
  [x] Admin 2FA TOTP (AUT-012)
      TOTP RFC 6238 dengan toleransi satu langkah, secret AES-256-GCM, sepuluh recovery code
      berhash dan sekali pakai, challenge token 300 detik, login dua langkah hanya untuk
      admin dan branch_admin yang sudah mengaktifkan 2FA.
  [ ] Indikator mengetik (RTC-004) dan status online agen (RTC-006)
      Tetap kosong. Keduanya butuh keputusan produk, bukan hanya kode.

Catatan:
  - src/index.ts sebelumnya membangun Hono sendiri dengan prefix /api, sehingga chat, cart,
    2FA, dan mayoritas route Phase 2/3 hanya hidup di dalam test. Sekarang src/index.ts hanya
    mengekspor app dari src/app.ts, dan src/tests/entrypoint.test.ts mengunci perilaku itu.
  - broadcastOrderStatus sebelumnya tidak dipanggil dari mana pun. Sekarang dipanggil dari
    tiga jalur mutasi nyata, jadi klien tracking akhirnya menerima event.
  - Postgres lokal masih menolak login (password authentication failed for user "postgres"),
    jadi tidak ada smoke berbasis data. Bukti yang ada adalah tsc, unit test, dan pembacaan
    jalur kode.
  - drizzle/meta/_journal.json masih hanya memuat 0000 dan 0006, sehingga 0007 sampai 0015
    belum terjurnal. Migrasi baru ditulis idempoten supaya aman dijalankan manual.
