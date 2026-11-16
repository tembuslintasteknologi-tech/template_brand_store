-- 0013_banner_events.sql
-- Banner analytics and audience targeting (CMS-003, CMS-004).
-- Safe to re-run, every statement is idempotent.
--
-- Audience is a coarse segment on the banner itself: 'all' shows everywhere, 'guest' only to
-- signed-out visitors, 'customer' only to signed-in ones. Geography and loyalty tier are not
-- stored here because the PRD has not fixed a rule for them yet.
--
-- banner_events is append-only. CTR is computed from these rows, so there is deliberately no
-- UPDATE path: an admin editing a banner cannot rewrite its history.

ALTER TABLE "banners" ADD COLUMN IF NOT EXISTS "audience" varchar(50) NOT NULL DEFAULT 'all';

CREATE INDEX IF NOT EXISTS "banners_audience_idx" ON "banners" ("audience");

CREATE TABLE IF NOT EXISTS "banner_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "banner_id" uuid NOT NULL REFERENCES "banners" ("id") ON DELETE CASCADE,
  "event_type" varchar(20) NOT NULL,
  "audience" varchar(50) NOT NULL DEFAULT 'guest',
  "session_id" varchar(100),
  "user_id" uuid REFERENCES "users" ("id") ON DELETE SET NULL,
  "created_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "banner_events_lookup_idx"
  ON "banner_events" ("banner_id", "event_type", "created_at");

CREATE INDEX IF NOT EXISTS "banner_events_time_idx" ON "banner_events" ("created_at");
