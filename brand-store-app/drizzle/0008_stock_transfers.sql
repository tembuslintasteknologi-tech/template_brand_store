-- 0008_stock_transfers.sql
-- Stock transfer between branches (BR-014).
-- Safe to re-run, every statement is idempotent.
--
-- Status contract: draft -> in_transit (ship) -> received. A draft may also be cancelled.
-- Approval stamps approved_by but keeps the row in draft, because the checklist only allows
-- four statuses and ship is the moment stock actually leaves the source branch.

CREATE TABLE IF NOT EXISTS "stock_transfers" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "from_branch_id" uuid NOT NULL REFERENCES "store_locations"("id") ON DELETE CASCADE,
  "to_branch_id" uuid NOT NULL REFERENCES "store_locations"("id") ON DELETE CASCADE,
  "variant_id" uuid NOT NULL REFERENCES "product_variants"("id") ON DELETE CASCADE,
  "quantity" integer NOT NULL,
  "status" varchar(20) NOT NULL DEFAULT 'draft',
  "note" text,
  "requested_by" uuid REFERENCES "users"("id"),
  "approved_by" uuid REFERENCES "users"("id"),
  "shipped_at" timestamp,
  "received_at" timestamp,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "stock_transfers_from_idx" ON "stock_transfers" ("from_branch_id");
CREATE INDEX IF NOT EXISTS "stock_transfers_to_idx" ON "stock_transfers" ("to_branch_id");
CREATE INDEX IF NOT EXISTS "stock_transfers_status_idx" ON "stock_transfers" ("status");
CREATE INDEX IF NOT EXISTS "stock_transfers_variant_idx" ON "stock_transfers" ("variant_id");
