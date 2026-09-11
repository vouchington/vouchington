-- Append-only audit log for Valkey DynamicConfig changes made by administrators.
CREATE TABLE IF NOT EXISTS dynamic_config_change_logs (
  id               uuid PRIMARY KEY DEFAULT uuidv7(),
  config_key       text NOT NULL,
  changed_by_id    uuid REFERENCES users(id) ON DELETE SET NULL,
  previous_fields  jsonb NOT NULL,
  next_fields      jsonb NOT NULL,
  created_at       timestamptz GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL
);

-- Index on config_key + id DESC (id is UUIDv7 so DESC is chronological descending).
-- Virtual generated columns cannot be indexed directly.
CREATE INDEX IF NOT EXISTS dynamic_config_change_logs_config_key_idx
  ON dynamic_config_change_logs (config_key, id DESC);

COMMENT ON TABLE dynamic_config_change_logs IS 'Append-only audit log of dynamic configuration changes made by administrators.';
COMMENT ON COLUMN dynamic_config_change_logs.config_key IS 'Valkey DynamicConfig key identifying which configuration was changed.';
COMMENT ON COLUMN dynamic_config_change_logs.changed_by_id IS 'Administrator who made the change; SET NULL on user deletion.';
COMMENT ON COLUMN dynamic_config_change_logs.previous_fields IS 'Snapshot of the config fields before the change.';
COMMENT ON COLUMN dynamic_config_change_logs.next_fields IS 'Snapshot of the config fields that were applied.';
