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
