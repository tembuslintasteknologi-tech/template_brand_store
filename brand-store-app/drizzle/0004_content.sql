-- Content tables: banners and static pages (CMS-001/CMS-002, PGE-001/PGE-002)
CREATE TABLE IF NOT EXISTS "banners" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "title" varchar(150) NOT NULL,
  "image_url" text NOT NULL,
  "link_url" text,
  "placement" varchar(50) NOT NULL DEFAULT 'home_hero',
  "sort_order" integer NOT NULL DEFAULT 0,
  "is_active" boolean NOT NULL DEFAULT true,
  "start_at" timestamp,
  "end_at" timestamp,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "banners_placement_idx" ON "banners" ("placement");
CREATE INDEX IF NOT EXISTS "banners_active_idx" ON "banners" ("is_active");

CREATE TABLE IF NOT EXISTS "pages" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "slug" varchar(150) NOT NULL UNIQUE,
  "title" varchar(200) NOT NULL,
  "content" text NOT NULL,
  "meta_title" varchar(200),
  "meta_description" text,
  "is_published" boolean NOT NULL DEFAULT false,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "pages_slug_idx" ON "pages" ("slug");
