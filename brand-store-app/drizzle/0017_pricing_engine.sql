-- PRC-002, PRC-003, PRC-004: dynamic pricing, tiered wholesale brackets, customer groups.
-- Satu baris per aturan. Diskon tidak pernah ditumpuk; engine memilih satu pemenang per baris.

CREATE TABLE IF NOT EXISTS pricing_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(150) NOT NULL,
  type varchar(30) NOT NULL DEFAULT 'dynamic',
  percent_off decimal(5, 2),
  tiers jsonb DEFAULT '[]'::jsonb,
  customer_group varchar(80),
  product_id uuid REFERENCES products(id) ON DELETE SET NULL,
  variant_id uuid REFERENCES product_variants(id) ON DELETE SET NULL,
  category_id uuid REFERENCES categories(id) ON DELETE SET NULL,
  priority integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  start_at timestamp,
  end_at timestamp,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pricing_rules_type_idx ON pricing_rules (type);
CREATE INDEX IF NOT EXISTS pricing_rules_active_idx ON pricing_rules (is_active, start_at, end_at);
CREATE INDEX IF NOT EXISTS pricing_rules_product_idx ON pricing_rules (product_id);
CREATE INDEX IF NOT EXISTS pricing_rules_category_idx ON pricing_rules (category_id);
CREATE INDEX IF NOT EXISTS pricing_rules_group_idx ON pricing_rules (customer_group);

CREATE TABLE IF NOT EXISTS customer_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug varchar(80) NOT NULL UNIQUE,
  name varchar(150) NOT NULL,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS customer_groups_slug_idx ON customer_groups (slug);

CREATE TABLE IF NOT EXISTS customer_group_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES customer_groups(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS customer_group_members_group_user_uidx
  ON customer_group_members (group_id, user_id);

CREATE INDEX IF NOT EXISTS customer_group_members_user_idx ON customer_group_members (user_id);
