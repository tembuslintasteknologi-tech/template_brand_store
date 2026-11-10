# Brand Store Template Backend

**Headless, API-first single-brand store backend dengan integrasi Tembus logistics dan multi-payment gateway.**

Template ini dirancang agar sebuah brand memiliki website jual-beli miliknya sendiri. Tidak ada peran seller pihak ketiga: seluruh katalog, pesanan, dan operasional dikelola langsung oleh brand (admin), sementara pembeli berperan sebagai customer. Frontend (FE) dan UI/UX sepenuhnya diserahkan ke brand/klien dan dapat disesuaikan dengan identitas masing-masing.

---

## 📋 Dokumentasi

| Dokumen | Deskripsi |
|---------|-----------|
| [PRD](PRD-Brand-Store-Template.md) | Product Requirements Document lengkap |
| [API Docs](docs/API-Documentation.md) | Referensi API endpoints |
| [Database Schema](docs/Database-Schema.md) | Skema database PostgreSQL |
| [Integration Guide](docs/Integration-Guide.md) | Panduan integrasi payment & logistics |

---

## 🚀 Quick Start

```bash
# Install dependencies
bun install

# Setup environment
cp .env.example .env

# Run migrations
bun run db:migrate

# Start development
bun run dev
```

---

## 🏗️ Arsitektur

```
Client (React/Flutter/etc) → API (Bun + Hono) → PostgreSQL
                              ↓
                    ┌─────────┴─────────┐
                    ↓                   ↓
              Payment Adapter    Logistic Adapter
              (Midtrans,       (Tembus,
               Xendit, etc)     Aggregator)
```

---

## ✨ Fitur Utama

### Customer
- [x] Browse & search produk
- [x] Cart & checkout
- [x] Multi-payment (QRIS, VA, e-wallet, CC)
- [x] Real-time order tracking
- [x] Review & rating
- [x] Wishlist
- [x] Promo & flash sale
- [x] Notifikasi real-time

### Admin (Brand)
- [x] Product & catalog management
- [x] Order management
- [x] Shipping label generation
- [x] Sales analytics & reporting
- [x] Banner & content management
- [x] Promo & discount management
- [x] Customer management
- [x] Moderation tools

---

## 🔧 Tech Stack

| Layer | Technology |
|-------|------------|
| Runtime | Bun |
| Framework | Hono |
| Database | PostgreSQL + Drizzle ORM |
| Cache | Redis |
| Queue | BullMQ |
| Real-time | WebSocket |
| Auth | JWT + Argon2 |

---

## 📦 Deployment

```bash
# Docker
docker build -t brand-store-api .
docker run -p 3000:3000 brand-store-api

# Docker Compose
docker-compose up -d
```

---

## 📄 License

MIT License - Free for commercial use

---

*Template by Full Stack Development Team*
