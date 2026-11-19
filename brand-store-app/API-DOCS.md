# API Documentation - Brand Store App (Phase 1)

Base URL: \/api/v1\

## Authentication Endpoints
- \POST /api/v1/auth/register\: Register a new customer or admin account.
- \POST /api/v1/auth/login\: Authenticate and receive access & refresh tokens.
- \POST /api/v1/auth/refresh\: Rotate refresh token and get new access token.

## Inventory Endpoints
- \GET /api/v1/inventory/{variantId}\: Get current stock and reserved status for a product variant.

## Checkout & Cart Endpoints
- \POST /api/v1/cart/items\: Add item to user or guest cart.
- \POST /api/v1/checkout/process\: Process cart checkout, reserve stock, and generate order.

## Logistics Endpoints
- \POST /api/v1/logistics/calculate-rates\: Calculate shipping rates based on destination and weight.
- \POST /api/v1/logistics/shipments\: Create a shipment for an order.

## Multi Cabang: Alur Customer Memilih Cabang

Modelnya: cabang adalah penjual di dalam satu brand. Customer memilih cabang, bukan sistem yang
memilihkan cabang terdekat. Jarak dari cabang yang dipilih hanya menentukan mode pengiriman.

Data contoh dari `npm run db:seed`:

| Kode | Nama | Kota | Stok demo |
| --- | --- | --- | --- |
| `PUSAT` | `unifiedConfig.storeOrigin.name` | `unifiedConfig.storeOrigin.city` | 50 |
| `CBG-BDG` | TEMBUS Cabang Bandung | Bandung | 12 |
| `CBG-SBY` | TEMBUS Cabang Surabaya | Surabaya | 8 |

Produk demo: `kaos-tembus-demo`, varian `DEMO-KAOS-001-M`, harga 149000. Total agregat 70 karena
`branch_inventory` adalah sumber kebenaran dan `product_variants.stock` dihitung ulang dari sana.

### Langkah 1: lihat cabang yang benar-benar bisa mengirim produk

`GET /api/v1/products/{slug}/branches?lat={latitude}&lng={longitude}`

Publik, tanpa token. Cabang dengan stok tersedia 0, tidak aktif, atau offline tidak muncul sama
sekali. `lat` dan `lng` opsional; tanpa koordinat customer, `distanceKm` bernilai `null` dan hanya
3PL yang dianggap mungkin.

```json
{
  "success": true,
  "data": {
    "productId": "uuid",
    "productSlug": "kaos-tembus-demo",
    "branches": [
      {
        "branchId": "uuid",
        "code": "CBG-BDG",
        "name": "TEMBUS Cabang Bandung",
        "city": "Bandung",
        "available": 12,
        "stockStatus": "in_stock",
        "distanceKm": 2.4,
        "ondemandAvailable": true,
        "availableModes": ["ondemand", "aggregator"]
      }
    ],
    "reason": null
  }
}
```

Kalau tidak ada cabang yang punya stok, `branches` kosong dan `reason` bernilai
`no_branch_has_stock`.

### Langkah 2: minta opsi pengiriman untuk cabang itu

`GET /api/v1/shipping/options?branchId={id}&addressId={id}`

Butuh token customer. `addressId` dipakai untuk mengambil alamat milik customer tersebut. Kalau
alamat tidak dikirim, tujuan diambil dari query: `city`, `postalCode`, `latitude`, `longitude`.
Query tambahan: `weightGrams` (default 1000), `value`, `cod=1`.

```json
{
  "success": true,
  "data": {
    "branch": { "id": "uuid", "code": "CBG-BDG", "name": "TEMBUS Cabang Bandung", "city": "Bandung" },
    "destination": {
      "addressId": "uuid",
      "city": "Bandung",
      "postalCode": "40111",
      "coordinates": { "latitude": -6.92, "longitude": 107.6 }
    },
    "modes": ["ondemand", "aggregator"],
    "reason": "within_radius",
    "distanceKm": 2.4,
    "radiusKm": 15,
    "weightGrams": 1000,
    "currency": "IDR",
    "options": [
      {
        "mode": "ondemand",
        "provider": "tembus",
        "service": "instant",
        "name": "Tembus Instant",
        "cost": 18000,
        "estimatedDays": "1-3 jam"
      },
      {
        "mode": "aggregator",
        "provider": "tembus",
        "service": "reguler",
        "name": "Tembus Reguler",
        "cost": 12000,
        "estimatedDays": "2-3 hari"
      }
    ],
    "unavailable": []
  }
}
```

Aturan yang berlaku:

- Tanpa koordinat tujuan, `modes` hanya `["aggregator"]` dan `reason` bernilai
  `no_destination_coords`.
- Di luar radius, `modes` hanya `["aggregator"]` dan `reason` bernilai `outside_radius`.
- Di dalam radius, ondemand muncul. 3PL tetap ditampilkan sebagai pembanding harga selama
  `shipping.showAggregatorWithinRadius` aktif (default `true`).
- Opsi yang gagal di-quote provider masuk ke `unavailable[]` dengan `reason` dan `message`, bukan
  menghilang tanpa penjelasan.
- Urutan opsi: mode (ondemand dulu), lalu harga, lalu nama.

### Langkah 3: checkout dengan cabang dan opsi yang dipilih

`POST /api/v1/checkout`

```json
{
  "branchId": "uuid-cabang-bandung",
  "addressId": "uuid-alamat",
  "items": [
    { "productId": "uuid-produk", "quantity": 1, "branchId": "uuid-cabang-bandung" }
  ],
  "shippingAddress": {
    "recipientName": "Nama Penerima",
    "phone": "+628123456789",
    "addressLine": "Jl. Contoh No. 1",
    "city": "Bandung",
    "province": "Jawa Barat",
    "postalCode": "40111",
    "latitude": -6.92,
    "longitude": 107.6
  },
  "selectedMode": "ondemand",
  "selectedService": "instant",
  "weightGrams": 1000
}
```

Aturan checkout:

- `branchId` wajib. Kalau tidak dikirim di level atas, nilai diambil dari `items[].branchId`.
  Tanpa keduanya, response `BRANCH_REQUIRED` 400.
- Satu checkout hanya untuk satu cabang. Baris dengan cabang berbeda ditolak
  `MULTI_BRANCH_CHECKOUT_UNSUPPORTED` 400.
- Semua baris di-pin ke cabang terpilih sebelum order dibuat.
- `selectedService` wajib untuk mode aggregator. Tanpa itu response `SHIPPING_SERVICE_REQUIRED`.
- Service yang tidak ada di daftar opsi ditolak `SHIPPING_SERVICE_NOT_AVAILABLE` 409. Opsi yang
  tidak ditawarkan untuk cabang tersebut tidak bisa dipilih.
