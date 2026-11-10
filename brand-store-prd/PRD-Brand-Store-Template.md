# Product Requirements Document (PRD)
## Brand Store Template Backend System

---

**Document Version:** 2.0.0  
**Last Updated:** 2026-11-10  
**Status:** Approved for Development  
**Target Release:** Q1 2027  
**Document Owner:** Full Stack Development Team  

---

## 1. EXECUTIVE SUMMARY

### 1.1 Product Vision
Membangun **headless single-brand store backend template** yang dapat di-customize penuh oleh klien di frontend layer, dengan integrasi logistik bawaan (Tembus) dan payment gateway yang pluggable (multi-provider). Template ini membuat sebuah brand memiliki website jual-beli miliknya sendiri tanpa peran seller pihak ketiga.

### 1.2 Business Objectives
| Objective | Target | Measurement |
|-----------|--------|-------------|
| Time-to-market untuk klien baru | < 2 minggu setup | Setup time tracking |
| Customization frontend flexibility | 100% UI-agnostic | API coverage |
| Payment vendor flexibility | Support 3+ gateway | Integration count |
| Operational cost reduction | < 30% dari build from scratch | Cost comparison |

### 1.3 Success Metrics
- **Technical:** API response time < 200ms (p95), uptime 99.9%
- **Business:** 10+ klien aktif dalam 6 bulan pertama
- **Adoption:** 80% klien tidak perlu modify backend code

---

## 2. PRODUCT OVERVIEW

### 2.1 What is This Product?
Template backend store **API-first** yang menyediakan seluruh business logic, database schema, dan integration layer untuk operasi e-commerce end-to-end milik satu brand. Seluruh katalog dan pesanan dikelola langsung oleh brand (admin), sementara pembeli berperan sebagai customer. Klien hanya perlu membangun frontend sesuai brand mereka.

### 2.2 Key Differentiators
| Aspect | Our Solution | Traditional |
|--------|--------------|-------------|
| **Architecture** | Headless, API-first | Monolithic |
| **Logistics** | Built-in Tembus integration | Manual integration |
| **Payment** | Pluggable multi-gateway | Single vendor lock-in |
| **Customization** | UI 100% client-controlled | Template-limited |
| **Deployment** | Docker-ready, one-command | Complex setup |

### 2.3 Target Users
| User Type | Description |
|-----------|-------------|
| **Primary** | Brand/business owners yang mau punya website jual-beli sendiri dengan cepat |
| **Secondary** | Development agencies yang butuh white-label solution |
| **Tertiary** | Internal teams yang butuh customizable commerce backend |

---

## 3. SYSTEM ARCHITECTURE

### 3.1 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        CLIENT LAYER                              │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐        │
│  │  Web     │  │ Mobile   │  │  POS     │  │  Admin   │        │
│  │ (React)  │  │(Flutter) │  │(Tablet)  │  │ Dashboard│        │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘        │
│       └─────────────┴─────────────┴─────────────┘              │
│                         REST API / WebSocket                     │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      API GATEWAY (Bun + Hono)                    │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  Rate Limiting │ Auth Middleware │ Request Validation    │    │
│  │  Logging │ Tracing │ Error Handling │ Response Formatting │    │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        ▼                     ▼                     ▼
┌───────────────┐    ┌───────────────┐    ┌───────────────┐
│   CORE        │    │   PAYMENT     │    │   LOGISTIC    │
│   MODULES     │    │   ADAPTER     │    │   ADAPTER     │
│               │    │               │    │               │
│ • Catalog     │    │ • Midtrans    │    │ • Tembus      │
│ • Cart        │    │ • Xendit      │    │ • Aggregator  │
│ • Order       │    │ • Stripe      │    │ • Tracking    │
│ • User        │    │ • Manual Bank │    │ • Rate Calc   │
│ • Review      │    │ • BNPL        │    │ • AWB Gen     │
│ • Promo       │    │               │    │               │
│ • Inventory   │    │               │    │               │
│ • Notification│    │               │    │               │
└───────┬───────┘    └───────┬───────┘    └───────┬───────┘
        │                    │                    │
        └────────────────────┼────────────────────┘
                             ▼
              ┌─────────────────────────────┐
              │      EVENT BUS (Redis)      │
              │  OrderCreated │ PaymentPaid  │
              │  Shipped │ Delivered │ etc   │
              └─────────────────────────────┘
                             │
        ┌────────────────────┼────────────────────┐
        ▼                    ▼                    ▼
┌───────────────┐    ┌───────────────┐    ┌───────────────┐
│  PostgreSQL   │    │     Redis     │    │  File Storage │
│  (Primary DB) │    │  Cache + Queue│    │  (S3/MinIO)   │
└───────────────┘    └───────────────┘    └───────────────┘
```

### 3.2 Technology Stack

| Layer | Technology | Version | Rationale |
|-------|------------|---------|-----------|
| Runtime | Bun | 1.1.x | Fast, TypeScript native |
| Framework | Hono | 4.x | Lightweight, Edge-ready |
| Database | PostgreSQL | 16.x | ACID, JSON support, mature |
| ORM | Drizzle | 0.36.x | Type-safe, lightweight |
| Cache | Redis | 7.x | Session, queue, cache |
| Queue | BullMQ | 5.x | Job processing, scheduling |
| Real-time | WebSocket | Native | Live notifications |
| Auth | JWT + Refresh | - | Stateless, scalable |
| Validation | Zod | 3.x | Runtime type safety |
| Testing | Vitest | 2.x | Fast, ESM native |
| Container | Docker | 24.x | Consistent deployment |

---

## 4. FEATURE SPECIFICATIONS

### 4.1 Feature Categories

```
📦 CORE COMMERCE
   ├── Catalog Management
   ├── Cart & Checkout
   ├── Order Management
   ├── Inventory Tracking
   └── Pricing Engine

