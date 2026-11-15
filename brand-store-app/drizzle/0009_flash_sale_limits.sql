-- 0009_flash_sale_limits.sql
-- Flash sale per-user limit (FLS-006) and purchase ledger.
-- Safe to re-run, every statement is idempotent.
--
-- Why a ledger table: the per-user cap needs a record of what each customer already bought
-- from a flash sale line. `flash_sale_items.sold` alone cannot answer "how many did user X
-- take", and re-reading order_items would count ordinary orders that never touched the sale.
-- One row per accepted purchase keeps the answer exact and lets an operator audit it later.

ALTER TABLE "flash_sale_items"
  ADD COLUMN IF NOT EXISTS "per_user_limit" integer;

CREATE TABLE IF NOT EXISTS "flash_sale_purchases" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "flash_sale_item_id" uuid NOT NULL REFERENCES "flash_sale_items"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "order_id" uuid REFERENCES "orders"("id") ON DELETE SET NULL,
  "quantity" integer NOT NULL,
  "created_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "flash_sale_purchases_item_user_idx"
  ON "flash_sale_purchases" ("flash_sale_item_id", "user_id");
CREATE INDEX IF NOT EXISTS "flash_sale_purchases_user_idx"
  ON "flash_sale_purchases" ("user_id");
CREATE INDEX IF NOT EXISTS "flash_sale_purchases_order_idx"
  ON "flash_sale_purchases" ("order_id");