- Harga ongkir di-quote ulang saat checkout, bukan dipercaya dari body.
- `totalAmount = itemsTotal + shippingAmount - discount`.
- `latitude` dan `longitude` di `shippingAddress` opsional karena `user_addresses` belum punya
  kolom koordinat. Tanpa koordinat, checkout hanya bisa memakai 3PL.

### Pengelolaan stok per cabang

Cabang memakai akun sendiri. Pusat memakai role `admin`, cabang memakai role `branch_admin`
dengan `users.branch_id` terisi. Untuk pengujian tanpa Postgres, mock token yang tersedia:
`mock-admin-token`, `mock-branch-admin-token-{branchId}`, dan `mock-customer-token-{userId}`.

Route cabang, butuh token dan scope cabang:

- `GET /api/v1/branch/inventory`: stok semua varian di cabang itu.
- `GET /api/v1/branch/inventory/logs?limit=100`: riwayat perubahan stok.
- `PATCH /api/v1/branch/inventory/{variantId}` body `{ "quantityChange": -2, "reason": "rusak" }`.
  `quantityChange` boleh negatif, `reason` wajib.
- `GET /api/v1/branch/dashboard`: penjualan, refund, reservasi aktif, dan stok rendah cabang itu.

Admin pusat tanpa header `X-Branch-Id` mendapat `BRANCH_REQUIRED` 400. Branch admin yang mencoba
membaca cabang lain mendapat `BRANCH_SCOPE_MISMATCH` 403.

### Master cabang dan transfer stok (admin pusat)

- `GET /api/v1/admin/branches`, `POST /api/v1/admin/branches`
- `GET /api/v1/admin/branches/{id}`, `PATCH /api/v1/admin/branches/{id}`, `DELETE /api/v1/admin/branches/{id}`
- `POST /api/v1/admin/branches/{id}/location`: body `latitude`, `longitude`, dipakai tombol
  "gunakan lokasi saat ini". Tanpa koordinat, cabang tidak boleh mengaktifkan ondemand
  (`ONDEMAND_REQUIRES_COORDINATES` 400).
- `GET /api/v1/admin/stock-transfers?status=&branchId=&limit=100`
- `POST /api/v1/admin/stock-transfers` body `{ "fromBranchId", "toBranchId", "variantId", "quantity", "note" }`
- `POST /api/v1/admin/stock-transfers/{id}/approve|ship|receive|cancel`

Status transfer hanya empat: `draft`, `in_transit`, `received`, `cancelled`. Approve tidak
mengubah status, hanya menstempel `approvedBy`. Stok asal berkurang saat `ship`, stok tujuan
bertambah saat `receive`, dan hanya stok tersedia (`stock - reserved`) yang boleh keluar.

### Kode error yang perlu ditangani storefront

| Kode | HTTP | Arti |
| --- | --- | --- |
| `BRANCH_REQUIRED` | 400 | Checkout atau dashboard tidak menyebut cabang |
| `MULTI_BRANCH_CHECKOUT_UNSUPPORTED` | 400 | Satu checkout berisi lebih dari satu cabang |
| `SHIPPING_MODE_NOT_AVAILABLE` | 409 | Mode yang dipilih tidak ada di opsi cabang itu |
| `SHIPPING_SERVICE_REQUIRED` | 400 | Mode aggregator dipilih tanpa `selectedService` |
| `SHIPPING_SERVICE_NOT_AVAILABLE` | 409 | Service tidak ada di daftar opsi |
| `ADDRESS_NOT_FOUND` | 404 | `addressId` bukan milik customer tersebut |
| `INVALID_FULFILLMENT_MODE` | 400 | Mode di luar `ondemand` dan `aggregator` |
| `BRANCH_SCOPE_MISMATCH` | 403 | Branch admin membaca cabang lain |
| `INVALID_TRANSITION` | 409 | Aksi transfer tidak cocok dengan status saat ini |
| `APPROVAL_REQUIRED` | 409 | `ship` dipanggil sebelum approve |
| `INSUFFICIENT_STOCK` | 409 | Stok tersedia cabang asal tidak cukup |

### Keputusan yang masih terbuka

- Satu cabang per pengiriman (OD-A). Order lintas cabang harus dipecah menjadi beberapa order.
- 3PL di dalam radius masih ditampilkan sebagai pembanding harga (OD-B), diatur lewat setting
  `shipping.showAggregatorWithinRadius`.
- Tanpa koordinat tujuan, hanya 3PL yang ditawarkan (OD-C).
- Seed tidak membuat akun `branch_admin` dengan password default, supaya tidak ada kredensial
  contoh yang ikut terbawa ke produksi. Selama ini belum ada endpoint pembuatan user: satu-satunya
  route role adalah `POST /api/v1/admin/users/{id}/role`, dan route itu hanya menerima `admin`
  atau `customer`, belum `branch_admin` dan belum bisa mengisi `users.branch_id`. Jadi akun cabang
  masih harus dibuat langsung di database (row `users` dengan `role = 'branch_admin'` dan
  `branch_id` terisi) sampai endpoint provisioning cabang dibuat.


---

## Flash Sale (FLS-001, FLS-002, FLS-004, FLS-005, FLS-006)

Modul flash sale berada di balik feature flag `flash_sale` (default `true`). Semua route
mengembalikan `403 FEATURE_DISABLED` kalau flag dimatikan.

### Endpoint publik

- `GET /api/v1/flash-sales`: daftar sale yang sedang berjalan dan yang akan datang. Sale yang
  sudah selesai, dinonaktifkan, atau punya window rusak tidak ikut tampil.
- `GET /api/v1/flash-sales/{id}`: detail satu sale, termasuk harga akhir per item, sisa stok, dan
  data countdown.
- `POST /api/v1/flash-sales/{id}/items/{itemId}/purchase` (butuh login): body
  `{ "quantity": 1, "orderId": "uuid-opsional" }`. Endpoint ini memotong alokasi stok flash sale
  dan menulis ledger pembelian per user.

### Endpoint admin

- `GET /api/v1/admin/flash-sales`
- `POST /api/v1/admin/flash-sales` body
  `{ "title", "startAt", "endAt", "isActive", "items": [{ "productId", "variantId", "discountType", "discountValue", "stock", "perUserLimit" }] }`