👤 USER MANAGEMENT
   ├── Authentication
   ├── Profile Management
   ├── Address Book
   ├── Wishlist
   └── Loyalty Points

💳 PAYMENT & FINANCE
   ├── Multi-Gateway Payment
   ├── Wallet System
   ├── Refund Processing
   └── Financial Reporting

🚚 LOGISTICS
   ├── Tembus Integration
   ├── Multi-Provider Support
   ├── Rate Calculation
   ├── Tracking & AWB
   └── Delivery Scheduling

📢 MARKETING & ENGAGEMENT
   ├── Promo & Discount Engine
   ├── Flash Sale System
   ├── Referral Program
   ├── Push Notification
   └── Email Campaign

📊 ADMIN & OPERATIONS
   ├── Dashboard & Analytics
   ├── User Management
   ├── Content Management
   ├── Moderation Tools
   └── System Configuration

🔔 REAL-TIME
   ├── Order Status Updates
   ├── Chat Support
   ├── Live Notifications
   └── Activity Feeds
```

---

## 5. DETAILED FEATURE REQUIREMENTS

---

### 5.1 CORE COMMERCE MODULES

---

#### 5.1.1 Catalog Management

**User Stories:**
- As an **admin**, I want to add/edit/delete products with variants so I can manage the brand catalog
- As a **customer**, I want to browse/search/filter products so I can find what I need
- As a **customer**, I want to see product details with images, videos, reviews so I can make informed decisions

**Functional Requirements:**

| ID | Requirement | Priority |
|----|-------------|----------|
| CAT-001 | Product CRUD with multi-language support | P0 |
| CAT-002 | Product variants (size, color, material, etc) | P0 |
| CAT-003 | Category tree (nested up to 5 levels) | P0 |
| CAT-004 | Product images (up to 10 per product) + 1 video | P0 |
| CAT-005 | Rich text description with HTML sanitization | P0 |
| CAT-006 | Product attributes/specifications (dynamic schema) | P0 |
| CAT-007 | Search with full-text + fuzzy matching | P0 |
| CAT-008 | Filter by price, category, attributes, rating, location | P0 |
| CAT-009 | Sort by relevance, price, rating, newest, popularity | P0 |
| CAT-010 | Product SEO (slug, meta title, meta description) | P1 |
| CAT-011 | Bulk import/export (CSV, Excel) | P1 |
| CAT-012 | Product bundles/kits | P2 |
| CAT-013 | Virtual/digital products | P2 |
| CAT-014 | Product comparison | P2 |
| CAT-015 | Recently viewed products | P1 |

**API Endpoints:**

```
POST   /api/v1/products              # Create product
GET    /api/v1/products              # List products (paginated, filterable)
GET    /api/v1/products/:id          # Get product detail
PUT    /api/v1/products/:id          # Update product
DELETE /api/v1/products/:id          # Soft delete product
POST   /api/v1/products/:id/images   # Upload product image
GET    /api/v1/categories            # Get category tree
POST   /api/v1/categories            # Create category
GET    /api/v1/search                # Global search
POST   /api/v1/products/bulk-import  # Bulk import
GET    /api/v1/products/bulk-template # Download template
```

**Database Schema (simplified):**

```sql
products
- id (uuid, PK)
- created_by (uuid, FK, nullable) -- admin (brand)
- category_id (uuid, FK)
- name (jsonb) -- multi-language
- slug (varchar, unique)
- description (jsonb)
- base_price (decimal)
- compare_at_price (decimal, nullable)
- cost_price (decimal, nullable) -- for margin calc
- currency (char(3))
- status (enum: draft, active, archived, out_of_stock)
- is_featured (boolean)
- is_digital (boolean)
- weight (decimal) -- for shipping calc
- dimensions (jsonb)
- seo_title (varchar)
- seo_description (text)
- created_at, updated_at, deleted_at

product_variants
- id (uuid, PK)
- product_id (uuid, FK)
- sku (varchar, unique)
- barcode (varchar, nullable)
- attributes (jsonb) -- {size: "XL", color: "Red"}
- price_modifier (decimal) -- +/- from base price
- stock_quantity (int)
- low_stock_threshold (int, default 5)
- image_url (varchar, nullable)

product_images
- id (uuid, PK)
- product_id (uuid, FK)
- variant_id (uuid, FK, nullable)
- url (varchar)
- alt_text (varchar)
- sort_order (int)
- is_primary (boolean)

categories
- id (uuid, PK)
- parent_id (uuid, FK, nullable)
- name (jsonb)
- slug (varchar)
- image_url (varchar)
- sort_order (int)
- is_active (boolean)
```

---

#### 5.1.2 Cart & Checkout

**User Stories:**
- As a **customer**, I want to add products to cart so I can purchase multiple items at once
- As a **customer**, I want to apply promo codes so I can get discounts
- As a **customer**, I want to select shipping method so I know delivery cost upfront

**Functional Requirements:**

| ID | Requirement | Priority |
|----|-------------|----------|
| CRT-001 | Add/remove/update cart items | P0 |
| CRT-002 | Guest cart (session-based) | P0 |
| CRT-003 | Merge guest cart on login | P0 |
| CRT-004 | Cart persistence across devices | P0 |
| CRT-005 | Stock validation on add/update | P0 |
| CRT-006 | Price recalculation (promo, tax, shipping) | P0 |
| CRT-007 | Save for later | P1 |
| CRT-008 | Cart sharing via link | P2 |
| CRT-009 | Abandoned cart recovery | P1 |

**Checkout Flow:**

```
1. Cart Review
   └── Validate stock, calculate subtotal

