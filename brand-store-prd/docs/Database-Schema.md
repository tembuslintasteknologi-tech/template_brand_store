# Database Schema
## Brand Store Template Backend

---

**Version:** 1.0.0  
**Database:** PostgreSQL 16+  
**ORM:** Drizzle ORM  
**Last Updated:** 2026-11-09

---

## Table of Contents

1. [Core Tables](#1-core-tables)
2. [Commerce Tables](#2-commerce-tables)
3. [Payment Tables](#3-payment-tables)
4. [Logistics Tables](#4-logistics-tables)
5. [Marketing Tables](#5-marketing-tables)
6. [Notification Tables](#6-notification-tables)
7. [Admin Tables](#7-admin-tables)
8. [Indexes](#8-indexes)
9. [Relationships](#9-relationships)

---

## 1. CORE TABLES

### 1.1 users

```sql
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    phone VARCHAR(20) UNIQUE,
    password_hash VARCHAR(255), -- NULL for social-only accounts
    name VARCHAR(255) NOT NULL,
    avatar_url VARCHAR(500),
    bio TEXT,
    role VARCHAR(20) NOT NULL DEFAULT 'customer' 
        CHECK (role IN ('admin', 'customer')),
    is_verified BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    is_deleted BOOLEAN DEFAULT FALSE,
    loyalty_points INTEGER DEFAULT 0,
    loyalty_tier VARCHAR(20) DEFAULT 'bronze' 
        CHECK (loyalty_tier IN ('bronze', 'silver', 'gold', 'platinum')),
    referral_code VARCHAR(20) UNIQUE,
    referred_by UUID REFERENCES users(id),
    last_login_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_users_email ON users(email) WHERE is_deleted = FALSE;
CREATE INDEX idx_users_phone ON users(phone) WHERE is_deleted = FALSE;
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_referral ON users(referral_code);
```

### 1.2 user_sessions

```sql
CREATE TABLE user_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    refresh_token_hash VARCHAR(255) NOT NULL,
    device_info JSONB, -- {userAgent, ip, platform}
    is_active BOOLEAN DEFAULT TRUE,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_used_at TIMESTAMPTZ
);

CREATE INDEX idx_sessions_user ON user_sessions(user_id);
CREATE INDEX idx_sessions_token ON user_sessions(refresh_token_hash);
CREATE INDEX idx_sessions_expires ON user_sessions(expires_at);
```

### 1.3 user_addresses

```sql
CREATE TABLE user_addresses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    label VARCHAR(50) NOT NULL, -- 'Rumah', 'Kantor', etc
    recipient_name VARCHAR(255) NOT NULL,
    phone VARCHAR(20) NOT NULL,
    address TEXT NOT NULL,
    city VARCHAR(100) NOT NULL,
    province VARCHAR(100) NOT NULL,
    postal_code VARCHAR(10) NOT NULL,
    coordinates POINT, -- PostGIS point
    is_default BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_addresses_user ON user_addresses(user_id);
```

---

## 2. COMMERCE TABLES

### 2.1 categories

```sql
CREATE TABLE categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    parent_id UUID REFERENCES categories(id) ON DELETE SET NULL,
    name JSONB NOT NULL, -- {"id": "Elektronik", "en": "Electronics"}
    slug VARCHAR(255) UNIQUE NOT NULL,
    description TEXT,
    image_url VARCHAR(500),
    sort_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_categories_parent ON categories(parent_id);
CREATE INDEX idx_categories_slug ON categories(slug);
```

### 2.2 products

```sql
CREATE TABLE products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_by UUID REFERENCES users(id), -- admin who manages this product
    category_id UUID NOT NULL REFERENCES categories(id),
    name JSONB NOT NULL,
    slug VARCHAR(255) UNIQUE NOT NULL,
    description JSONB,
    base_price DECIMAL(15,2) NOT NULL,
    compare_at_price DECIMAL(15,2), -- original price for discount display
    cost_price DECIMAL(15,2), -- for margin calculation
    currency CHAR(3) DEFAULT 'IDR',
    status VARCHAR(20) DEFAULT 'draft' 
        CHECK (status IN ('draft', 'active', 'archived', 'out_of_stock', 'suspended')),
    is_featured BOOLEAN DEFAULT FALSE,
    is_digital BOOLEAN DEFAULT FALSE,
    weight_grams INTEGER DEFAULT 0,
    dimensions JSONB, -- {length, width, height} in cm
    attributes JSONB, -- dynamic attributes {brand, model, color, etc}
    tags TEXT[],
    seo_title VARCHAR(255),
    seo_description TEXT,
    rating DECIMAL(3,2) DEFAULT 0.00,
    review_count INTEGER DEFAULT 0,
    sold_count INTEGER DEFAULT 0,
    view_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_products_created_by ON products(created_by);
CREATE INDEX idx_products_category ON products(category_id);
CREATE INDEX idx_products_status ON products(status) WHERE deleted_at IS NULL;
CREATE INDEX idx_products_slug ON products(slug);
CREATE INDEX idx_products_price ON products(base_price);
CREATE INDEX idx_products_created ON products(created_at DESC);
CREATE INDEX idx_products_search ON products USING gin(to_tsvector('simple', 
    coalesce(name->>'id', '') || ' ' || coalesce(description->>'id', '')
));
```

### 2.3 product_variants

```sql
CREATE TABLE product_variants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    sku VARCHAR(100) UNIQUE NOT NULL,
    barcode VARCHAR(50),
    attributes JSONB NOT NULL, -- {size: "XL", color: "Red"}
    price_modifier DECIMAL(15,2) DEFAULT 0, -- +/- from base_price
    stock_quantity INTEGER DEFAULT 0,
    low_stock_threshold INTEGER DEFAULT 5,
    image_url VARCHAR(500),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_variants_product ON product_variants(product_id);
CREATE INDEX idx_variants_sku ON product_variants(sku);
CREATE INDEX idx_variants_stock ON product_variants(stock_quantity) WHERE is_active = TRUE;
```

### 2.4 product_images

```sql
CREATE TABLE product_images (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    variant_id UUID REFERENCES product_variants(id) ON DELETE CASCADE,
    url VARCHAR(500) NOT NULL,
    alt_text VARCHAR(255),
    sort_order INTEGER DEFAULT 0,
    is_primary BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_images_product ON product_images(product_id);
CREATE INDEX idx_images_variant ON product_images(variant_id);
```

### 2.5 carts & cart_items

```sql
CREATE TABLE carts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    session_id VARCHAR(255), -- for guest carts
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'converted', 'abandoned')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    CONSTRAINT carts_user_or_session CHECK (
        (user_id IS NOT NULL AND session_id IS NULL) OR 
        (user_id IS NULL AND session_id IS NOT NULL)
    )
);

CREATE INDEX idx_carts_user ON carts(user_id);
CREATE INDEX idx_carts_session ON carts(session_id);

CREATE TABLE cart_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cart_id UUID NOT NULL REFERENCES carts(id) ON DELETE CASCADE,
    variant_id UUID NOT NULL REFERENCES product_variants(id),
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    added_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(cart_id, variant_id)
);

CREATE INDEX idx_cart_items_cart ON cart_items(cart_id);
CREATE INDEX idx_cart_items_variant ON cart_items(variant_id);
```

### 2.6 orders

```sql
CREATE TABLE orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_number VARCHAR(50) UNIQUE NOT NULL, -- INV/2026/11/000001
    customer_id UUID NOT NULL REFERENCES users(id),
    status VARCHAR(30) DEFAULT 'created' 
        CHECK (status IN (
            'created', 'pending_payment', 'paid', 'processing', 
            'shipped', 'delivered', 'completed', 
            'cancelled', 'refunded', 'expired', 'failed'
        )),
    subtotal DECIMAL(15,2) NOT NULL,
    discount_total DECIMAL(15,2) DEFAULT 0,
    shipping_total DECIMAL(15,2) DEFAULT 0,
    tax_total DECIMAL(15,2) DEFAULT 0,
    grand_total DECIMAL(15,2) NOT NULL,
    currency CHAR(3) DEFAULT 'IDR',

    -- Shipping info (snapshot)
    shipping_recipient VARCHAR(255) NOT NULL,
    shipping_phone VARCHAR(20) NOT NULL,
    shipping_address TEXT NOT NULL,
    shipping_city VARCHAR(100) NOT NULL,
    shipping_province VARCHAR(100) NOT NULL,
    shipping_postal_code VARCHAR(10) NOT NULL,

    -- Pricing breakdown
    pricing_breakdown JSONB, -- detailed calculation for transparency

    -- Metadata
    customer_notes TEXT,
    admin_notes TEXT,
    ip_address INET,
    user_agent TEXT,

    -- Timestamps
    paid_at TIMESTAMPTZ,
    shipped_at TIMESTAMPTZ,
    delivered_at TIMESTAMPTZ,
    cancelled_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_orders_customer ON orders(customer_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_number ON orders(order_number);
CREATE INDEX idx_orders_created ON orders(created_at DESC);
CREATE INDEX idx_orders_paid ON orders(paid_at);
```

### 2.7 order_items

```sql
CREATE TABLE order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id),
    variant_id UUID NOT NULL REFERENCES product_variants(id),

    -- Product snapshot
    product_name VARCHAR(255) NOT NULL,
    product_image VARCHAR(500),
    variant_attributes JSONB,
    sku VARCHAR(100),

    quantity INTEGER NOT NULL,
    unit_price DECIMAL(15,2) NOT NULL,
    subtotal DECIMAL(15,2) NOT NULL,

    -- Status per item (for partial operations)
    status VARCHAR(20) DEFAULT 'active' 
        CHECK (status IN ('active', 'cancelled', 'refunded', 'returned')),

    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_order_items_order ON order_items(order_id);
CREATE INDEX idx_order_items_product ON order_items(product_id);
```

### 2.8 order_logs

```sql
CREATE TABLE order_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    action VARCHAR(50) NOT NULL, -- 'created', 'paid', 'shipped', etc
    from_status VARCHAR(30),
    to_status VARCHAR(30),
    actor_id UUID REFERENCES users(id),
    actor_type VARCHAR(20) CHECK (actor_type IN ('customer', 'admin', 'system')),
    notes TEXT,
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_order_logs_order ON order_logs(order_id);
CREATE INDEX idx_order_logs_created ON order_logs(created_at DESC);
```

### 2.9 reviews

```sql
CREATE TABLE reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    order_item_id UUID REFERENCES order_items(id),
    reviewer_id UUID NOT NULL REFERENCES users(id),
    rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
    title VARCHAR(255),
    comment TEXT,
    images JSONB, -- array of image URLs
    is_verified_purchase BOOLEAN DEFAULT FALSE,
    helpful_count INTEGER DEFAULT 0,
    status VARCHAR(20) DEFAULT 'published' 
        CHECK (status IN ('published', 'hidden', 'deleted', 'pending')),
    admin_reply TEXT,
    admin_replied_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(order_item_id) -- one review per order item
);

CREATE INDEX idx_reviews_product ON reviews(product_id);
CREATE INDEX idx_reviews_reviewer ON reviews(reviewer_id);
CREATE INDEX idx_reviews_rating ON reviews(rating);
CREATE INDEX idx_reviews_created ON reviews(created_at DESC);
```

---

## 3. PAYMENT TABLES

### 3.1 payments

```sql
CREATE TABLE payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES orders(id),
    provider VARCHAR(50) NOT NULL, -- 'midtrans', 'xendit', 'stripe', 'manual'
    method VARCHAR(50) NOT NULL, -- 'qris', 'virtual_account', 'e_wallet', 'credit_card', etc
    provider_transaction_id VARCHAR(255),
    amount DECIMAL(15,2) NOT NULL,
    fee DECIMAL(15,2) DEFAULT 0,
    currency CHAR(3) DEFAULT 'IDR',
    status VARCHAR(30) DEFAULT 'pending' 
        CHECK (status IN ('pending', 'paid', 'failed', 'expired', 'cancelled', 'refunded')),
    payment_data JSONB, -- provider-specific data (QR code URL, VA number, etc)
    paid_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_payments_order ON payments(order_id);
CREATE INDEX idx_payments_provider_txn ON payments(provider_transaction_id);
CREATE INDEX idx_payments_status ON payments(status);
```

### 3.2 payment_webhooks

```sql
CREATE TABLE payment_webhooks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider VARCHAR(50) NOT NULL,
    webhook_id VARCHAR(255) NOT NULL, -- for idempotency
    payload JSONB NOT NULL,
    headers JSONB,
    processed BOOLEAN DEFAULT FALSE,
    processed_at TIMESTAMPTZ,
    error TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(provider, webhook_id)
);

CREATE INDEX idx_webhooks_provider ON payment_webhooks(provider, webhook_id);
CREATE INDEX idx_webhooks_processed ON payment_webhooks(processed);
```

### 3.3 refunds

```sql
CREATE TABLE refunds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    payment_id UUID NOT NULL REFERENCES payments(id),
    order_item_id UUID REFERENCES order_items(id), -- NULL for full refund
    amount DECIMAL(15,2) NOT NULL,
    reason TEXT,
    status VARCHAR(20) DEFAULT 'pending' 
        CHECK (status IN ('pending', 'approved', 'rejected', 'processed', 'failed')),
    requested_by UUID REFERENCES users(id),
    approved_by UUID REFERENCES users(id),
    provider_refund_id VARCHAR(255),
    processed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_refunds_payment ON refunds(payment_id);
CREATE INDEX idx_refunds_status ON refunds(status);
```

### 3.4 wallets

```sql
CREATE TABLE wallets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE REFERENCES users(id),
    balance DECIMAL(15,2) DEFAULT 0.00,
    currency CHAR(3) DEFAULT 'IDR',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_wallets_user ON wallets(user_id);

CREATE TABLE wallet_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    wallet_id UUID NOT NULL REFERENCES wallets(id),
    type VARCHAR(20) NOT NULL CHECK (type IN ('credit', 'debit')),
    amount DECIMAL(15,2) NOT NULL,
    balance_after DECIMAL(15,2) NOT NULL,
    reference_type VARCHAR(50), -- 'order', 'refund', 'topup', 'withdrawal'
    reference_id UUID,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_wallet_txn_wallet ON wallet_transactions(wallet_id);
CREATE INDEX idx_wallet_txn_reference ON wallet_transactions(reference_type, reference_id);
```

---

## 4. LOGISTICS TABLES

### 4.1 shipments

```sql
CREATE TABLE shipments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES orders(id),
    order_item_id UUID REFERENCES order_items(id), -- NULL for multi-item shipment
    provider VARCHAR(50) NOT NULL, -- 'tembus', 'jne', etc
    service VARCHAR(50) NOT NULL, -- 'REG', 'EXP', 'SAME_DAY'
    awb VARCHAR(100) UNIQUE,
    status VARCHAR(30) DEFAULT 'created' 
        CHECK (status IN (
            'created', 'pending_pickup', 'picked_up', 'in_transit', 
            'out_for_delivery', 'delivered', 'failed', 'returned', 'cancelled'
        )),
    origin JSONB NOT NULL, -- {address, city, province, postalCode}
    destination JSONB NOT NULL,
    weight_grams INTEGER NOT NULL,
    dimensions JSONB,
    cost DECIMAL(15,2) NOT NULL,
    insurance_amount DECIMAL(15,2),
    cod_amount DECIMAL(15,2), -- for COD shipments
    label_url VARCHAR(500),
    pickup_scheduled_at TIMESTAMPTZ,
    delivered_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_shipments_order ON shipments(order_id);
CREATE INDEX idx_shipments_awb ON shipments(awb);
CREATE INDEX idx_shipments_status ON shipments(status);
```

### 4.2 shipment_tracking

```sql
CREATE TABLE shipment_tracking (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shipment_id UUID NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
    status VARCHAR(30) NOT NULL,
    location VARCHAR(255),
    description TEXT,
    raw_data JSONB, -- provider-specific data
    tracked_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_tracking_shipment ON shipment_tracking(shipment_id);
CREATE INDEX idx_tracking_time ON shipment_tracking(tracked_at DESC);
```

---

## 5. MARKETING TABLES

### 5.1 promos

```sql
CREATE TABLE promos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    type VARCHAR(30) NOT NULL 
        CHECK (type IN ('percentage', 'fixed_amount', 'free_shipping', 'buy_x_get_y')),
    value DECIMAL(15,2) NOT NULL, -- percentage or amount
    max_discount DECIMAL(15,2), -- cap for percentage discounts
    min_purchase DECIMAL(15,2) DEFAULT 0,

    -- Usage limits
    usage_limit INTEGER, -- total usage limit
    per_user_limit INTEGER DEFAULT 1,
    used_count INTEGER DEFAULT 0,

    -- Applicability
    applicable_to VARCHAR(20) DEFAULT 'all' 
        CHECK (applicable_to IN ('all', 'products', 'categories')),
    applicable_ids UUID[], -- product/category IDs

    -- Targeting
    user_segments JSONB, -- {newUser: true, loyaltyTier: ['gold']}

    -- Validity
    start_date TIMESTAMPTZ NOT NULL,
    end_date TIMESTAMPTZ NOT NULL,

    -- Status
    status VARCHAR(20) DEFAULT 'active' 
        CHECK (status IN ('active', 'paused', 'expired', 'disabled')),
    is_stackable BOOLEAN DEFAULT FALSE,

    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_promos_code ON promos(code);
CREATE INDEX idx_promos_status ON promos(status);
CREATE INDEX idx_promos_dates ON promos(start_date, end_date);
```

### 5.2 promo_usages

```sql
CREATE TABLE promo_usages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    promo_id UUID NOT NULL REFERENCES promos(id),
    user_id UUID NOT NULL REFERENCES users(id),
    order_id UUID NOT NULL REFERENCES orders(id),
    discount_amount DECIMAL(15,2) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(promo_id, order_id)
);

CREATE INDEX idx_promo_usages_promo ON promo_usages(promo_id);
CREATE INDEX idx_promo_usages_user ON promo_usages(user_id);
```

### 5.3 flash_sales

```sql
CREATE TABLE flash_sales (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(255) NOT NULL,
    description TEXT,
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ NOT NULL,
    status VARCHAR(20) DEFAULT 'scheduled' 
        CHECK (status IN ('scheduled', 'active', 'ended', 'cancelled')),
    banner_image VARCHAR(500),
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_flash_sales_status ON flash_sales(status);
CREATE INDEX idx_flash_sales_time ON flash_sales(start_time, end_time);

CREATE TABLE flash_sale_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    flash_sale_id UUID NOT NULL REFERENCES flash_sales(id) ON DELETE CASCADE,
    variant_id UUID NOT NULL REFERENCES product_variants(id),
    flash_price DECIMAL(15,2) NOT NULL,
    stock_limit INTEGER NOT NULL,
    sold_count INTEGER DEFAULT 0,
    per_user_limit INTEGER DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(flash_sale_id, variant_id)
);

CREATE INDEX idx_flash_items_sale ON flash_sale_items(flash_sale_id);
```

### 5.4 banners

```sql
CREATE TABLE banners (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(255) NOT NULL,
    subtitle VARCHAR(255),
    image_url VARCHAR(500) NOT NULL,
    link_url VARCHAR(500),
    position VARCHAR(50) NOT NULL DEFAULT 'hero' 
        CHECK (position IN ('hero', 'sidebar', 'popup', 'footer')),
    target_audience JSONB, -- {userType: 'new', segments: []}
    page_target VARCHAR(100), -- 'home', 'category:electronics', etc
    start_date TIMESTAMPTZ,
    end_date TIMESTAMPTZ,
    sort_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    click_count INTEGER DEFAULT 0,
    view_count INTEGER DEFAULT 0,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_banners_position ON banners(position, is_active);
CREATE INDEX idx_banners_dates ON banners(start_date, end_date);
```

### 5.5 referrals

```sql
CREATE TABLE referrals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    referrer_id UUID NOT NULL REFERENCES users(id),
    referee_id UUID NOT NULL REFERENCES users(id),
    code VARCHAR(20) NOT NULL,
    reward_type VARCHAR(50), -- 'discount', 'points', 'cashback'
    reward_value DECIMAL(15,2),
    reward_status VARCHAR(20) DEFAULT 'pending' 
        CHECK (reward_status IN ('pending', 'granted', 'expired')),
    granted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(referee_id) -- one referral per user
);

CREATE INDEX idx_referrals_referrer ON referrals(referrer_id);
```

---

## 6. NOTIFICATION TABLES

### 6.1 notification_templates

```sql
CREATE TABLE notification_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(100) UNIQUE NOT NULL, -- 'order_created', 'payment_success'
    name VARCHAR(255) NOT NULL,
    channel VARCHAR(20) NOT NULL CHECK (channel IN ('push', 'email', 'sms', 'in_app')),
    title_template VARCHAR(255) NOT NULL,
    body_template TEXT NOT NULL,
    data_template JSONB,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 6.2 notifications

```sql
CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    template_code VARCHAR(100),
    type VARCHAR(50) NOT NULL, -- 'order', 'promo', 'system', etc
    title VARCHAR(255) NOT NULL,
    body TEXT NOT NULL,
    data JSONB, -- {orderId, deepLink, etc}
    channel VARCHAR(20) NOT NULL DEFAULT 'in_app',
    is_read BOOLEAN DEFAULT FALSE,
    read_at TIMESTAMPTZ,
    sent_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_notifications_user ON notifications(user_id, created_at DESC);
CREATE INDEX idx_notifications_unread ON notifications(user_id, is_read) WHERE is_read = FALSE;
```

### 6.3 notification_preferences

```sql
CREATE TABLE notification_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    preferences JSONB NOT NULL DEFAULT '{
        "push": {"orderUpdates": true, "promotions": false, "chat": true},
        "email": {"orderUpdates": true, "promotions": false, "newsletter": true},
        "sms": {"orderUpdates": true, "promotions": false}
    }',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 7. ADMIN TABLES

### 7.1 admin_logs

```sql
CREATE TABLE admin_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_id UUID NOT NULL REFERENCES users(id),
    action VARCHAR(100) NOT NULL, -- 'user_suspend', 'promo_create', etc
    target_type VARCHAR(50), -- 'user', 'product', 'order', etc
    target_id UUID,
    old_values JSONB,
    new_values JSONB,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_admin_logs_admin ON admin_logs(admin_id);
CREATE INDEX idx_admin_logs_target ON admin_logs(target_type, target_id);
CREATE INDEX idx_admin_logs_created ON admin_logs(created_at DESC);
```

### 7.2 settings

```sql
CREATE TABLE settings (
    key VARCHAR(100) PRIMARY KEY,
    value JSONB NOT NULL,
    description TEXT,
    is_public BOOLEAN DEFAULT FALSE,
    updated_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Example seed data
INSERT INTO settings (key, value, is_public) VALUES
('site_name', '"My Brand Store"', TRUE),
('site_logo', '"https://cdn.example.com/logo.png"', TRUE),
('default_currency', '"IDR"', TRUE),
('maintenance_mode', 'false', FALSE),
('feature_flags', '{"flashSale": true, "referral": false, "liveChat": true}', FALSE);
```

### 7.3 pages

```sql
CREATE TABLE pages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug VARCHAR(255) UNIQUE NOT NULL,
    title VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    seo_title VARCHAR(255),
    seo_description TEXT,
    is_published BOOLEAN DEFAULT FALSE,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_pages_slug ON pages(slug);
CREATE INDEX idx_pages_published ON pages(is_published);
```

---

## 8. INDEXES SUMMARY

| Table | Index | Type | Purpose |
|-------|-------|------|---------|
| users | email | B-tree | Login lookup |
| users | phone | B-tree | OTP lookup |
| products | search | GIN | Full-text search |
| products | status | B-tree | Product filtering by status |
| orders | customer+created | B-tree | Order history |
| orders | status | B-tree | Order filtering |
| payments | provider_txn | B-tree | Webhook lookup |
| shipments | awb | B-tree | Tracking lookup |
| reviews | product+created | B-tree | Product reviews |
| notifications | user+unread | Partial | Unread count |

---

## 9. RELATIONSHIPS DIAGRAM

```
users (1) ─── (N) user_sessions
users (1) ─── (N) user_addresses
users (1) ─── (N) orders
users (1) ─── (1) wallets
users (1) ─── (N) notifications
users (1) ─── (N) carts

categories (1) ─── (N) categories (self-ref)
categories (1) ─── (N) products

products (1) ─── (N) product_variants
products (1) ─── (N) product_images
products (1) ─── (N) reviews

carts (1) ─── (N) cart_items
product_variants (1) ─── (N) cart_items

orders (1) ─── (N) order_items
orders (1) ─── (N) payments
orders (1) ─── (N) shipments
orders (1) ─── (N) order_logs

payments (1) ─── (N) refunds
shipments (1) ─── (N) shipment_tracking

promos (1) ─── (N) promo_usages
flash_sales (1) ─── (N) flash_sale_items
```

---

*End of Database Schema Document*
