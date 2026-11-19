-- CMS-005: banner A/B testing.
-- Variants are alternate creatives for one banner slot. Events gain a variant_id so CTR can be
-- split per variant without touching the existing aggregate views.

CREATE TABLE IF NOT EXISTS banner_variants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  banner_id uuid NOT NULL REFERENCES banners(id) ON DELETE CASCADE,
  name varchar(80) NOT NULL,
  image_url text NOT NULL,
  link_url text,
  weight integer NOT NULL DEFAULT 50,
  is_control boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS banner_variants_banner_idx ON banner_variants (banner_id);

CREATE UNIQUE INDEX IF NOT EXISTS banner_variants_banner_name_uidx
  ON banner_variants (banner_id, name);

CREATE TABLE IF NOT EXISTS banner_experiments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  banner_id uuid NOT NULL UNIQUE REFERENCES banners(id) ON DELETE CASCADE,
  status varchar(20) NOT NULL DEFAULT 'draft',
  min_views integer NOT NULL DEFAULT 100,
  winner_variant_id uuid REFERENCES banner_variants(id) ON DELETE SET NULL,
  started_at timestamp,
  ended_at timestamp,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS banner_experiments_status_idx ON banner_experiments (status);

ALTER TABLE banner_events
  ADD COLUMN IF NOT EXISTS variant_id uuid REFERENCES banner_variants(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS banner_events_variant_idx ON banner_events (variant_id, event_type);
