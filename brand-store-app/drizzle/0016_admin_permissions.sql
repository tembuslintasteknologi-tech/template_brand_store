-- AUT-013: granular admin permission scopes.
-- Satu baris per permission per user, dengan effect grant atau revoke terhadap default role.

CREATE TABLE IF NOT EXISTS admin_permission_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  permission varchar(64) NOT NULL,
  effect varchar(10) NOT NULL DEFAULT 'grant',
  granted_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS admin_permission_grants_user_permission_uidx
  ON admin_permission_grants (user_id, permission);

CREATE INDEX IF NOT EXISTS admin_permission_grants_user_idx
  ON admin_permission_grants (user_id);
