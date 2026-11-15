-- 0011_referral.sql
-- Referral codes, referral tracking, and reward snapshots (RFR-001..RFR-005).
-- Safe to re-run, every statement is idempotent.
--
-- Points are not stored here. A rewarded referral writes two rows into loyalty_transactions
-- with reference ids "<referralId>:referrer" and "<referralId>:referee", so the existing
-- earn dedupe index makes a repeated reward impossible. The referral row stays the source of
-- truth for "who invited whom" and for the reward amount promised at claim time.

CREATE TABLE IF NOT EXISTS "referral_codes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL UNIQUE REFERENCES "users"("id") ON DELETE CASCADE,
  "code" varchar(16) NOT NULL UNIQUE,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "referral_codes_user_idx"
  ON "referral_codes" ("user_id");
CREATE UNIQUE INDEX IF NOT EXISTS "referral_codes_code_idx"
  ON "referral_codes" ("code");

CREATE TABLE IF NOT EXISTS "referrals" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "referrer_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "referee_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "code" varchar(16) NOT NULL,
  "status" varchar(20) NOT NULL DEFAULT 'pending',
  "referrer_points" integer NOT NULL DEFAULT 0,
  "referee_points" integer NOT NULL DEFAULT 0,
  "qualifying_order_id" uuid REFERENCES "orders"("id"),
  "note" text,
  "qualified_at" timestamp,
  "rewarded_at" timestamp,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "referrals_referrer_idx"
  ON "referrals" ("referrer_id");
-- A customer can only ever be referred once, in any status.
CREATE UNIQUE INDEX IF NOT EXISTS "referrals_referee_idx"
  ON "referrals" ("referee_id");
CREATE INDEX IF NOT EXISTS "referrals_status_idx"
  ON "referrals" ("status");
CREATE INDEX IF NOT EXISTS "referrals_code_idx"
  ON "referrals" ("code");
CREATE INDEX IF NOT EXISTS "referrals_created_idx"
  ON "referrals" ("created_at");
