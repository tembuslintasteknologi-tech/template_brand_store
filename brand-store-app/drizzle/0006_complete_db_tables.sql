-- 0006_complete_db_tables.sql
-- Adds all remaining tables for the brand-store marketplace.

-- USER SESSIONS
CREATE TABLE IF NOT EXISTS "user_sessions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "refresh_token" text NOT NULL UNIQUE,
  "device_info" jsonb,
  "ip_address" varchar(50),
  "expires_at" timestamp NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "revoked_at" timestamp
);
CREATE INDEX IF NOT EXISTS "user_sessions_user_idx" ON "user_sessions" ("user_id");
CREATE INDEX IF NOT EXISTS "user_sessions_expires_idx" ON "user_sessions" ("expires_at");

-- USER ADDRESSES
CREATE TABLE IF NOT EXISTS "user_addresses" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "label" varchar(100) NOT NULL DEFAULT 'home',
  "recipient_name" varchar(150) NOT NULL,
  "phone" varchar(50) NOT NULL,
  "province" varchar(100) NOT NULL,
  "city" varchar(100) NOT NULL,
  "district" varchar(100) NOT NULL,
  "postal_code" varchar(10) NOT NULL,
  "address_line" text NOT NULL,
  "is_default" boolean NOT NULL DEFAULT false,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "user_addresses_user_idx" ON "user_addresses" ("user_id");

-- PRODUCT IMAGES
CREATE TABLE IF NOT EXISTS "product_images" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "product_id" uuid NOT NULL REFERENCES "products"("id") ON DELETE CASCADE,
  "url" text NOT NULL,
  "alt_text" varchar(200),
  "sort_order" integer NOT NULL DEFAULT 0,
  "is_primary" boolean NOT NULL DEFAULT false,
  "created_at" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "product_images_product_idx" ON "product_images" ("product_id");

-- CARTS
CREATE TABLE IF NOT EXISTS "carts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL UNIQUE REFERENCES "users"("id") ON DELETE CASCADE,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "carts_user_idx" ON "carts" ("user_id");

-- CART ITEMS
CREATE TABLE IF NOT EXISTS "cart_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "cart_id" uuid NOT NULL REFERENCES "carts"("id") ON DELETE CASCADE,
  "product_id" uuid NOT NULL REFERENCES "products"("id") ON DELETE CASCADE,
  "variant_id" uuid REFERENCES "product_variants"("id") ON DELETE SET NULL,
  "quantity" integer NOT NULL DEFAULT 1,
  "added_at" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "cart_items_cart_idx" ON "cart_items" ("cart_id");
CREATE UNIQUE INDEX IF NOT EXISTS "cart_items_cart_product_variant_idx" ON "cart_items" ("cart_id", "product_id");

-- ORDER LOGS
CREATE TABLE IF NOT EXISTS "order_logs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "order_id" uuid NOT NULL REFERENCES "orders"("id") ON DELETE CASCADE,
  "actor_id" uuid REFERENCES "users"("id"),
  "from_status" varchar(50),
  "to_status" varchar(50) NOT NULL,
  "note" text,
  "metadata" jsonb,
  "created_at" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "order_logs_order_idx" ON "order_logs" ("order_id");

-- PAYMENTS
CREATE TABLE IF NOT EXISTS "payments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "order_id" uuid NOT NULL REFERENCES "orders"("id") ON DELETE CASCADE,
  "gateway" varchar(50) NOT NULL,
  "gateway_tx_id" varchar(150) UNIQUE,
  "method" varchar(50),
  "amount" decimal(12, 2) NOT NULL,
  "status" varchar(30) NOT NULL DEFAULT 'pending',
  "paid_at" timestamp,
  "expired_at" timestamp,
  "snap_token" text,
  "payment_url" text,
  "raw_response" jsonb,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "payments_order_idx" ON "payments" ("order_id");
CREATE INDEX IF NOT EXISTS "payments_gateway_tx_idx" ON "payments" ("gateway_tx_id");
CREATE INDEX IF NOT EXISTS "payments_status_idx" ON "payments" ("status");

