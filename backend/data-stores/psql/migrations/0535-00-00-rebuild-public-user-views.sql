-- view_embedded_users removed public roles/individual_id/is_agent columns in favor of
-- is_official_account. PostgreSQL cannot CREATE OR REPLACE VIEW when columns are removed,
-- so drop the managed public user view graph once and let the view runner rebuild it.
DROP VIEW IF EXISTS view_embedded_users CASCADE;
