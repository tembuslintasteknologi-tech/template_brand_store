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