-- PAYMENT WEBHOOKS
CREATE TABLE IF NOT EXISTS "payment_webhooks" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "gateway" varchar(50) NOT NULL,
  "event_type" varchar(100),
  "payload" jsonb NOT NULL,
  "signature" varchar(255),
  "processed" boolean NOT NULL DEFAULT false,
  "processed_at" timestamp,
  "error" text,
  "received_at" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "payment_webhooks_processed_idx" ON "payment_webhooks" ("processed");
CREATE INDEX IF NOT EXISTS "payment_webhooks_gateway_idx" ON "payment_webhooks" ("gateway");

-- REFUNDS
CREATE TABLE IF NOT EXISTS "refunds" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "order_id" uuid NOT NULL REFERENCES "orders"("id") ON DELETE CASCADE,
  "payment_id" uuid NOT NULL REFERENCES "payments"("id"),
  "amount" decimal(12, 2) NOT NULL,
  "reason" text NOT NULL,
  "status" varchar(30) NOT NULL DEFAULT 'pending',
  "gateway_refund_id" varchar(150),
  "processed_at" timestamp,
  "processed_by" uuid REFERENCES "users"("id"),
  "note" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "refunds_order_idx" ON "refunds" ("order_id");
CREATE INDEX IF NOT EXISTS "refunds_status_idx" ON "refunds" ("status");

-- SHIPMENT TRACKING
CREATE TABLE IF NOT EXISTS "shipment_tracking" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "shipment_id" uuid NOT NULL REFERENCES "shipments"("id") ON DELETE CASCADE,
  "status" varchar(100) NOT NULL,
  "description" text,
  "location" varchar(200),
  "timestamp" timestamp NOT NULL,
  "raw_event" jsonb,
  "created_at" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "shipment_tracking_shipment_idx" ON "shipment_tracking" ("shipment_id");
CREATE INDEX IF NOT EXISTS "shipment_tracking_ts_idx" ON "shipment_tracking" ("timestamp");

-- PROMOS
CREATE TABLE IF NOT EXISTS "promos" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "code" varchar(50) NOT NULL UNIQUE,
  "discount_type" varchar(20) NOT NULL,
  "discount_value" decimal(12, 2) NOT NULL,
  "min_order_amount" decimal(12, 2) DEFAULT '0',
  "max_discount" decimal(12, 2),
  "usage_limit" integer,
  "usage_count" integer NOT NULL DEFAULT 0,
  "start_date" timestamp NOT NULL,
  "end_date" timestamp NOT NULL,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "promos_code_idx" ON "promos" ("code");
CREATE INDEX IF NOT EXISTS "promos_active_idx" ON "promos" ("is_active");

-- PROMO USAGES
CREATE TABLE IF NOT EXISTS "promo_usages" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "promo_id" uuid NOT NULL REFERENCES "promos"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "users"("id"),
  "order_id" uuid NOT NULL REFERENCES "orders"("id") ON DELETE CASCADE,
  "discount_amount" decimal(12, 2) NOT NULL,
  "used_at" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "promo_usages_promo_idx" ON "promo_usages" ("promo_id");
CREATE INDEX IF NOT EXISTS "promo_usages_user_idx" ON "promo_usages" ("user_id");

-- FLASH SALES
CREATE TABLE IF NOT EXISTS "flash_sales" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "title" varchar(150) NOT NULL,
  "start_at" timestamp NOT NULL,
  "end_at" timestamp NOT NULL,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "flash_sales_active_idx" ON "flash_sales" ("is_active");
CREATE INDEX IF NOT EXISTS "flash_sales_start_idx" ON "flash_sales" ("start_at");

-- FLASH SALE ITEMS
CREATE TABLE IF NOT EXISTS "flash_sale_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "flash_sale_id" uuid NOT NULL REFERENCES "flash_sales"("id") ON DELETE CASCADE,
  "product_id" uuid NOT NULL REFERENCES "products"("id") ON DELETE CASCADE,
  "variant_id" uuid REFERENCES "product_variants"("id") ON DELETE CASCADE,
  "discount_type" varchar(20) NOT NULL DEFAULT 'percentage',
  "discount_value" decimal(12, 2) NOT NULL,
  "stock" integer NOT NULL,
  "sold" integer NOT NULL DEFAULT 0,
  "created_at" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "flash_sale_items_sale_idx" ON "flash_sale_items" ("flash_sale_id");
