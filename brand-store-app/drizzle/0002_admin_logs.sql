-- Admin audit trail: one row per privileged admin action
CREATE TABLE IF NOT EXISTS "admin_logs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "actor_id" uuid REFERENCES "users"("id"),
  "action" varchar(100) NOT NULL,
  "target_type" varchar(50),
  "target_id" varchar(100),
  "metadata" jsonb,
  "created_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "admin_logs_actor_idx" ON "admin_logs" ("actor_id");
CREATE INDEX IF NOT EXISTS "admin_logs_action_idx" ON "admin_logs" ("action");
