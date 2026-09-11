CREATE TABLE IF NOT EXISTS activitypub_distribution_checkpoints (
  activity_id UUID PRIMARY KEY,
  source_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  last_remote_actor_id UUID,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(activity_id)) VIRTUAL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE OR REPLACE TRIGGER trigger_activitypub_distribution_checkpoints_updated_at
BEFORE UPDATE ON activitypub_distribution_checkpoints
FOR EACH ROW
EXECUTE FUNCTION fn_update_updated_at();

CREATE INDEX IF NOT EXISTS idx_activitypub_distribution_checkpoints__source_user_id
  ON activitypub_distribution_checkpoints (source_user_id);

COMMENT ON TABLE activitypub_distribution_checkpoints IS 'Durable outbound ActivityPub fan-out cursor. A committed cursor means delivery jobs through that remote actor were accepted by Valkey; completed rows are retained until their source user is deleted.';
COMMENT ON COLUMN activitypub_distribution_checkpoints.activity_id IS 'Stable UUID ActivityPub activity identity; one durable distribution cursor per activity.';
COMMENT ON COLUMN activitypub_distribution_checkpoints.source_user_id IS 'Local actor that owns the outbound activity. Cascading deletion removes all of its durable delivery progress.';
COMMENT ON COLUMN activitypub_distribution_checkpoints.last_remote_actor_id IS 'Last remote follower whose page was committed. No foreign key: deleting that actor must not rewind a completed cursor.';
COMMENT ON COLUMN activitypub_distribution_checkpoints.completed_at IS 'Set after the final follower page commits. Terminal checkpoints intentionally remain for replay protection.';
