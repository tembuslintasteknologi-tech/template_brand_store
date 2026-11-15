-- 0010_loyalty.sql
-- Loyalty points, tiers, and the points ledger (LTY-001..LTY-004).
-- Safe to re-run, every statement is idempotent.
--
-- Tier is a cached projection of lifetime_points. The rules live in code
-- (src/services/loyalty/loyaltyService.ts) so the thresholds can be changed through the
-- loyalty.program setting without a migration. The column exists for cheap filtering.
--
-- balance and lifetime_points are integers on purpose: points are whole units, and mixing
-- them with the decimal money columns would invite rounding bugs.

CREATE TABLE IF NOT EXISTS "loyalty_accounts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL UNIQUE REFERENCES "users"("id") ON DELETE CASCADE,
  "balance" integer NOT NULL DEFAULT 0,
  "lifetime_points" integer NOT NULL DEFAULT 0,
  "tier" varchar(20) NOT NULL DEFAULT 'bronze',
  "tier_updated_at" timestamp NOT NULL DEFAULT now(),
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "loyalty_accounts_tier_idx"
  ON "loyalty_accounts" ("tier");

CREATE TABLE IF NOT EXISTS "loyalty_transactions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "account_id" uuid NOT NULL REFERENCES "loyalty_accounts"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "type" varchar(20) NOT NULL,
  "source" varchar(20),
  "points" integer NOT NULL,
  "balance_before" integer NOT NULL,
  "balance_after" integer NOT NULL,
  "reference_type" varchar(50),
  "reference_id" varchar(100),
  "note" text,
  "actor_id" uuid REFERENCES "users"("id"),
  "created_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "loyalty_tx_account_idx"
  ON "loyalty_transactions" ("account_id");
CREATE INDEX IF NOT EXISTS "loyalty_tx_user_idx"
  ON "loyalty_transactions" ("user_id");
CREATE INDEX IF NOT EXISTS "loyalty_tx_type_idx"
  ON "loyalty_transactions" ("type");
CREATE INDEX IF NOT EXISTS "loyalty_tx_created_idx"
  ON "loyalty_transactions" ("created_at");

-- One earn per source document, so a retried purchase webhook credits once. NULL reference_id
-- rows (manual adjustment) stay unrestricted because Postgres treats NULLs as distinct.
CREATE UNIQUE INDEX IF NOT EXISTS "loyalty_tx_earn_ref_idx"
  ON "loyalty_transactions" ("user_id", "source", "reference_id");