- `GET /api/v1/admin/flash-sales/{id}`
- `PATCH /api/v1/admin/flash-sales/{id}` body `{ "title", "startAt", "endAt", "isActive" }`
- `DELETE /api/v1/admin/flash-sales/{id}`
- `POST /api/v1/admin/flash-sales/{id}/items`
- `PATCH /api/v1/admin/flash-sales/{id}/items/{itemId}` body
  `{ "discountType", "discountValue", "stock", "perUserLimit" }`
- `DELETE /api/v1/admin/flash-sales/{id}/items/{itemId}`

### Kontrak status dan countdown

Status diturunkan dari jam server, bukan disimpan sebagai kolom:

| Status | Arti |
| --- | --- |
| `upcoming` | `now < startAt` dan sale aktif |
| `active` | `startAt <= now <= endAt` dan sale aktif |
| `ended` | `now > endAt` |
| `inactive` | `isActive = false`, menang atas window apa pun |

Batas window inklusif di kedua ujung. Sale yang berakhir tepat di `endAt` masih bisa dibeli pada
milidetik itu, dan baru menjadi `ended` satu milidetik setelahnya.

Respons detail menyertakan `serverTime`, `startsInMs`, `endsInMs`, dan `remainingMs`. Timer di
storefront sebaiknya memakai `serverTime` untuk mengoreksi selisih jam perangkat, bukan jam lokal
user.

### Aturan harga dan stok

- Harga dasar per item: `product_variants.price` kalau `variantId` terisi, kalau tidak
  `products.base_price`.
- `percentage` dihitung dari harga dasar, `fixed` dipotong langsung, keduanya dibulatkan ke dua
  desimal dan tidak pernah menghasilkan harga negatif.
- Sisa stok = `stock - sold`, minimum 0.
- Pembelian ditolak kalau quantity melebihi sisa stok, atau kalau `purchasedByUser + quantity`
  melebihi `perUserLimit`. `perUserLimit` null berarti tanpa batas.
- Ledger `flash_sale_purchases` menyimpan satu baris per pembelian yang diterima. Inilah sumber
  angka "sudah beli berapa" untuk FLS-006, bukan `order_items`, karena order biasa tidak selalu
  lewat flash sale.
- Update stok memakai syarat `sold + quantity <= stock` di klausa WHERE, jadi dua pembeli
  bersamaan tidak bisa oversell. Update stok dan insert ledger berada dalam satu transaksi.

### Kode error

| Kode | HTTP | Arti |
| --- | --- | --- |
| `INVALID_WINDOW` | 400 | `endAt` tidak setelah `startAt`, atau tanggal tidak valid |
| `INVALID_TITLE` | 400 | Judul di luar 3 sampai 150 karakter |
| `INVALID_DISCOUNT` | 400 | Tipe diskon tidak dikenal, nilai <= 0, atau persentase > 100 |
| `INVALID_STOCK` | 400 | Stok bukan bilangan bulat >= 0, atau lebih kecil dari jumlah terjual |
| `INVALID_QUANTITY` | 400 | Quantity bukan bilangan bulat positif |
| `INVALID_LIMIT` | 400 | `perUserLimit` bukan bilangan bulat positif dan bukan null |
| `SALE_NOT_FOUND` | 404 | Sale tidak ada |
| `ITEM_NOT_FOUND` | 404 | Item tidak ada atau bukan milik sale tersebut |
| `ITEM_ALREADY_EXISTS` | 409 | Produk dan varian yang sama sudah ada di sale itu |
| `SALE_INACTIVE` | 403 | Sale sedang dinonaktifkan |
| `SALE_NOT_STARTED` | 403 | Sale belum dimulai |
| `SALE_ENDED` | 403 | Sale sudah berakhir |
| `OUT_OF_STOCK` | 409 | Sisa alokasi tidak cukup |
| `PER_USER_LIMIT_REACHED` | 409 | Batas pembelian per user tercapai |

### Keputusan yang masih terbuka

- Checkout belum memanggil endpoint `purchase`. Endpoint ini adalah primitif alokasi stok plus
  ledger; penautan ke pembuatan order dan pembayaran masih menunggu integrasi checkout. Selama
  belum ditautkan, `orderId` boleh null dan pemanggil bertanggung jawab menyimpan referensinya.
- Antrean high demand (FLS-003) belum dibangun, karena di PRD prioritasnya P2 dan tidak masuk
  daftar Phase 3 di checklist.
- Sale yang dinonaktifkan di tengah jalan tidak mengembalikan stok yang sudah terjual. Stok
  dikembalikan hanya lewat pembatalan order, dan alur itu belum ada di modul ini.

---

## Loyalty Points dan Tier (LTY-001, LTY-002, LTY-003, LTY-004)

Modul loyalty berada di balik feature flag `loyalty` (default `true`). Semua route mengembalikan
`403 FEATURE_DISABLED` kalau flag dimatikan.

Poin disimpan sebagai bilangan bulat di `loyalty_accounts.balance` (saldo yang bisa dipakai) dan
`loyalty_accounts.lifetime_points` (akumulasi seumur hidup, tidak pernah turun). Tier diturunkan
dari `lifetime_points`, kolom `tier` hanya cache untuk listing.

### Endpoint customer

- `GET /api/v1/loyalty/program`: konfigurasi program aktif (tier, aturan earn, aturan redeem).
  Tidak butuh login, supaya storefront bisa menampilkan tabel benefit.
- `GET /api/v1/loyalty` (butuh login): saldo, lifetime points, tier, benefit tier, dan progres ke
  tier berikutnya. Akun dibuat otomatis pada pembacaan pertama.
- `GET /api/v1/loyalty/transactions?limit=50` (butuh login): riwayat poin terbaru, maksimum 200
  baris per permintaan.
- `POST /api/v1/loyalty/redeem` (butuh login): body `{ "points": 50, "orderId": "uuid-opsional",
  "note": "opsional" }`. Mengembalikan `points`, `discountAmount`, `balanceAfter`, dan ringkasan
  akun.

### Endpoint admin

- `GET /api/v1/admin/loyalty/accounts?tier=gold&limit=50`: daftar akun, urut lifetime points
  menurun, maksimum 200 baris.
- `GET /api/v1/admin/loyalty/accounts/{userId}`: ringkasan akun plus 20 transaksi terakhir. 404
  kalau akun belum ada, tidak membuat akun baru.
- `POST /api/v1/admin/loyalty/accounts/{userId}/earn`: body
  `{ "source": "purchase" | "review" | "referral", "referenceId": "opsional", "orderTotal":
  "opsional", "note": "opsional" }`.
- `POST /api/v1/admin/loyalty/accounts/{userId}/adjust`: body `{ "points": -100, "note": "wajib,
  minimal 3 karakter" }`. Dipakai untuk mengoreksi kesalahan atau mengembalikan poin dari
  penukaran yang gagal.