2. Address Selection
   └── Choose saved address or add new

3. Shipping Method
   └── Get rates from Tembus/aggregator
   └── Select preferred courier + service

4. Payment Method
   └── Show available payment options
   └── Apply promo/voucher if any

5. Review & Confirm
   └── Final price breakdown
   └── Terms & conditions acceptance

6. Payment Processing
   └── Create payment transaction
   └── Redirect to payment gateway / show QRIS

7. Order Confirmation
   └── Create order record
   └── Send confirmation notification
   └── Clear cart
```

**API Endpoints:**

```
GET    /api/v1/cart                  # Get current cart
POST   /api/v1/cart/items            # Add item to cart
PUT    /api/v1/cart/items/:id        # Update cart item qty
DELETE /api/v1/cart/items/:id        # Remove cart item
POST   /api/v1/cart/merge            # Merge guest cart
DELETE /api/v1/cart                  # Clear cart

POST   /api/v1/checkout/quote        # Get price quote
POST   /api/v1/checkout/shipping-rates # Get shipping options
POST   /api/v1/checkout/validate-promo # Validate promo code
POST   /api/v1/checkout/process      # Process checkout
GET    /api/v1/checkout/:id/status   # Check payment status
```

---

#### 5.1.3 Order Management

**User Stories:**
- As a **customer**, I want to track my order status so I know when it arrives
- As an **admin**, I want to update order status so customers know progress
- As an **admin**, I want to see all orders for oversight and dispute resolution

**Order Status Flow:**

```
CREATED → PENDING_PAYMENT → PAID → PROCESSING → SHIPPED → DELIVERED → COMPLETED
   │                                                           │
   └──→ CANCELLED ←──┐                                         └──→ REFUNDED
                     │                                              │
   └──→ EXPIRED ─────┘                                         RETURNED → REFUNDED
   └──→ FAILED
```

**Functional Requirements:**

| ID | Requirement | Priority |
|----|-------------|----------|
| ORD-001 | Create order from checkout | P0 |
| ORD-002 | Order numbering (INV/2026/11/000001) | P0 |
| ORD-004 | Order status tracking with history | P0 |
| ORD-005 | Order cancellation (with rules) | P0 |
| ORD-006 | Order modification (before payment) | P1 |
| ORD-007 | Invoice generation (PDF) | P0 |
| ORD-008 | Order notes (customer/admin) | P1 |
| ORD-009 | Order dispute/complaint | P1 |
| ORD-010 | Bulk order actions (admin) | P1 |
| ORD-011 | Order timeline/activity log | P0 |
| ORD-012 | Auto-cancel expired payments | P0 |

**API Endpoints:**

```
POST   /api/v1/orders                # Create order (from checkout)
GET    /api/v1/orders                # List orders (customer/admin)
GET    /api/v1/orders/:id            # Get order detail
PUT    /api/v1/orders/:id/status     # Update order status
POST   /api/v1/orders/:id/cancel     # Cancel order
GET    /api/v1/orders/:id/invoice    # Download invoice PDF
POST   /api/v1/orders/:id/notes      # Add order note
POST   /api/v1/orders/:id/dispute    # Open dispute
GET    /api/v1/orders/:id/timeline   # Get order history
```

---

#### 5.1.4 Inventory Management

**Functional Requirements:**

| ID | Requirement | Priority |
|----|-------------|----------|
| INV-001 | Stock tracking per variant | P0 |
| INV-002 | Stock reservation during checkout | P0 |
| INV-003 | Auto stock release on payment expiry | P0 |
| INV-004 | Low stock alerts | P0 |
| INV-005 | Stock adjustment (manual) | P0 |
| INV-006 | Stock history/audit trail | P1 |
| INV-007 | Multi-warehouse support | P2 |
| INV-008 | Stock transfer between warehouses | P2 |
| INV-009 | Pre-order/backorder support | P2 |
| INV-010 | Stock sync with external system | P2 |

---

#### 5.1.5 Pricing Engine

**Functional Requirements:**

| ID | Requirement | Priority |
|----|-------------|----------|
| PRC-001 | Base price per variant | P0 |
| PRC-002 | Dynamic pricing rules (time-based) | P1 |
| PRC-003 | Tiered pricing (wholesale) | P2 |
| PRC-004 | Customer group pricing | P2 |
| PRC-005 | Price rounding rules | P1 |
| PRC-006 | Tax calculation (VAT, regional) | P0 |
| PRC-007 | Currency conversion | P2 |

---

### 5.2 USER MANAGEMENT MODULES

---

#### 5.2.1 Authentication & Authorization

**Functional Requirements:**

| ID | Requirement | Priority |
|----|-------------|----------|
| AUT-001 | Email/password registration | P0 |
| AUT-002 | Phone OTP registration | P0 |
| AUT-003 | Social login (Google, Apple, Facebook) | P0 |
| AUT-004 | JWT access token (15 min) + refresh token (7 days) | P0 |
| AUT-005 | Password reset via email/SMS | P0 |
| AUT-006 | Email/phone verification | P0 |
| AUT-007 | Biometric login (mobile) | P1 |
| AUT-008 | Session management (multi-device) | P0 |
| AUT-009 | Force logout / revoke token | P0 |
| AUT-010 | RBAC (Role-Based Access Control) | P0 |

**User Roles:**

```
┌─────────────────────────────────────────────────────────┐
│                    ROLE HIERARCHY                        │
├─────────────────────────────────────────────────────────┤
│  ADMIN          → Full store & catalog management        │
│  CUSTOMER       → Shopping access                        │
│  GUEST          → Browse only                            │
└─────────────────────────────────────────────────────────┘
```

**Permissions Matrix:**

| Feature | Admin | Customer |
|---------|-------|----------|
| User management | ✅ | ❌ |
| Product CRUD | ✅ | ❌ |
| Order management | ✅ | Own only |
| Promo management | ✅ | ❌ |
| Financial reports | ✅ | ❌ |
| Content moderation | ✅ | ❌ |
| Review moderation | ✅ | ❌ |

---

#### 5.2.2 Profile Management

**Functional Requirements:**

| ID | Requirement | Priority |
|----|-------------|----------|
| PRF-001 | Basic profile (name, avatar, bio) | P0 |
| PRF-002 | Multiple addresses with labels | P0 |
| PRF-003 | Default address selection | P0 |
| PRF-004 | Phone/email change with verification | P0 |
| PRF-005 | Notification preferences | P0 |
| PRF-006 | Privacy settings (profile visibility) | P1 |
| PRF-007 | Account deletion (GDPR compliance) | P0 |
| PRF-008 | Activity log | P1 |

---

#### 5.2.3 Wishlist & Favorites

| ID | Requirement | Priority |
|----|-------------|----------|
| WSH-001 | Add/remove wishlist items | P0 |
| WSH-002 | Multiple wishlists | P1 |
| WSH-003 | Wishlist sharing | P2 |
| WSH-004 | Price drop notification | P1 |
| WSH-005 | Back in stock notification | P1 |

---

#### 5.2.4 Loyalty & Rewards

| ID | Requirement | Priority |
|----|-------------|----------|
| LTY-001 | Points earning (purchase, review, referral) | P1 |
| LTY-002 | Points redemption | P1 |
| LTY-003 | Tier system (bronze, silver, gold, platinum) | P2 |
| LTY-004 | Tier benefits (discount, free shipping) | P2 |
| LTY-005 | Points expiry | P2 |
| LTY-006 | Birthday rewards | P2 |

---

### 5.3 PAYMENT & FINANCE MODULES

---

#### 5.3.1 Payment Gateway Integration

**Architecture: Adapter Pattern**

```typescript
// packages/payment-adapter/src/types.ts

