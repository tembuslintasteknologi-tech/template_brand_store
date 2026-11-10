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
  - `POST /api/auth/register` - Register a new customer
  - `POST /api/auth/login` - Login user
- **Products**:
  - `GET /api/products` - List / search products
  - `POST /api/products` - [Admin] Create product
  - `PUT /api/products/:id` - [Admin] Update product
  - `DELETE /api/products/:id` - [Admin] Delete product
- **Orders**:
  - `POST /api/orders` - Checkout cart & create order
  - `GET /api/orders/my-orders` - Customer order history
  - `PUT /api/orders/:id/status` - [Admin] Update order status & shipping
- **Promos**:
  - `GET /api/promos` - List active promos
  - `POST /api/promos` - [Admin] Create promo code
- **Admin Analytics**:
  - `GET /api/admin/dashboard` - Real-time KPI stats & recent orders
  - `GET /api/admin/reports/sales` - Sales and financial reports
  - `GET /api/admin/reports/products` - Top selling products report