- `GET /api/v1/admin/loyalty/program` dan `PUT /api/v1/admin/loyalty/program`: baca dan tulis
  konfigurasi, tersimpan di settings key `loyalty.program`.

### Default program

| Tier | Mulai lifetime points | Diskon | Gratis ongkir mulai |
| --- | --- | --- | --- |
| `bronze` | 0 | 0% | tidak pernah |
| `silver` | 500 | 2% | Rp200.000 |
| `gold` | 2000 | 5% | Rp150.000 |
| `platinum` | 5000 | 8% | selalu |

Aturan earn dan redeem default:

- Belanja: 1 poin per Rp1.000 dari nilai order sebelum ongkir, dibulatkan ke bawah.
- Review: 10 poin.
- Referral: 50 poin.
- Tukar: 1 poin = Rp100, minimum 50 poin sekali tukar.

Konfigurasi bisa diubah lewat `PUT /api/v1/admin/loyalty/program`. Kalau isi settings rusak
(misal diedit manual di database), pembacaan jatuh ke default dan tidak melempar error ke user.
Ambang tier harus naik ketat dan tier `bronze` harus mulai dari 0. Urutan tier yang tidak rapi
akan diurutkan ulang saat dibaca, bukan ditolak.

### Aturan poin

- Satu event earn per dokumen sumber, dijaga unique index pada
  (`user_id`, `source`, `reference_id`). Mengulang webhook order yang sama menghasilkan
  `409 DUPLICATE_EARN`, bukan saldo dobel.
- `referenceId` boleh null untuk penyesuaian manual, karena Postgres menganggap NULL unik.
- Penukaran poin langsung mengurangi saldo dan tidak bisa dibatalkan dari sisi customer. Kalau
  order yang memakai diskon itu gagal, jalur pemulihannya adalah `POST .../adjust` oleh admin.
- Lifetime points hanya bertambah. Penyesuaian negatif mengurangi saldo yang bisa dipakai, bukan
  tier, jadi tidak ada demotion di implementasi ini.
- Diskon tier dan gratis ongkir disediakan sebagai helper murni (`applyTierDiscount`,
  `qualifiesForFreeShipping`) dan belum dipasang ke checkout.

### Kode error

| Kode | HTTP | Arti |
| --- | --- | --- |
| `INVALID_TIER` | 400 | Nama tier tidak dikenal, duplikat, atau jumlah tier bukan empat |
| `INVALID_TIER_THRESHOLD` | 400 | Ambang bukan bilangan bulat >= 0, bronze bukan 0, atau ada ambang kembar |
| `INVALID_DISCOUNT` | 400 | Diskon tier di luar 0 sampai 100 |
| `INVALID_EARN_RULE` | 400 | `rupiahPerPoint` bukan > 0, atau poin review/referral negatif |
| `INVALID_REDEEM_RULE` | 400 | `currencyPerPoint` bukan > 0, atau `minPoints` negatif |
| `INVALID_POINTS` | 400 | Poin bukan bilangan bulat positif, atau delta penyesuaian nol |
| `INVALID_AMOUNT` | 400 | Nilai order negatif atau bukan angka |
| `INVALID_SOURCE` | 400 | Sumber poin bukan purchase, review, atau referral |
| `MIN_REDEEM_NOT_MET` | 400 | Penukaran di bawah minimum program |
| `INSUFFICIENT_POINTS` | 409 | Saldo tidak cukup, termasuk penyesuaian yang membuat saldo negatif |
| `ACCOUNT_NOT_FOUND` | 404 | Akun loyalty tidak ada pada lookup admin |
| `DUPLICATE_EARN` | 409 | Poin untuk referensi yang sama sudah pernah dicatat |

### Keputusan yang masih terbuka

- Earn belum otomatis. Checkout, review, dan referral belum memanggil fungsi `earnPoints`, jadi
  poin baru masuk lewat endpoint admin atau pemanggilan service langsung. Penautan ke event order
  dan review menyusul saat modul referral dan wallet mendarat.
- Diskon tier dan gratis ongkir belum dipotong di checkout. Helper-nya sudah ada dan sudah diuji,
  tinggal dipanggil dari alur pembuatan order.
- Poin belum kedaluwarsa (LTY-005) dan belum ada reward ulang tahun (LTY-006), karena keduanya P2
  dan tidak masuk daftar Phase 3.

---

## Referral Program (RFR-001, RFR-002, RFR-003, RFR-004, RFR-005)

Modul referral berada di balik feature flag `referral` (default `true`). Semua route mengembalikan
`403 FEATURE_DISABLED` kalau flag dimatikan.

Kode referral dibuat otomatis pada pembacaan pertama, diturunkan dari user id ditambah nomor
percobaan, lalu diambil delapan karakter dari alfabet `ABCDEFGHJKMNPQRSTUVWXYZ23456789` (tanpa I,
L, O, 0, dan 1 supaya tidak salah baca). Kode unik dijaga index di database, jadi tabrakan
diselesaikan dengan percobaan berikutnya, bukan dengan tebakan acak.

### Endpoint publik

- `GET /api/v1/referrals/program`: konfigurasi program aktif, tidak butuh login, dipakai storefront
  untuk menampilkan banner ajak teman.

### Endpoint customer

- `GET /api/v1/referrals/me` (butuh login): kode sendiri, link siap bagikan, konfigurasi program,
  ringkasan hitungan (total, pending, qualified, rewarded, cancelled, poin didapat), dan daftar
  referral terbaru. Kode dibuat otomatis kalau belum ada.
- `GET /api/v1/referrals` (butuh login): daftar referral saja, tanpa pembungkus.
- `GET /api/v1/referrals/inbound` (butuh login): baris referral di mana pemanggil adalah pihak yang
  diundang. `null` kalau belum pernah memakai kode.
- `POST /api/v1/referrals/claim` (butuh login): body `{ "code": "ABCD2345" }` atau link penuh
  `{ "code": "https://toko.test/r/ABCD2345" }`. Kode dinormalkan (huruf besar, spasi dan tanda
  hubung dibuang), lalu didaftarkan sebagai referral `pending`.

### Endpoint admin

- `GET /api/v1/admin/referrals?status=pending&limit=50`: daftar referral, terbaru dulu, maksimum
  200 baris, termasuk email kedua pihak.
- `GET /api/v1/admin/referrals/{id}`: detail satu referral.
- `POST /api/v1/admin/referrals/{id}/qualify`: body `{ "orderId": "uuid", "note": "opsional" }`.
  Order wajib milik referee dan sudah lunas. Endpoint ini memindahkan status ke `qualified`, lalu
  memberi poin ke kedua pihak, lalu menandai `rewarded`.