export interface PaymentProvider {
  readonly name: string;
  readonly supportedMethods: PaymentMethod[];

  createTransaction(params: CreateTransactionParams): Promise<TransactionResult>;
  verifyWebhook(payload: unknown, headers: Record<string, string>): WebhookVerification;
  getTransactionStatus(transactionId: string): Promise<TransactionStatus>;
  cancelTransaction(transactionId: string): Promise<void>;
  refund?(params: RefundParams): Promise<RefundResult>;
}

export interface CreateTransactionParams {
  orderId: string;
  amount: number;
  currency: string;
  method: PaymentMethod;
  customer: CustomerInfo;
  items: OrderItem[];
  callbackUrl: string;
  metadata?: Record<string, unknown>;
}

export type PaymentMethod = 
  | 'credit_card' 
  | 'bank_transfer' 
  | 'e_wallet' 
  | 'qris' 
  | 'retail_outlet' 
  | 'bnpl'
  | 'cod';
```

**Supported Providers (Phase 1):**

| Provider | Methods | Priority |
|----------|---------|----------|
| Midtrans | CC, VA, e-wallet, QRIS, retail | P0 |
| Xendit | CC, VA, e-wallet, QRIS, retail, BNPL | P0 |
| Manual Transfer | Bank transfer with verification | P0 |
| Stripe | CC, e-wallet (international) | P1 |
| DOKU | CC, VA, e-wallet | P2 |

**Functional Requirements:**

| ID | Requirement | Priority |
|----|-------------|----------|
| PAY-001 | Multi-gateway support | P0 |
| PAY-002 | Payment method availability per gateway | P0 |
| PAY-003 | 3DS authentication for CC | P0 |
| PAY-004 | QRIS generation | P0 |
| PAY-005 | Virtual account generation | P0 |
| PAY-006 | Payment expiry handling | P0 |
| PAY-007 | Webhook handling with signature verification | P0 |
| PAY-008 | Payment retry mechanism | P1 |
| PAY-009 | Partial payment (deposit) | P2 |
| PAY-010 | Installment/BNPL | P2 |

---

#### 5.3.2 Wallet System

| ID | Requirement | Priority |
|----|-------------|----------|
| WLT-001 | Internal wallet (top-up, pay, withdraw) | P1 |
| WLT-002 | Transaction history | P1 |
| WLT-003 | Wallet-to-wallet transfer | P2 |
| WLT-004 | Auto top-up | P2 |
| WLT-005 | Cashback to wallet | P1 |

---

#### 5.3.3 Refund & Dispute

| ID | Requirement | Priority |
|----|-------------|----------|
| RFD-001 | Full refund | P0 |
| RFD-002 | Partial refund | P0 |
| RFD-003 | Refund to original payment method | P0 |
| RFD-004 | Refund to wallet | P1 |
| RFD-005 | Return merchandise authorization (RMA) | P1 |
| RFD-006 | Return shipping label generation | P2 |
| RFD-007 | Refund approval workflow | P0 |

---

### 5.4 LOGISTICS MODULES

---

#### 5.4.1 Tembus Integration (Primary)

**Tembus API Integration Scope:**

```typescript
// packages/logistic-adapter/src/tembus/types.ts

export interface TembusProvider {
  // Rate & Service
  getServices(): Promise<ShippingService[]>;
  calculateRate(params: RateCalculationParams): Promise<ShippingRate[]>;

  // Shipment
  createShipment(params: CreateShipmentParams): Promise<ShipmentResult>;
  cancelShipment(awb: string): Promise<void>;
  printLabel(awb: string): Promise<LabelUrl>;

  // Tracking
  trackShipment(awb: string): Promise<TrackingInfo>;
  subscribeWebhook(callbackUrl: string): Promise<void>;

