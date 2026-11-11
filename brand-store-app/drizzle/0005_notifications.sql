-- Notifications (NTF-001, NTF-002, NTF-003, NTF-007)
CREATE TABLE IF NOT EXISTS "notification_templates" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "code" varchar(100) NOT NULL UNIQUE,
  "channel" varchar(20) NOT NULL DEFAULT 'in_app',
  "category" varchar(50) NOT NULL DEFAULT 'order',
  "subject" varchar(200),
  "body" text NOT NULL,
  "deep_link_pattern" varchar(200),
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "notifications" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "template_code" varchar(100),
  "channel" varchar(20) NOT NULL DEFAULT 'in_app',
  "category" varchar(50) NOT NULL DEFAULT 'order',
  "title" varchar(200) NOT NULL,
  "body" text NOT NULL,
  "deep_link" text,
  "data" jsonb,
  "delivery_status" varchar(30) NOT NULL DEFAULT 'delivered',
  "is_read" boolean NOT NULL DEFAULT false,
  "read_at" timestamp,
  "created_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "notifications_user_idx" ON "notifications" ("user_id");
CREATE INDEX IF NOT EXISTS "notifications_unread_idx" ON "notifications" ("is_read");

CREATE TABLE IF NOT EXISTS "notification_preferences" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "category" varchar(50) NOT NULL,
  "in_app" boolean NOT NULL DEFAULT true,
  "email" boolean NOT NULL DEFAULT true,
  "updated_at" timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "notification_prefs_user_category_idx" ON "notification_preferences" ("user_id", "category");