- `POST /api/v1/admin/referrals/{id}/cancel`: body `{ "note": "opsional" }`. Hanya berlaku untuk
  status `pending` atau `qualified`. Referral `rewarded` bersifat final dan poinnya tidak ditarik
  kembali lewat endpoint ini.
- `GET /api/v1/admin/referrals/program` dan `PUT /api/v1/admin/referrals/program`: baca dan tulis
  konfigurasi, tersimpan di settings key `referral.program`. Body
  `{ "referrerPoints": 50, "refereePoints": 25, "maxReferralsPerUser": null }`.
- Base URL link diatur lewat `PUT /api/v1/admin/settings/referral.baseUrl` dengan body
  `{ "url": "https://toko.test" }`. Kalau belum diatur, dipakai `STOREFRONT_BASE_URL` atau
  `https://tembus.test`.

### Aturan dan alur hadiah

- Hadiah dicatat lewat ledger loyalty, bukan tabel poin terpisah. Satu referral menulis dua baris
  `loyalty_transactions` dengan `source = referral` dan `reference_id` `<referralId>:referrer`
  serta `<referralId>:referee`. Unique index earn yang sudah ada membuat hadiah tidak bisa dobel
  walau endpoint verifikasi dipanggil berulang.
- Jumlah poin disalin ke baris referral saat klaim. Mengubah program setelahnya tidak mengubah
  janji hadiah untuk referral yang sudah masuk.
- Referee harus akun baru: bukan diri sendiri, belum pernah memakai kode apa pun, dan belum punya
  order lunas. Pemeriksaan order memakai daftar status pendapatan yang sama dengan modul finance.
- Status referral: `pending`, `qualified`, `rewarded`, `cancelled`. `rewarded` dan `cancelled`
  bersifat final.
- Kalau penulisan ledger gagal di tengah, baris referral tetap `qualified` dan panggilan
  verifikasi berikutnya melanjutkan dari langkah hadiah, bukan mengulang dari awal.
- `maxReferralsPerUser` dihitung dari referral berstatus selain `cancelled`. `null` berarti tanpa
  batas.

### Kode error

| Kode | HTTP | Arti |
| --- | --- | --- |
| `INVALID_CODE` | 400 | Kode atau seed bukan string, atau memuat karakter ambigu |
| `INVALID_CODE_LENGTH` | 400 | Panjang kode di luar 4 sampai 16 karakter |
| `INVALID_BASE_URL` | 400 | Base URL kosong, rusak, atau bukan http atau https |
| `INVALID_REWARD` | 400 | Poin referrer atau referee negatif, pecahan, atau tidak ada |
| `INVALID_LIMIT` | 400 | Batas referral negatif atau pecahan |
| `CODE_TAKEN` | 500 | Pembuatan kode gagal setelah delapan percobaan |
| `CODE_NOT_FOUND` | 404 | Kode yang diklaim tidak ada |
| `SELF_REFERRAL` | 409 | Memakai kode sendiri |
| `ALREADY_REFERRED` | 409 | Akun sudah pernah memakai kode referral |
| `REFEREE_NOT_NEW` | 409 | Referee sudah punya order lunas, atau order verifikasi tidak valid |
| `REFERRAL_NOT_FOUND` | 404 | Referral atau order verifikasi tidak ditemukan |
| `INVALID_TRANSITION` | 409 | Perpindahan status tidak sah, termasuk verifikasi ganda |
| `REFERRAL_LIMIT_REACHED` | 409 | Batas referral per akun sudah tercapai |

### Keputusan yang masih terbuka

- Hadiah referee baru masuk setelah admin memverifikasi order pertama. Belum ada pemicu otomatis
  dari webhook pembayaran, karena modul ini tidak mau menebak kapan order dianggap sah.
- Leaderboard referral (RFR-006) belum dibuat karena P2 dan di luar daftar Phase 3.
- Kode yang sudah dibuat tidak bisa diganti sendiri oleh customer. Belum ada endpoint regenerasi,
  karena setiap regenerasi akan mematikan link lama yang sudah tersebar.

## Store Credit Wallet (WLT-001, WLT-002, WLT-003)

Modul wallet berada di balik feature flag `wallet` (default `true`). Semua route mengembalikan
`403 FEATURE_DISABLED` kalau flag dimatikan.

Saldo disimpan di kolom `decimal(12,2)`, tetapi seluruh aritmetika di modul berjalan dalam integer
sen. Nominal dengan lebih dari dua desimal ditolak, bukan dibulatkan diam-diam, karena saldo wallet
yang kehilangan pecahan rupiah lebih buruk daripada error yang jelas.

Setiap perubahan saldo menulis satu baris `wallet_transactions` berisi `balance_before` dan
`balance_after` dari nilai yang benar-benar di-commit Postgres, jadi ledger selalu bisa direkonsiliasi
terhadap saldo.

### Endpoint customer

- `GET /api/v1/wallet` (butuh login): saldo, mata uang, konfigurasi program aktif, dan 20 transaksi
  terbaru. Wallet dibuat otomatis pada pembacaan pertama.
- `GET /api/v1/wallet/program` (tanpa login): konfigurasi program aktif, dipakai storefront untuk
  menampilkan banner cashback.
- `GET /api/v1/wallet/transactions?type=payment&limit=50` (butuh login): riwayat transaksi, terbaru
  dulu, maksimum 200 baris. `type` opsional, nilainya salah satu dari `topup`, `payment`, `refund`,
  `cashback`, `adjustment`, `expiry`.
- `POST /api/v1/wallet/preview` (butuh login): body `{ "orderTotal": 150000 }`. Hanya membaca, tidak
  menulis. Mengembalikan `balance`, `amount`, `payable`, `shortfall`, dan `program`, supaya tombol
  bayar bisa dinonaktifkan sebelum customer menekan apa pun.
- `POST /api/v1/wallet/pay` (butuh login): body `{ "orderId": "uuid" }`. Melunasi total order penuh
  dari saldo, menandai order `paid` dengan `paymentDetails.gateway = "wallet"`, lalu memberi cashback
  kalau program aktif.

Order hanya bisa dibayar dari wallet kalau statusnya `pending`, `waiting_payment`, atau `unpaid`, dan
order itu memang milik pemanggil. Pembayaran sebagian tidak didukung: saldo harus menutup total order,
kalau tidak endpoint membalas `409 INSUFFICIENT_BALANCE` beserta kekurangannya di preview. Uang keluar
dari wallet lebih dulu, dan kalau update order gagal, debit dibalik dengan baris `refund` supaya
customer tidak pernah tertagih untuk order yang tidak berubah status.

