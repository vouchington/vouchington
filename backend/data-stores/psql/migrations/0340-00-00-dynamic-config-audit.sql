-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
-- Append-only audit log for Valkey DynamicConfig changes made by administrators.
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TABLE IF NOT EXISTS dynamic_configuration_revisions (
  id               uuid PRIMARY KEY DEFAULT uuidv7(),
  config_key       text NOT NULL,
  revised_by_id    uuid REFERENCES users(id) ON DELETE SET NULL,
  revision_type revision_types NOT NULL,
  changes jsonb NOT NULL,
  created_at       timestamptz GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL
);

-- Index on config_key + id DESC (id is UUIDv7 so DESC is chronological descending).
-- Virtual generated columns cannot be indexed directly.
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX IF NOT EXISTS idx_dynamic_configuration_revisions__configuration_key
  ON dynamic_configuration_revisions (config_key, id DESC);

COMMENT ON TABLE dynamic_configuration_revisions IS 'Append-only audit log of dynamic configuration changes made by administrators.';
COMMENT ON COLUMN dynamic_configuration_revisions.config_key IS 'Valkey DynamicConfig key identifying which configuration was changed.';
COMMENT ON COLUMN dynamic_configuration_revisions.revised_by_id IS 'Administrator who made the change; SET NULL on user deletion.';
COMMENT ON COLUMN dynamic_configuration_revisions.revision_type IS 'Configuration edit operation.';
COMMENT ON COLUMN dynamic_configuration_revisions.changes IS 'Per-field before/after differences; unchanged fields are omitted.';
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TRIGGER trigger_dynamic_configuration_revisions_append_only BEFORE UPDATE OR DELETE ON dynamic_configuration_revisions FOR EACH ROW EXECUTE FUNCTION fn_reject_mutation('revised_by_id');