CREATE INDEX IF NOT EXISTS "flash_sale_items_product_idx" ON "flash_sale_items" ("product_id");

-- REVIEWS
CREATE TABLE IF NOT EXISTS "reviews" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "product_id" uuid NOT NULL REFERENCES "products"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "order_id" uuid REFERENCES "orders"("id"),
  "rating" integer NOT NULL,
  "comment" text,
  "image_urls" jsonb,
  "is_verified_purchase" boolean NOT NULL DEFAULT false,
  "admin_reply" text,
  "admin_replied_at" timestamp,
  "admin_reply_by" uuid REFERENCES "users"("id"),
  "is_visible" boolean NOT NULL DEFAULT true,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "reviews_product_idx" ON "reviews" ("product_id");
CREATE INDEX IF NOT EXISTS "reviews_user_idx" ON "reviews" ("user_id");
CREATE INDEX IF NOT EXISTS "reviews_rating_idx" ON "reviews" ("rating");

-- WALLETS
CREATE TABLE IF NOT EXISTS "wallets" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL UNIQUE REFERENCES "users"("id") ON DELETE CASCADE,
  "balance" decimal(12, 2) NOT NULL DEFAULT '0',
  "currency" varchar(10) NOT NULL DEFAULT 'IDR',
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "wallets_user_idx" ON "wallets" ("user_id");

-- WALLET TRANSACTIONS
CREATE TABLE IF NOT EXISTS "wallet_transactions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "wallet_id" uuid NOT NULL REFERENCES "wallets"("id") ON DELETE CASCADE,
  "type" varchar(30) NOT NULL,
  "amount" decimal(12, 2) NOT NULL,
  "balance_before" decimal(12, 2) NOT NULL,
  "balance_after" decimal(12, 2) NOT NULL,
  "reference_type" varchar(50),
  "reference_id" uuid,
  "note" text,
  "created_at" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "wallet_tx_wallet_idx" ON "wallet_transactions" ("wallet_id");
CREATE INDEX IF NOT EXISTS "wallet_tx_type_idx" ON "wallet_transactions" ("type");
CREATE INDEX IF NOT EXISTS "wallet_tx_created_idx" ON "wallet_transactions" ("created_at");

-- WISHLISTS
CREATE TABLE IF NOT EXISTS "wishlists" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "product_id" uuid NOT NULL REFERENCES "products"("id") ON DELETE CASCADE,
  "created_at" timestamp DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "wishlists_user_product_idx" ON "wishlists" ("user_id", "product_id");
CREATE INDEX IF NOT EXISTS "wishlists_user_idx" ON "wishlists" ("user_id");

-- ORDER DISPUTES
CREATE TABLE IF NOT EXISTS "order_disputes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "order_id" uuid NOT NULL REFERENCES "orders"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "users"("id"),
  "reason" varchar(100) NOT NULL,
  "description" text NOT NULL,
  "evidence" jsonb,
  "status" varchar(30) NOT NULL DEFAULT 'open',
  "resolved_at" timestamp,
  "resolved_by" uuid REFERENCES "users"("id"),
  "resolution" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "order_disputes_order_idx" ON "order_disputes" ("order_id");
CREATE INDEX IF NOT EXISTS "order_disputes_status_idx" ON "order_disputes" ("status");

-- REVIEW REPORTS
CREATE TABLE IF NOT EXISTS "review_reports" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "review_id" uuid NOT NULL REFERENCES "reviews"("id") ON DELETE CASCADE,
  "reported_by" uuid NOT NULL REFERENCES "users"("id"),
  "reason" varchar(100) NOT NULL,
  "description" text,
  "status" varchar(30) NOT NULL DEFAULT 'pending',
  "resolved_at" timestamp,
  "resolved_by" uuid REFERENCES "users"("id"),
  "created_at" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "review_reports_review_idx" ON "review_reports" ("review_id");
CREATE INDEX IF NOT EXISTS "review_reports_status_idx" ON "review_reports" ("status");