### Endpoint admin

- `GET /api/v1/admin/wallets?limit=50`: daftar wallet beserta email pemilik, terbaru dulu, maksimum
  200 baris, untuk pencarian oleh tim support.
- `GET /api/v1/admin/wallets/{userId}`: saldo dan riwayat satu akun. Tidak membuat wallet baru, jadi
  salah ketik id tidak menghasilkan baris kosong.
- `POST /api/v1/admin/wallets/{userId}/credit`: body `{ "amount": 50000, "note": "opsional" }`,
  topup manual atau kompensasi. Mencatat transaksi bertipe `topup`.
- `POST /api/v1/admin/wallets/{userId}/adjust`: body
  `{ "amount": 25000, "direction": "debit", "note": "opsional" }`. `direction` wajib eksplisit karena
  `adjustment` satu-satunya tipe yang boleh dipilih arahnya sendiri.
- `GET /api/v1/admin/wallets/program` dan `PUT /api/v1/admin/wallets/program`: baca dan tulis
  konfigurasi, tersimpan di settings key `wallet.program`. Body
  `{ "cashbackPercent": 5, "cashbackMaxAmount": 25000, "minimumPayment": 10000, "currency": "IDR" }`.
- `POST /api/v1/admin/orders/{orderId}/cashback`: memberi cashback untuk order yang sudah lunas lewat
  gateway lain. Aman dipanggil berulang karena referensi yang sama dibalas `409` alih-alih dibayar
  dua kali.

### Cashback

Cashback dihitung dari total order: persen dari total, dibulatkan ke bawah ke rupiah utuh, lalu
dipotong batas maksimum kalau diatur. Persen default 0 karena tarif adalah keputusan bisnis, bukan
angka yang boleh dikarang modul. Admin mengaktifkannya lewat `PUT /api/v1/admin/wallets/program`.

Cashback otomatis hanya berjalan pada pembayaran wallet. Order yang lunas lewat gateway pembayaran
memakai endpoint admin cashback, dan kegagalan penulisan cashback tidak membatalkan pembayaran karena
order memang sudah lunas.

### Tabel error

| Kode | HTTP | Arti |
| --- | --- | --- |
| `INVALID_AMOUNT` | 400 | Nominal kosong, bukan angka, lebih dari dua desimal, atau nol ke bawah |
| `INVALID_TYPE` | 400 | Jenis transaksi tidak dikenal |
| `INVALID_DIRECTION` | 400 | Arah bukan `credit` atau `debit` |
| `INVALID_PROGRAM` | 400 | Konfigurasi program bukan objek atau mata uang kosong |
| `INVALID_CASHBACK_PERCENT` | 400 | Persentase cashback di luar 0 sampai 100 |
| `INVALID_CASHBACK_CAP` | 400 | Batas cashback negatif atau bukan angka |
| `INVALID_MINIMUM` | 400 | Minimum pembayaran negatif atau bukan angka |
| `INSUFFICIENT_BALANCE` | 409 | Saldo tidak cukup, baik saat debit maupun saat melunasi order |
| `MINIMUM_NOT_MET` | 400 | Total order di bawah minimum pembayaran wallet |
| `WALLET_NOT_FOUND` | 404 | Wallet tidak ada untuk akun ini |
| `ORDER_NOT_FOUND` | 404 | Order tidak ada atau bukan milik pemanggil |
| `ORDER_NOT_PAYABLE` | 409 | Status order tidak bisa dibayar dari wallet, atau belum lunas saat cashback diminta |
| `DUPLICATE_TRANSACTION` | 409 | Referensi yang sama sudah pernah dicatat untuk tipe transaksi itu |

### Keputusan yang masih terbuka

- Checkout belum memakai wallet. Customer membayar lewat `POST /api/v1/wallet/pay` setelah order
  dibuat, bukan memilih wallet sebagai metode saat checkout.
- Belum ada endpoint topup mandiri karena butuh integrasi gateway pembayaran. Untuk sekarang saldo
  masuk lewat kredit admin.
- Saldo belum punya kedaluwarsa. Tipe `expiry` sudah ada di ledger tetapi belum ada penjadwal yang
  memakainya.
- Belum ada transfer saldo antar akun, dan tidak direncanakan tanpa keputusan bisnis eksplisit.

## Granular Admin Permission Scopes (AUT-013)

Modul ini mempersempit admin pusat satu terhadap admin pusat lain. Grup route `/api/v1/admin`
tetap dijaga `adminOnlyMiddleware`, jadi `branch_admin` belum bisa masuk ke grup itu. Yang berubah
adalah: setiap akun admin punya daftar scope sendiri, dan daftar itu dibaca ulang di setiap request,
bukan diambil dari klaim JWT.

Role tetap menjadi batas atas, override hanya menyempitkan atau memperluas di dalam batas itu:

- `admin`: seluruh 23 scope.
- `branch_admin`: subset operasional (dashboard, katalog baca, stok, pesanan, ulasan, live chat).
- `customer`: kosong.

Override disimpan di tabel `admin_permission_grants`, satu baris per permission per user dengan
unique index `(user_id, permission)` dan kolom `effect` bernilai `grant` atau `revoke`. Perubahan
langsung berlaku pada request berikutnya karena guard membaca tabel, bukan token.

`permissions.manage` hanya berasal dari role default `admin` dan tidak pernah bisa diberikan lewat
override `grant`. Alasannya sederhana: akun dengan scope terbatas tidak boleh mencetak akun lain
yang bisa mengatur scope, karena itu sama dengan menaikkan diri sendiri.

### Endpoint

- `GET /api/v1/admin/permissions`: katalog 23 scope beserta deskripsi, default per role, dan scope
  efektif pemanggil (`me.role`, `me.overrides`, `me.effective`). Dipakai halaman pengaturan admin
  untuk merender checkbox tanpa menebak daftar scope.
- `GET /api/v1/admin/users/{id}/permissions`: state satu akun (`userId`, `email`, `role`,
  `overrides`, `effective`). Pemanggil boleh membaca dirinya sendiri tanpa `permissions.manage`,
  membaca akun lain butuh `permissions.manage`.
- `PUT /api/v1/admin/users/{id}/permissions`: body `{ "overrides": [{ "permission": "finance.view",
  "effect": "grant" }] }`. Daftar yang dikirim adalah daftar final, bukan tambahan, jadi baris yang
  tidak disebut akan hilang. Respons memuat state baru plus `diff { added, removed, unchanged }`.

Aturan yang ditegakkan pada `PUT`:

