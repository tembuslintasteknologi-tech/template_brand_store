-- 0015_chat_cart_recovery_2fa.sql
-- Live chat customer ke cabang, kolom recovery untuk carts, dan TOTP admin (AUT-012).
-- Every statement is idempotent so the file can be re-applied on a database that already
-- ran part of it.

-- ---------------------------------------------------------------------------
-- CARTS: abandonment tracking plus a single-use recovery token
-- ---------------------------------------------------------------------------
ALTER TABLE "carts" ADD COLUMN IF NOT EXISTS "status" varchar(20) NOT NULL DEFAULT 'active';
ALTER TABLE "carts" ADD COLUMN IF NOT EXISTS "last_activity_at" timestamp NOT NULL DEFAULT now();
ALTER TABLE "carts" ADD COLUMN IF NOT EXISTS "reminder_sent_at" timestamp;
ALTER TABLE "carts" ADD COLUMN IF NOT EXISTS "reminder_count" integer NOT NULL DEFAULT 0;
ALTER TABLE "carts" ADD COLUMN IF NOT EXISTS "recovery_token" varchar(64);
ALTER TABLE "carts" ADD COLUMN IF NOT EXISTS "recovered_at" timestamp;

CREATE UNIQUE INDEX IF NOT EXISTS "carts_recovery_token_uidx" ON "carts" ("recovery_token");
CREATE INDEX IF NOT EXISTS "carts_recovery_token_idx" ON "carts" ("recovery_token");
CREATE INDEX IF NOT EXISTS "carts_idle_idx" ON "carts" ("status", "last_activity_at", "id");

-- ---------------------------------------------------------------------------
-- LIVE CHAT
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "chat_conversations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "branch_id" uuid REFERENCES "store_locations"("id") ON DELETE SET NULL,
  "product_id" uuid REFERENCES "products"("id") ON DELETE SET NULL,
  "subject" varchar(200),
  "status" varchar(20) NOT NULL DEFAULT 'open',
  "assigned_to" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "routing_reason" varchar(40) NOT NULL DEFAULT 'manual',
  "last_message_at" timestamp NOT NULL DEFAULT now(),
  "closed_at" timestamp,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "chat_conversations_user_idx"
  ON "chat_conversations" ("user_id", "last_message_at");
CREATE INDEX IF NOT EXISTS "chat_conversations_branch_status_idx"
  ON "chat_conversations" ("branch_id", "status", "last_message_at");
CREATE INDEX IF NOT EXISTS "chat_conversations_status_idx"
  ON "chat_conversations" ("status", "last_message_at");

CREATE TABLE IF NOT EXISTS "chat_messages" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "conversation_id" uuid NOT NULL REFERENCES "chat_conversations"("id") ON DELETE CASCADE,
  "sender_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "sender_role" varchar(20) NOT NULL,
  "body" text NOT NULL,
  "read_at" timestamp,
  "created_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "chat_messages_conversation_idx"
  ON "chat_messages" ("conversation_id", "created_at", "id");

-- ---------------------------------------------------------------------------
-- ADMIN TOTP (AUT-012)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "admin_totp" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "secret_encrypted" text NOT NULL,
  "enabled" boolean NOT NULL DEFAULT false,
  "confirmed_at" timestamp,
  "last_used_at" timestamp,
  "recovery_codes" jsonb DEFAULT '[]'::jsonb,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "admin_totp_user_uidx" ON "admin_totp" ("user_id");
