CREATE TYPE report_judgement_backfill_targets AS ENUM ('post', 'user', 'url_hostname', 'rss_feed_item');

COMMENT ON TYPE report_judgement_backfill_targets IS 'Target kinds in the report judgement backfill traversal order.';

CREATE TABLE IF NOT EXISTS report_judgement_backfill_cursors (
  is_singleton BOOLEAN PRIMARY KEY DEFAULT TRUE,
  target_kind report_judgement_backfill_targets NOT NULL DEFAULT 'post',
  cursor_target_id UUID,
  sweep_upper_bound_id UUID,
  is_sweep_complete BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT report_judgement_backfill_cursors_singleton CHECK (is_singleton),
  CONSTRAINT report_judgement_backfill_cursors_progress CHECK (
    (is_sweep_complete AND target_kind = 'post' AND cursor_target_id IS NULL)
    OR (NOT is_sweep_complete AND sweep_upper_bound_id IS NOT NULL
      AND (cursor_target_id IS NULL OR cursor_target_id < sweep_upper_bound_id))
  )
);

CREATE TRIGGER trigger_report_judgement_backfill_cursors_updated_at
BEFORE UPDATE ON report_judgement_backfill_cursors
FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();

COMMENT ON TABLE report_judgement_backfill_cursors IS 'Checkpoint for the report judgement backfill.';
COMMENT ON COLUMN report_judgement_backfill_cursors.is_singleton IS 'Identifies the shared report judgement backfill cursor.';
COMMENT ON COLUMN report_judgement_backfill_cursors.target_kind IS 'Kind of target currently being scanned.';
COMMENT ON COLUMN report_judgement_backfill_cursors.cursor_target_id IS 'Last inspected target UUID in this kind, even if it needed no judgement.';
COMMENT ON COLUMN report_judgement_backfill_cursors.sweep_upper_bound_id IS 'Exclusive UUIDv7 bound fixed for this pass over all target kinds.';
COMMENT ON COLUMN report_judgement_backfill_cursors.is_sweep_complete IS 'Whether the next run starts a new pass from the beginning.';

COMMENT ON COLUMN report_judgement_backfill_cursors.updated_at IS 'Time the backfill checkpoint last changed.';

INSERT INTO report_judgement_backfill_cursors DEFAULT VALUES ON CONFLICT DO NOTHING;