  // Pickup
  schedulePickup(params: PickupParams): Promise<PickupResult>;
  getPickupHistory(): Promise<PickupHistory[]>;
}

export interface RateCalculationParams {
  origin: Address;
  destination: Address;
  weight: number; // in grams
  dimensions?: Dimensions;
  value?: number; // for insurance
  cod?: boolean;
}
```

**Functional Requirements:**

| ID | Requirement | Priority |
|----|-------------|----------|
| LOG-001 | Rate calculation (all Tembus services) | P0 |
| LOG-002 | AWB generation | P0 |
| LOG-003 | Shipping label generation (PDF) | P0 |
| LOG-004 | Real-time tracking | P0 |
| LOG-005 | Webhook for status updates | P0 |
| LOG-006 | Pickup scheduling | P0 |
| LOG-007 | COD support | P1 |
| LOG-008 | Insurance calculation | P1 |
| LOG-009 | Multi-parcel shipment | P2 |
| LOG-010 | Drop-off location finder | P2 |

---

#### 5.4.2 Multi-Provider Support (Aggregator)

**Architecture:**

```
┌─────────────────────────────────────────┐
│         LOGISTIC AGGREGATOR              │
│  ┌─────┐  ┌─────┐  ┌─────┐  ┌─────┐   │
│  │Tembus│  │JNE  │  │SiCepat│  │GoSend│  │
│  │(default)│  │(opt)│  │(opt) │  │(opt)│   │
│  └─────┘  └─────┘  └─────┘  └─────┘   │
│                                          │
│  Unified Interface:                       │
│  - calculateRate()                       │
│  - createShipment()                      │
│  - trackShipment()                       │
│  - cancelShipment()                      │
└─────────────────────────────────────────┘
```

| ID | Requirement | Priority |
|----|-------------|----------|
| AGG-001 | Pluggable provider interface | P1 |
| AGG-002 | Rate comparison across providers | P1 |
| AGG-003 | Auto-select cheapest/fastest | P2 |
| AGG-004 | Provider failover | P2 |
| AGG-005 | Unified tracking interface | P1 |

---

#### 5.4.3 Delivery Management

| ID | Requirement | Priority |
|----|-------------|----------|
| DLV-001 | Delivery scheduling (date/time slot) | P1 |
| DLV-002 | Delivery instructions | P0 |
| DLV-003 | Delivery proof (photo, signature) | P1 |
| DLV-004 | Failed delivery handling | P0 |
| DLV-005 | Re-delivery scheduling | P1 |
| DLV-006 | Out-of-home delivery (locker, pickup point) | P2 |

---

### 5.5 MARKETING & ENGAGEMENT MODULES

---

#### 5.5.1 Promo & Discount Engine

**Discount Types:**

```
┌─────────────────────────────────────────────────────────┐
│                  DISCOUNT TYPES                          │
├─────────────────────────────────────────────────────────┤
│  PERCENTAGE    → 10% off, 25% off                        │
│  FIXED_AMOUNT  → Rp 50.000 off                           │
│  FREE_SHIPPING → No shipping cost                        │
│  BUY_X_GET_Y   → Buy 2 Get 1, Buy 1 Get 1 50%           │
│  BUNDLE        → Package deal pricing                    │
│  TIERED        → Spend 100K get 10K, 200K get 25K       │
│  FIRST_ORDER   → New customer discount                   │
│  REFERRAL      → Refer-a-friend credit                   │
└─────────────────────────────────────────────────────────┘
```

**Promo Code Features:**

| ID | Requirement | Priority |
|----|-------------|----------|
| PRM-001 | Promo code CRUD | P0 |
| PRM-002 | Usage limits (total, per user) | P0 |
| PRM-003 | Date range validity | P0 |
| PRM-004 | Minimum purchase amount | P0 |
| PRM-005 | Applicable products/categories | P0 |
| PRM-006 | User segment targeting | P1 |
| PRM-007 | Stackable rules | P1 |
| PRM-008 | Auto-apply promos | P1 |
| PRM-009 | Promo analytics | P1 |

**Flash Sale System:**

| ID | Requirement | Priority |
|----|-------------|----------|
| FLS-001 | Flash sale CRUD with time window | P0 |
| FLS-002 | Stock allocation for flash sale | P0 |
| FLS-003 | Queue system (for high demand) | P2 |
| FLS-004 | Flash sale landing page data | P0 |
| FLS-005 | Countdown timer data | P0 |
| FLS-006 | Purchase limit per user | P0 |

---

#### 5.5.2 Referral Program

| ID | Requirement | Priority |
|----|-------------|----------|
| RFR-001 | Unique referral code per user | P1 |
| RFR-002 | Referral link generation | P1 |
| RFR-003 | Reward for referrer | P1 |
| RFR-004 | Reward for referee | P1 |
| RFR-005 | Referral tracking | P1 |
| RFR-006 | Referral leaderboard | P2 |

---

#### 5.5.3 Notification System

**Channels:**

```
┌─────────────────────────────────────────────────────────┐
│               NOTIFICATION CHANNELS                      │
├─────────────────────────────────────────────────────────┤
│  IN_APP     → Bell icon, notification center             │
│  PUSH       → FCM (Android), APNs (iOS)                  │
│  EMAIL      → Transactional + marketing                  │
│  SMS        → OTP, critical alerts                       │
│  WHATSAPP   → Order updates (optional)                   │
└─────────────────────────────────────────────────────────┘
```

**Notification Types:**

| Category | Types |
|----------|-------|
| **Order** | Order created, payment success, processing, shipped, delivered, cancelled, refund |
| **Promo** | New promo, flash sale starting, price drop, back in stock |
| **Social** | Review reply, admin message, follower activity |
| **System** | Security alert, policy update, maintenance |
| **Wallet** | Top-up success, payment received, withdrawal |

**Functional Requirements:**

| ID | Requirement | Priority |
|----|-------------|----------|
| NTF-001 | Multi-channel notification | P0 |
| NTF-002 | User preference management | P0 |
| NTF-003 | Notification templates | P0 |
| NTF-004 | Scheduled notifications | P1 |
| NTF-005 | Bulk notifications (admin) | P1 |
| NTF-006 | Notification analytics | P2 |
| NTF-007 | Deep linking support | P0 |

---

#### 5.5.4 Real-time Features

| ID | Requirement | Priority |
|----|-------------|----------|
| RTC-001 | WebSocket connection management | P0 |
| RTC-002 | Order status real-time updates | P0 |
| RTC-003 | Live chat (customer ↔ admin support) | P1 |
| RTC-004 | Typing indicators | P2 |
| RTC-005 | Read receipts | P2 |
| RTC-006 | Online/offline status | P2 |

---

### 5.6 ADMIN & OPERATIONS MODULES

---

#### 5.6.1 Admin Dashboard

**Dashboard Widgets:**

```
┌─────────────────────────────────────────────────────────┐
│                    ADMIN DASHBOARD                       │
├─────────────────────────────────────────────────────────┤
│  📊 KPI Cards:                                           │
│  ├── Today's Revenue                                     │
│  ├── Today's Orders                                      │
│  ├── Active Users                                        │
│  ├── Pending Actions                                     │
│  └── Low Stock Alerts                                    │
│                                                          │
│  📈 Charts:                                              │
│  ├── Revenue Trend (7/30/90 days)                        │
│  ├── Order Volume                                        │
│  ├── Top Selling Products                                │
│  ├── Sales by Category                                   │
│  └── New User Registration                               │
│                                                          │
│  🔔 Recent Activity:                                     │
│  ├── New Orders                                          │
│  ├── Payment Issues                                      │
│  ├── Disputes                                            │
│  └── System Alerts                                       │
└─────────────────────────────────────────────────────────┘
```

**Functional Requirements:**

| ID | Requirement | Priority |
|----|-------------|----------|
| ADM-001 | Real-time KPI dashboard | P0 |
| ADM-002 | Customizable dashboard widgets | P2 |
| ADM-003 | Date range filtering | P0 |
| ADM-004 | Export reports (CSV, Excel, PDF) | P0 |
| ADM-005 | Scheduled email reports | P2 |

---

#### 5.6.2 User Management (Admin)

| ID | Requirement | Priority |
|----|-------------|----------|
| USM-001 | User list with filters | P0 |
| USM-002 | User detail view | P0 |
| USM-003 | User status management (activate/suspend) | P0 |
| USM-004 | Role assignment | P0 |
| USM-005 | Bulk user actions | P1 |
| USM-006 | User impersonation (support) | P1 |
| USM-007 | User activity log | P1 |

---

#### 5.6.3 Content Management

**Hero Banner Management:**

| ID | Requirement | Priority |
|----|-------------|----------|
| CMS-001 | Banner CRUD | P0 |
| CMS-002 | Banner scheduling (start/end date) | P0 |
| CMS-003 | Banner targeting (user segment, page) | P1 |
| CMS-004 | Banner analytics (views, clicks, CTR) | P1 |
| CMS-005 | A/B testing for banners | P2 |

**Static Pages:**

| ID | Requirement | Priority |
|----|-------------|----------|
| PGE-001 | Page CRUD (About, FAQ, Terms, etc) | P0 |
| PGE-002 | Rich text editor | P0 |
| PGE-003 | Page versioning | P2 |
| PGE-004 | SEO settings per page | P1 |

**Blog/CMS (Optional):**

| ID | Requirement | Priority |
|----|-------------|----------|
| BLG-001 | Article CRUD | P2 |
| BLG-002 | Category & tags | P2 |
| BLG-003 | Featured images | P2 |

---

#### 5.6.4 Moderation Tools

| ID | Requirement | Priority |
|----|-------------|----------|
| MOD-001 | Product moderation queue | P0 |
| MOD-002 | Review moderation | P0 |
| MOD-003 | Image moderation (NSFW detection) | P1 |
| MOD-004 | Text moderation (profanity filter) | P1 |
| MOD-005 | User report handling | P0 |
| MOD-006 | Content takedown workflow | P0 |

---

#### 5.6.5 System Configuration

| ID | Requirement | Priority |
|----|-------------|----------|
| CFG-001 | General settings (site name, logo, contact) | P0 |
| CFG-002 | Payment gateway configuration | P0 |
| CFG-003 | Shipping settings (default courier, markup) | P0 |
| CFG-004 | Tax settings | P0 |
| CFG-005 | Email/SMS provider settings | P0 |
| CFG-006 | Feature flags | P1 |
| CFG-007 | Maintenance mode | P0 |
| CFG-008 | API key management | P0 |

---

## 6. API DESIGN SPECIFICATIONS

### 6.1 API Conventions

**Base URL:** `https://api.{domain}.com/v1`

