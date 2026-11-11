-- 0003: fix schema drift found while wiring Brand Config
-- `drizzle/0000_init.sql` is older than `src/db/schema.ts`, so the public product
-- API failed with: column "low_stock_threshold" does not exist.

ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "low_stock_threshold" integer NOT NULL DEFAULT 5;

ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "expires_at" timestamp;

CREATE TABLE IF NOT EXISTS "product_variants" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "product_id" uuid NOT NULL REFERENCES "products"("id") ON DELETE CASCADE,
  "sku" varchar(100) NOT NULL UNIQUE,
  "name" varchar(255) NOT NULL,
  "price" numeric(12, 2) NOT NULL,
  "stock" integer NOT NULL DEFAULT 0,
  "reserved_stock" integer NOT NULL DEFAULT 0,
  "low_stock_threshold" integer NOT NULL DEFAULT 5,
  "attributes" jsonb DEFAULT '{}'::jsonb,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "variants_product_idx" ON "product_variants" ("product_id");
CREATE INDEX IF NOT EXISTS "variants_sku_idx" ON "product_variants" ("sku");

ALTER TABLE "order_items" ADD COLUMN IF NOT EXISTS "variant_id" uuid REFERENCES "product_variants"("id");

CREATE TABLE IF NOT EXISTS "inventory_logs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "variant_id" uuid NOT NULL REFERENCES "product_variants"("id"),
  "product_id" uuid NOT NULL REFERENCES "products"("id"),
  "change_type" varchar(50) NOT NULL,
  "quantity_change" integer NOT NULL,
  "previous_stock" integer NOT NULL,
  "new_stock" integer NOT NULL,
  "reason" text,
  "reference_id" varchar(100),
  "performed_by" uuid REFERENCES "users"("id"),
  "created_at" timestamp NOT NULL DEFAULT now()
);
