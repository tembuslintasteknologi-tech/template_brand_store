-- 0007_branches.sql
-- Multi-branch foundation: branch master data, branch scoped users, per-branch inventory.
-- Safe to re-run, every statement is idempotent.

-- BRANCH MASTER (BR-001)
ALTER TABLE "store_locations" ADD COLUMN IF NOT EXISTS "code" varchar(20);
ALTER TABLE "store_locations" ADD COLUMN IF NOT EXISTS "type" varchar(20) NOT NULL DEFAULT 'cabang';
ALTER TABLE "store_locations" ADD COLUMN IF NOT EXISTS "latitude" decimal(10, 7);
ALTER TABLE "store_locations" ADD COLUMN IF NOT EXISTS "longitude" decimal(10, 7);
ALTER TABLE "store_locations" ADD COLUMN IF NOT EXISTS "ondemand_enabled" boolean NOT NULL DEFAULT true;
ALTER TABLE "store_locations" ADD COLUMN IF NOT EXISTS "service_radius_km" integer;
ALTER TABLE "store_locations" ADD COLUMN IF NOT EXISTS "operating_hours" jsonb DEFAULT '{}'::jsonb;
ALTER TABLE "store_locations" ADD COLUMN IF NOT EXISTS "manager_name" varchar(150);
ALTER TABLE "store_locations" ADD COLUMN IF NOT EXISTS "is_online" boolean NOT NULL DEFAULT true;

-- Existing default location becomes the pusat branch, every other row stays a cabang.
UPDATE "store_locations" SET "type" = 'pusat' WHERE "is_default" = true AND "type" <> 'pusat';
UPDATE "store_locations" SET "code" = 'PUSAT' WHERE "code" IS NULL AND "is_default" = true;
UPDATE "store_locations"
   SET "code" = 'CBG-' || left(replace("id"::text, '-', ''), 8)
 WHERE "code" IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "store_locations_code_uidx" ON "store_locations" ("code");
CREATE INDEX IF NOT EXISTS "store_locations_type_active_idx" ON "store_locations" ("type", "is_active");

-- BRANCH SCOPED USERS (BR-002)
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "branch_id" uuid REFERENCES "store_locations"("id") ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS "users_branch_idx" ON "users" ("branch_id");

-- BRANCH INVENTORY (BR-003)
CREATE TABLE IF NOT EXISTS "branch_inventory" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "branch_id" uuid NOT NULL REFERENCES "store_locations"("id") ON DELETE CASCADE,
  "variant_id" uuid NOT NULL REFERENCES "product_variants"("id") ON DELETE CASCADE,
  "stock" integer NOT NULL DEFAULT 0,
  "reserved_stock" integer NOT NULL DEFAULT 0,
  "low_stock_threshold" integer NOT NULL DEFAULT 5,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "branch_inventory_branch_variant_uidx" ON "branch_inventory" ("branch_id", "variant_id");
CREATE INDEX IF NOT EXISTS "branch_inventory_variant_idx" ON "branch_inventory" ("variant_id");
CREATE INDEX IF NOT EXISTS "branch_inventory_branch_idx" ON "branch_inventory" ("branch_id");

-- BACKFILL: the existing single stock pool moves to the pusat branch so no number is lost.
-- product_variants.stock stays as a denormalised aggregate, branch_inventory becomes the source.
INSERT INTO "branch_inventory" ("branch_id", "variant_id", "stock", "reserved_stock", "low_stock_threshold")
SELECT p."id", v."id", v."stock", v."reserved_stock", v."low_stock_threshold"
  FROM "product_variants" v
 CROSS JOIN (
   SELECT "id" FROM "store_locations" WHERE "is_default" = true ORDER BY "created_at" LIMIT 1
 ) p
ON CONFLICT ("branch_id", "variant_id") DO NOTHING;

-- BRANCH AWARE INVENTORY LOGS (BR-006)
-- Without this column the branch log endpoint could only guess which branch a movement came
-- from. Existing rows stay NULL, which reads as "pusat before branches existed".
ALTER TABLE "inventory_logs" ADD COLUMN IF NOT EXISTS "branch_id" uuid REFERENCES "store_locations"("id") ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS "inventory_logs_branch_idx" ON "inventory_logs" ("branch_id");