**Authentication:**
```
Authorization: Bearer <access_token>
```

**Standard Response Format:**
```json
{
  "success": true,
  "data": { ... },
  "meta": {
    "requestId": "req_abc123",
    "timestamp": "2026-11-09T21:00:00Z"
  }
}
```

**Error Response Format:**
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid input data",
    "details": [
      { "field": "email", "message": "Invalid email format" }
    ]
  },
  "meta": {
    "requestId": "req_abc123",
    "timestamp": "2026-11-09T21:00:00Z"
  }
}
```

**Pagination:**
```
GET /api/v1/products?page=1&limit=20&sort=created_at:desc

Response:
{
  "success": true,
  "data": [...],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 150,
    "totalPages": 8,
    "hasNext": true,
    "hasPrev": false
  }
}
```

### 6.2 Rate Limiting

| Endpoint Type | Limit |
|---------------|-------|
| Authentication | 5 req/min per IP |
| General API | 100 req/min per user |
| Search | 30 req/min per user |
| Webhook | 1000 req/min per provider |

---

## 7. DATABASE DESIGN

### 7.1 Entity Relationship Diagram (Simplified)

```
users ──┬── addresses
        ├── orders ─── order_items
        ├── reviews
        ├── wishlists
        ├── notifications
        └── wallets ─── wallet_transactions

