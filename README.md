# Brand Store Template Backend

A production-grade, secure single-brand e-commerce backend API built with **Hono**, **TypeScript**, **Drizzle ORM**, and **PostgreSQL**. Designed with **Zero Trust Security** principles, strict input validation (Zod), Argon2 password hashing, and comprehensive admin analytics.

---

## Features

- **Zero Trust Security**: Strict security headers (`X-Content-Type-Options`, `X-Frame-Options`, `HSTS`), CORS whitelist, and role-based access control (RBAC for `admin` and `customer`).
- **Authentication**: Secure registration and login using **Argon2** password hashing and token-based sessions.
- **Product Catalog**: Advanced product management, category filtering, search, and stock tracking.
- **Cart & Orders**: Cart management, atomic stock reservation during checkout, and order history tracking.
- **Promo & Discount Engine**: Create and manage percentage or fixed-amount discount codes with usage limits and minimum order thresholds.
- **Admin Analytics & Reports**: Real-time KPI dashboard (`/api/admin/dashboard`), sales summary reports, and top-selling product analytics.

---

## Project Structure

```text
brand-store-app/
├── src/
│   ├── config/          # Centralized configuration (unifiedConfig.ts)
│   ├── db/              # Drizzle ORM schemas (schema.ts, promosSchema.ts)
│   ├── middleware/      # Auth & RBAC security middleware
│   ├── routes/          # API endpoints (auth, products, orders, promos, analytics)
│   ├── types/           # Hono context augmentations
│   ├── validators/      # Zod input validation schemas
│   └── index.ts         # App entry point & security headers
├── package.json
└── tsconfig.json
```

---

## Getting Started

### Prerequisites
- Node.js (v18+) or [Bun](https://bun.sh/) (Recommended)
- PostgreSQL Database

### 1. Installation

Clone the repository and install dependencies inside `brand-store-app`:

```bash
cd brand-store-app
bun install
# or if using Node.js
npm install
```

### 2. Environment Configuration

Create a `.env` file in `brand-store-app/`:

```env
PORT=3000
DATABASE_URL=postgres://postgres:postgres@localhost:5432/brand_store_db
JWT_SECRET=your-super-secure-jwt-secret
CORS_ORIGIN=*
```

### 3. Running the Development Server

Using **Bun**:
```bash
bun run dev
```

Using **Node.js**:
```bash
npm run dev
```

The server will start at `http://localhost:3000`.

---

## API Endpoints Overview

- **Health Check**: `GET /health`
- **Authentication**:
  - `POST /api/v1/auth/register` - Register a new customer
  - `POST /api/v1/auth/login` - Login user
  - `GET /api/v1/auth/2fa/status` - [Admin] Status TOTP admin
- **Products**:
  - `GET /api/v1/products` - List / search products
  - `POST /api/v1/products` - [Admin] Create product
  - `PUT /api/v1/products/:id` - [Admin] Update product
  - `DELETE /api/v1/products/:id` - [Admin] Delete product
- **Orders**:
  - `POST /api/v1/orders` - Checkout cart & create order
  - `GET /api/v1/orders/my-orders` - Customer order history
  - `PATCH /api/v1/orders/admin/:id/status` - [Admin] Update order status & shipping
  - `GET /api/v1/realtime/orders/:orderId/stream` - SSE status order real-time
- **Promos**:
  - `GET /api/v1/promos` - List active promos
  - `POST /api/v1/promos` - [Admin] Create promo code
- **Live chat**:
  - `GET /api/v1/chat/hours` - Jam operasional chat
  - `GET /api/v1/chat/stream` - SSE pesan untuk pelanggan
  - `GET /api/v1/admin/chat/queue` - [Admin] Antrean percakapan
- **Cart dan recovery**:
  - `GET /api/v1/cart` - Keranjang persisten milik user
  - `POST /api/v1/cart/recover/:token` - Pulihkan cart dari link email
  - `POST /api/v1/admin/cart-recovery/scan` - [Admin] Jalankan scanner abandoned cart
- **Admin Analytics**:
  - `GET /api/v1/admin/dashboard` - Real-time KPI stats & recent orders
  - `GET /api/v1/admin/reports/sales` - Sales and financial reports
  - `GET /api/v1/admin/reports/products` - Top selling products report
