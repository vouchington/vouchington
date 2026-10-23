-- One checkpoint per bounded history sweep. The upper id is frozen for a pass so
-- concurrent inserts cannot extend it; a completed pass starts over on the next run.
CREATE TYPE history_retention_cleanup_names AS ENUM (
  'dynamic_configuration_revisions',
  'rss_feed_setting_changes',
  'fediverse_instance_integration_changes',
  'community_agent_prompt_revisions',
  'followed_user_import_requests',
  'pending_user_import_requests',
  'referral_attribution_scrub',
  'referral_attribution_expiry'
);

CREATE TABLE IF NOT EXISTS history_retention_cursors (
  cleanup_name history_retention_cleanup_names PRIMARY KEY,
  cursor_id UUID,
  sweep_cutoff_id UUID,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TRIGGER trigger_history_retention_cursors_updated_at
BEFORE UPDATE ON history_retention_cursors
FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();

COMMENT ON TYPE history_retention_cleanup_names IS 'Independent bounded config, setting, import, and referral history sweeps.';
COMMENT ON TABLE history_retention_cursors IS 'Durable UUIDv7 progress for bounded history retention passes.';
COMMENT ON COLUMN history_retention_cursors.cleanup_name IS 'History family whose pass this row checkpoints.';
COMMENT ON COLUMN history_retention_cursors.cursor_id IS 'Last raw candidate id scanned, even when its row was a keeper.';
COMMENT ON COLUMN history_retention_cursors.sweep_cutoff_id IS 'Exclusive frozen end of the current UUIDv7 pass.';
COMMENT ON COLUMN history_retention_cursors.updated_at IS 'Time the pass checkpoint last changed.';