products ──┬── product_variants
           │   └──── product_images
           └──── product_reviews

orders ─── payments
       ─── shipments
       ─── order_logs

promos ─── promo_usages

banners
categories
settings
```

### 7.2 Key Tables (Complete Schema in Separate Document)

**Core Tables:**
- users, user_roles, user_sessions
- products, product_variants, product_images, product_attributes
- categories, category_attributes
- carts, cart_items
- orders, order_items, order_logs, order_disputes
- payments, payment_webhooks, refunds
- shipments, shipment_tracking, shipment_rates
- promos, promo_usages, flash_sales
- reviews, review_replies, review_reports
- wallets, wallet_transactions
- notifications, notification_templates
- banners, pages, settings
- admin_logs, audit_trails

---

## 8. INTEGRATION SPECIFICATIONS

### 8.1 Payment Gateway Integration

**Webhook Handling:**
```typescript
// POST /webhooks/payment/:provider

// 1. Verify signature
// 2. Parse payload
// 3. Idempotency check (webhook_id)
// 4. Process event
// 5. Return 200 OK quickly

// Events:
// - payment.success
// - payment.failed
// - payment.expired
// - payment.cancelled
// - refund.completed
```

### 8.2 Tembus Integration

**Webhook Events:**
```typescript
// POST /webhooks/logistics/tembus

// Events:
// - shipment.created
// - shipment.picked_up
// - shipment.in_transit
// - shipment.out_for_delivery
// - shipment.delivered
// - shipment.failed
// - shipment.returned
```

### 8.3 Notification Service Integration

**FCM Push Notification:**
```typescript
interface PushNotificationPayload {
  to: string; // FCM token
  notification: {
    title: string;
    body: string;
    imageUrl?: string;
  };
  data: {
    type: string;
    orderId?: string;
    deepLink?: string;
  };
  android: {
    priority: 'HIGH' | 'NORMAL';
    notification: {
      channelId: string;
      sound: string;
    };
  };
  apns: {
    payload: {
      aps: {
        alert: { title: string; body: string };
        sound: string;
        badge: number;
      };
    };
  };
}
```

---

## 9. SECURITY REQUIREMENTS

### 9.1 Authentication Security

| Requirement | Implementation |
|-------------|----------------|
| Password hashing | Argon2id |
| JWT signing | RS256 (asymmetric) |
| Token expiry | Access: 15min, Refresh: 7days |
| Rate limiting | Per IP + per user |
| Brute force protection | Account lockout after 5 failed attempts |
| Session management | Redis-based, revocable |

### 9.2 Data Security

| Requirement | Implementation |
|-------------|----------------|
| Encryption at rest | AES-256 for sensitive fields |
| Encryption in transit | TLS 1.3 |
| PII masking | In logs and admin views |
| SQL injection prevention | Parameterized queries (ORM) |
| XSS prevention | Input sanitization, CSP headers |
| CSRF protection | Token-based for web |

### 9.3 API Security

| Requirement | Implementation |
|-------------|----------------|
| Input validation | Zod schemas |
| Output sanitization | Remove sensitive fields |
| Rate limiting | Redis-based sliding window |
| IP whitelisting | For admin endpoints |
| Audit logging | All admin actions |

---

## 10. PERFORMANCE REQUIREMENTS

| Metric | Target |
|--------|--------|
| API Response Time (p50) | < 50ms |
| API Response Time (p95) | < 200ms |
| API Response Time (p99) | < 500ms |
| Database Query Time (p95) | < 50ms |
| WebSocket Latency | < 100ms |
| Concurrent Users | 10,000+ |
| Orders per Second | 100+ |
| Uptime | 99.9% |

---

## 11. SCALABILITY CONSIDERATIONS

### 11.1 Horizontal Scaling

```
┌─────────────────────────────────────────┐
│              LOAD BALANCER               │
│         (NGINX / Cloud LB)               │
└─────────────────────────────────────────┘
                    │
    ┌───────────────┼───────────────┐
    ▼               ▼               ▼
┌─────────┐    ┌─────────┐    ┌─────────┐
│ API     │    │ API     │    │ API     │
│ Instance│    │ Instance│    │ Instance│
│    1    │    │    2    │    │    N    │
└────┬────┘    └────┬────┘    └────┬────┘
     │               │               │
     └───────────────┼───────────────┘
                     ▼
         ┌─────────────────────┐
         │   SHARED RESOURCES  │
         │  PostgreSQL (R/W)   │
         │  Redis (Cache)      │
         │  S3 (Files)         │
         │  Queue (BullMQ)     │
         └─────────────────────┘
