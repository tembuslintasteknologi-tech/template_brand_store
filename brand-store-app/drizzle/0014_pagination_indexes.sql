-- 0014_pagination_indexes.sql
-- Composite indexes for cursor pagination.
-- Safe to re-run, every statement is idempotent.
--
-- Both list endpoints order by (created_at DESC, id DESC) and compare the pair with a strict
-- less-than. Without a composite index Postgres sorts the whole filtered set on every page,
-- which is exactly what cursor pagination exists to avoid.
--
-- Column order matters: the equality/filter column first, then the ordering columns in the
-- same direction the query reads. `id` is last because it only breaks ties on created_at.

CREATE INDEX IF NOT EXISTS "products_pagination_idx"
  ON "products" ("status", "created_at", "id");

CREATE INDEX IF NOT EXISTS "orders_pagination_idx"
  ON "orders" ("created_at", "id");

CREATE INDEX IF NOT EXISTS "orders_customer_pagination_idx"
  ON "orders" ("customer_id", "created_at", "id");