1. Hanya pemegang `permissions.manage` yang boleh memanggil.
2. Akun tidak boleh mengubah scope miliknya sendiri (`409 SELF_PERMISSION_CHANGE`).
3. Actor hanya boleh memberikan scope yang ia pegang sendiri (`403 SCOPE_NOT_HELD`).
4. Target role `customer` ditolak karena tidak punya scope admin (`409 SCOPE_NOT_HELD`).
5. Admin terakhir tidak boleh kehilangan `permissions.manage` (`409 SCOPE_NOT_HELD`).
6. Setiap perubahan menulis satu baris audit `user.permissions_update` berisi scope yang ditambah
   dan dicabut.

### Route admin yang memakai guard scope

| Route | Scope |
| --- | --- |
| `GET /dashboard/charts`, `GET /alerts` | `dashboard.view` |
| `GET /reports/export` | `reports.export` |
| `GET /customers`, `GET /customers/{id}` | `users.view` |
| `POST /customers/{id}/status`, `POST /users/{id}/role` | `users.manage` |
| `GET /logs` | `audit.view` |
| `PUT /users/{id}/permissions` | `permissions.manage` |

Kalau pembacaan override gagal karena database bermasalah, guard membalas
`503 PERMISSION_CHECK_UNAVAILABLE`. Ini fail closed: gangguan database tidak boleh diam-diam
mengembalikan scope yang sudah dicabut.

### Tabel error

| Kode | HTTP | Arti |
| --- | --- | --- |
| `UNKNOWN_PERMISSION` | 400 | Nama scope tidak ada di katalog |
| `INVALID_EFFECT` | 400 | `effect` bukan `grant` atau `revoke` |
| `PERMISSION_DENIED` | 403 | Pemanggil tidak memegang scope yang dibutuhkan |
| `SCOPE_NOT_HELD` | 403 / 409 | Actor memberi scope yang tidak ia pegang, target customer, atau admin terakhir kehilangan pengelola scope |
| `SELF_PERMISSION_CHANGE` | 409 | Akun mencoba mengubah scope dirinya sendiri |
| `PERMISSION_CHECK_UNAVAILABLE` | 503 | Tabel override tidak bisa dibaca |

### Keputusan yang masih terbuka

- Halaman pengaturan admin di frontend belum dibuat. Backend hanya menyediakan katalog dan state.
- `branch_admin` belum bisa masuk grup `/api/v1/admin`, jadi scope `branch_admin` baru terpakai
  kalau grup route itu dibuka untuk role tersebut. Saat ini guard hanya membedakan admin satu
  terhadap admin lain.
- Route di luar grup admin (katalog, pesanan, promo, keuangan) belum dipasangi `requirePermission`.
  Scope-nya sudah ada di katalog, tetapi penegakan menyusul per modul supaya tidak ada route yang
  tiba-tiba menolak admin lama tanpa perubahan terpisah.
- Tabel `admin_permission_grants` baru punya file SQL `drizzle/0016_admin_permissions.sql` dan belum
  masuk `drizzle/meta/_journal.json`. Jalur de facto tetap `npm run db:push`.

## Pricing Engine: Dynamic, Tiered, Customer Group (PRC-002, PRC-003, PRC-004)

Tiga jenis aturan harga yang dihitung di server. Klien tidak pernah mengirim harga final; ia hanya
mengirim produk, varian, dan kuantitas, lalu server yang menentukan harga per baris.

- `dynamic`: persentase potongan yang berlaku di antara `startAt` dan `endAt`.
- `tiered`: potongan bertingkat berdasarkan kuantitas. Tier dengan `minQuantity` tertinggi yang
  tercapai menang, bukan penjumlahan antar tier.
- `customer_group`: persentase potongan untuk anggota grup tertentu (`customerGroups.slug`).

Satu baris hanya memakai satu aturan. Kalau beberapa aturan cocok, engine memilih yang terbaik
dengan urutan: persentase terbesar, lalu `priority` terbesar, lalu nama, lalu id. Diskon tidak
ditumpuk, sehingga hasil quote sama setiap kali diulang dengan data yang sama.

Harga dasar per baris diambil dari `product_variants.price` bila `variantId` dikirim dan varian itu
milik produk tersebut. Kalau tidak, dipakai `products.basePrice`. Pada pembuatan order, varian yang
bukan milik produk ditolak dengan `PRODUCT_VARIANT_NOT_FOUND` supaya harga tidak bisa diakali dengan
menukar `variantId`.

Pricing tidak boleh memblokir penjualan. Saat order dibuat, kegagalan membaca aturan atau grup hanya
dicatat sebagai warning dan order lanjut dengan harga katalog. Yang tetap tegas adalah produk tidak
ditemukan (quote gagal `404`) dan kuantitas tidak valid (`400`).

### Endpoint publik

`POST /api/v1/pricing/quote`

Body:

```json
{
  "lines": [
    { "productId": "uuid-produk", "variantId": "uuid-varian", "quantity": 3 }
  ]
}
```

`variantId` opsional. `Authorization: Bearer <token>` opsional; kalau ada dan valid, grup pelanggan
diambil dari token. Grup tidak pernah dibaca dari body, jadi pembeli tidak bisa mengaku sebagai
anggota grup grosir. Token tidak valid diperlakukan sebagai anonim, bukan `401`, supaya halaman
katalog publik tetap bisa menampilkan harga.

Respons:

```json
{
  "success": true,
  "data": {
    "lines": [
      {
        "productId": "uuid-produk",
        "variantId": "uuid-varian",
        "quantity": 3,
        "basePrice": 100000,
        "unitPrice": 90000,
        "lineTotal": 270000,
        "discountPerUnit": 10000,
        "discountTotal": 30000,
        "appliedRule": { "id": "uuid-aturan", "name": "Grosir 3+", "type": "tiered", "percentOff": 10 },
        "rejectedRules": [{ "id": "uuid-lain", "name": "Flash sale", "reason": "EXPIRED" }]
      }
    ],
    "baseSubtotal": 300000,
    "itemsTotal": 270000,
    "discountTotal": 30000,
    "customerGroups": ["grosir"]
  }
}
```

`rejectedRules` berguna untuk menelusuri kenapa sebuah promo tidak terpakai. Alasan yang mungkin:
`INACTIVE`, `NOT_STARTED`, `EXPIRED`, `OUT_OF_SCOPE`, `INVALID_RULE`.

### Endpoint admin

Seluruh route di bawah berada di grup `/api/v1/admin` sehingga butuh role `admin`.