```

### 11.2 Caching Strategy

| Layer | Technology | TTL | Use Case |
|-------|------------|-----|----------|
| CDN | CloudFlare | Static | Images, assets |
| API Cache | Redis | 5 min | Product lists, categories |
| Session | Redis | 7 days | User sessions |
| Rate Limit | Redis | 1 min | API rate limiting |
| Query Cache | Redis | 1 min | Expensive queries |

---

## 12. MONITORING & OBSERVABILITY

### 12.1 The Four Golden Signals

| Signal | Metric | Alert Threshold |
|--------|--------|-----------------|
| Latency | Response time p95 | > 500ms for 5 min |
| Traffic | Requests per second | Sudden drop > 50% |
| Errors | Error rate | > 1% for 5 min |
| Saturation | CPU/Memory usage | > 80% for 10 min |

### 12.2 Logging

```typescript
// Structured logging format
{
  "timestamp": "2026-11-09T21:00:00Z",
  "level": "info",
  "service": "brand-store-api",
  "version": "1.0.0",
  "requestId": "req_abc123",
  "userId": "user_xyz",
  "method": "POST",
  "path": "/api/v1/orders",
  "statusCode": 201,
  "durationMs": 145,
  "ip": "103.147.8.42"
}
```

### 12.3 Tracing

- Distributed tracing with OpenTelemetry
- Trace ID propagation across services
- Integration with Jaeger/Zipkin

---

## 13. DEPLOYMENT & DEVOPS

### 13.1 Docker Configuration

```dockerfile
# Dockerfile
FROM oven/bun:1.1-alpine AS base
WORKDIR /app

# Install dependencies
FROM base AS deps
COPY package.json bun.lockb ./
RUN bun install --frozen-lockfile

# Build
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN bun run build

# Production
FROM base AS runner
ENV NODE_ENV=production
COPY --from=builder /app/dist ./dist
COPY --from=deps /app/node_modules ./node_modules
EXPOSE 3000
CMD ["bun", "run", "start"]
```

### 13.2 Environment Variables

```env
# Application
NODE_ENV=production
PORT=3000
APP_URL=https://api.example.com

# Database
DATABASE_URL=postgresql://user:pass@host:5432/brand_store

# Redis
REDIS_URL=redis://host:6379

# JWT
JWT_PRIVATE_KEY=...
JWT_PUBLIC_KEY=...
JWT_ACCESS_EXPIRY=15m
JWT_REFRESH_EXPIRY=7d

# Payment - Midtrans
MIDTRANS_SERVER_KEY=...
MIDTRANS_CLIENT_KEY=...
MIDTRANS_IS_PRODUCTION=true

# Payment - Xendit
XENDIT_SECRET_KEY=...
XENDIT_WEBHOOK_TOKEN=...

# Logistics - Tembus
TEMBUS_API_KEY=...
TEMBUS_WEBHOOK_SECRET=...

# Storage
S3_ENDPOINT=...
S3_ACCESS_KEY=...
S3_SECRET_KEY=...
S3_BUCKET=...

# Notification
FCM_SERVER_KEY=...
SMTP_HOST=...
SMTP_PORT=587
SMTP_USER=...
SMTP_PASS=...
```

---

## 14. TESTING STRATEGY

### 14.1 Test Coverage Requirements

| Type | Coverage | Scope |
|------|----------|-------|
| Unit Tests | ≥ 90% | All business logic |
| Integration Tests | ≥ 80% | API endpoints, DB |
| E2E Tests | Critical paths | Checkout, payment, order |

### 14.2 Test Categories

```
tests/
├── unit/           # Business logic, utilities
├── integration/    # API + Database
├── e2e/            # Full user flows
├── contract/       # External API contracts
└── performance/    # Load testing
```

---

## 15. ROLLOUT PLAN

### Phase 1: MVP (Week 1-4)
- ✅ Core commerce (catalog, cart, order)
- ✅ Basic auth (email/password)
- ✅ Midtrans payment integration
- ✅ Tembus logistics integration
- ✅ Basic admin panel
- ✅ Order notifications (email)

### Phase 2: Essential (Week 5-8)
- ✅ Social login
- ✅ Multi-payment gateway
- ✅ Promo & discount engine
- ✅ Real-time notifications (WebSocket)
- ✅ Review & rating system
- ✅ Admin catalog & inventory management

### Phase 3: Advanced (Week 9-12)
- ✅ Flash sale system
- ✅ Loyalty & referral
- ✅ Live chat support
- ✅ Advanced analytics
- ✅ Mobile app API optimization
- ✅ A/B testing framework

### Phase 4: Enterprise (Week 13-16)
- ✅ Multi-warehouse inventory
- ✅ Advanced pricing engine
- ✅ AI recommendations
- ✅ Marketing automation
- ✅ Advanced reporting

---

## 16. APPENDICES

### Appendix A: Glossary

| Term | Definition |
|------|------------|
| AWB | Air Waybill - shipping document number |
| BNPL | Buy Now Pay Later |
| COD | Cash on Delivery |
| KYC | Know Your Customer |
| QRIS | Quick Response Code Indonesian Standard |
| RMA | Return Merchandise Authorization |
| SKU | Stock Keeping Unit |
| VA | Virtual Account |

### Appendix B: Third-Party Services

| Service | Purpose | Cost Estimate |
|---------|---------|---------------|
| Midtrans | Payment gateway | 1.5-2.9% per transaction |
| Xendit | Payment gateway | 1.5-2.9% per transaction |
| Tembus | Logistics | Per shipment |
| FCM | Push notification | Free |
| SendGrid | Email | $15/month |
| Twilio | SMS | $0.05/SMS |
| S3/MinIO | File storage | $5-20/month |
| CloudFlare | CDN | Free-$20/month |

### Appendix C: Compliance

| Regulation | Requirement |
|------------|-------------|
| UU ITE | Electronic transaction compliance |
| UU PDP | Personal data protection |
| PCI DSS | Payment card security (via gateway) |
| GDPR | If serving EU customers |

---

**Document Approval:**

| Role | Name | Date | Signature |
|------|------|------|-----------|
| Product Owner | | | |
| Tech Lead | | | |
| QA Lead | | | |
| Stakeholder | | | |

---

*End of PRD Document*