| Method | Path | Scope | Keterangan |
| --- | --- | --- | --- |
| `GET` | `/pricing/rules` | `promos.view` | Semua aturan, termasuk yang nonaktif |
| `POST` | `/pricing/rules` | `promos.manage` | Buat aturan baru |
| `PATCH` | `/pricing/rules/{id}` | `promos.manage` | Ubah sebagian field |
| `DELETE` | `/pricing/rules/{id}` | `promos.manage` | Hapus aturan |
| `GET` | `/pricing/groups` | `promos.view` | Daftar grup pelanggan |
| `POST` | `/pricing/groups` | `promos.manage` | Buat grup (`slug`, `name`, `description`) |
| `PATCH` | `/pricing/groups/{id}` | `promos.manage` | Ubah grup |
| `DELETE` | `/pricing/groups/{id}` | `promos.manage` | Hapus grup |
| `GET` | `/pricing/groups/{id}/members` | `promos.view` | Anggota grup |
| `POST` | `/pricing/groups/{id}/members` | `promos.manage` | Tambah anggota, body `{ "userId": "..." }` |
| `DELETE` | `/pricing/groups/{id}/members/{userId}` | `promos.manage` | Keluarkan anggota |

Body aturan:

```json
{
  "name": "Grosir 3+",
  "type": "tiered",
  "tiers": [
    { "minQuantity": 3, "percentOff": 10 },
    { "minQuantity": 12, "percentOff": 15 }
  ],
  "productId": null,
  "categoryId": null,
  "priority": 10,
  "isActive": true
}
```

`PATCH` hanya memvalidasi field yang dikirim, tetapi tetap digabung dengan nilai lama sebelum
disimpan. Karena itu `PATCH { "type": "dynamic" }` pada aturan lama yang belum punya persentase
ditolak dengan pesan `percentOff wajib diisi antara 0 dan 100 untuk dynamic`. Persentase di luar
rentang 0 sampai 100 selalu ditolak.

### Tabel error

| HTTP | Pesan | Arti |
| --- | --- | --- |
| 400 | `lines wajib berisi minimal satu item` | Body quote kosong |
| 400 | `Quantity tidak valid untuk produk ...` | Kuantitas bukan bilangan bulat positif |
| 400 | `Aturan harga tidak valid: ...` | Validasi cross field gagal |
| 400 | `Slug grup harus huruf kecil, angka, tanda hubung, atau garis bawah (2-80 karakter)` | Slug grup tidak valid |
| 404 | `Produk tidak ditemukan: ...` | `productId` tidak ada di katalog |
| 404 | `Aturan harga tidak ditemukan: ...` | Id aturan salah |
| 404 | `Grup tidak ditemukan: ...` | Id grup salah |

### Keputusan yang masih terbuka

- Angka kebijakan tetap milik brand: zona waktu untuk aturan `dynamic`, batas kuantitas untuk tier
  wholesale, dan definisi grup pelanggan. Kode tidak mengunci angka apa pun, semuanya data aturan.
- Tabel `pricing_rules`, `customer_groups`, dan `customer_group_members` punya file SQL
  `drizzle/0017_pricing_engine.sql` dan belum masuk `drizzle/meta/_journal.json`. Jalur de facto
  tetap `npm run db:push`.
- Quote menerima `basePrice` opsional untuk pemakaian internal. Route publik tidak meneruskan field
  itu, jadi klien tidak bisa menetapkan harganya sendiri.

## A/B Testing Banner (CMS-005)

Eksperimen kreatif banner. Setiap banner bisa punya beberapa varian, satu di antaranya ditandai
`isControl` sebagai fallback.

Penugasan varian deterministik: hash FNV-1a dari `sessionId + bannerId` dipetakan ke rentang bobot
varian aktif. Pengunjung yang sama selalu mendapat varian yang sama tanpa perlu menyimpan sesi, dan
tanpa `sessionId` resolver mengembalikan varian kontrol supaya banner tidak pernah kosong.

Pemenang dihitung dari CTR (klik dibagi view) dengan ambang `minViews` per eksperimen. Minimal dua
varian harus melewati ambang sebelum pemenang diumumkan. Tie-break: klik, lalu view, lalu
`variantId`, sehingga laporan yang dijalankan ulang tidak membalik hasil.

### Endpoint publik

`GET /api/v1/banners/{id}/variant?sessionId=<id-sesi>`

```json
{
  "success": true,
  "data": {
    "bannerId": "uuid-banner",
    "variant": {
      "id": "uuid-varian",
      "name": "Versi B",
      "imageUrl": "https://cdn.example.com/b.jpg",
      "linkUrl": "https://toko.example.com/promo",
      "isControl": false
    },
    "fallback": false
  }
}
```

`fallback: true` dan `variant: null` dikembalikan kalau banner tidak ada, tidak sedang tayang, atau
eksperimennya belum berjalan. Klien disarankan memakai banner utama saat `fallback` bernilai `true`.

### Endpoint admin

| Method | Path | Keterangan |
| --- | --- | --- |
| `GET` | `/banners/{id}/variants` | Daftar varian |
| `POST` | `/banners/{id}/variants` | Tambah varian (`name`, `imageUrl`, `linkUrl`, `weight`, `isControl`, `isActive`) |
| `PATCH` | `/banners/{id}/variants/{variantId}` | Ubah sebagian field |
| `DELETE` | `/banners/{id}/variants/{variantId}` | Hapus varian |
| `GET` | `/banners/{id}/experiment?from=&to=` | Setelan eksperimen plus CTR per varian dan saran pemenang |
| `PUT` | `/banners/{id}/experiment` | Buat atau ubah eksperimen (`status`, `minViews`, `winnerVariantId`) |
| `POST` | `/banners/{id}/experiment/apply` | Terapkan pemenang ke banner, body opsional `{ "variantId": "..." }` |

Hanya satu varian kontrol per banner. Menandai varian baru sebagai kontrol otomatis menurunkan
kontrol lama, sehingga fallback tetap tunggal dan tidak ambigu.

Eksperimen `running` yang berjalan akan dipakai resolver publik. Status lain membuat resolver
kembali ke banner utama.

### Keputusan yang masih terbuka

- Metrik pemenang final (CTR klik atau konversi order) tetap keputusan brand. Kode memakai CTR
  dengan `minViews` default 100, dan ambang itu bisa diubah per eksperimen.
- Tabel `banner_variants` dan `banner_experiments` plus kolom `banner_events.variant_id` punya file
  SQL `drizzle/0018_banner_ab.sql` dan belum masuk `drizzle/meta/_journal.json`. Jalur de facto
  tetap `npm run db:push`.
- Belum ada pembobotan otomatis (multi-armed bandit). Bobot masih diatur manual per varian.

