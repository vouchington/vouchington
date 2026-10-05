-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TABLE IF NOT EXISTS activitypub_distribution_work_items (
  activity_id UUID PRIMARY KEY,
  source_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  cursor_remote_actor_id UUID,
  completed_at TIMESTAMPTZ,
  lease_token UUID,
  leased_at TIMESTAMPTZ,
  lease_expires_at TIMESTAMPTZ,
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  available_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK ((lease_token IS NULL) = (leased_at IS NULL)),
  CHECK ((lease_token IS NULL) = (lease_expires_at IS NULL)),
  CHECK (lease_expires_at > leased_at),
  CHECK (completed_at IS NULL OR lease_token IS NULL),
  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(activity_id)) VIRTUAL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE OR REPLACE TRIGGER trigger_activitypub_distribution_work_items_updated_at
BEFORE UPDATE ON activitypub_distribution_work_items
FOR EACH ROW
EXECUTE FUNCTION fn_update_updated_at();

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX IF NOT EXISTS idx_activitypub_distribution_work_items__source_user_id
  ON activitypub_distribution_work_items (source_user_id);

COMMENT ON TABLE activitypub_distribution_work_items IS 'Durable outbound ActivityPub fan-out cursor. A committed cursor means delivery jobs through that remote actor were accepted by Valkey; completed rows are retained until their source user is deleted.';
COMMENT ON COLUMN activitypub_distribution_work_items.activity_id IS 'Stable UUID ActivityPub activity identity; one durable distribution cursor per activity.';
COMMENT ON COLUMN activitypub_distribution_work_items.source_user_id IS 'Local actor that owns the outbound activity. Cascading deletion removes all of its durable delivery progress.';
COMMENT ON COLUMN activitypub_distribution_work_items.cursor_remote_actor_id IS 'Last remote follower whose page was committed. No foreign key: deleting that actor must not rewind a completed cursor.';
COMMENT ON COLUMN activitypub_distribution_work_items.completed_at IS 'Set after the final follower page commits. Terminal checkpoints intentionally remain for replay protection.';

CREATE INDEX IF NOT EXISTS idx_activitypub_distribution_work_items__claim
  ON activitypub_distribution_work_items (available_at, activity_id)
  WHERE completed_at IS NULL;

COMMENT ON COLUMN activitypub_distribution_work_items.lease_token IS 'Opaque worker fencing token; only its current owner may advance or release a page.';
COMMENT ON COLUMN activitypub_distribution_work_items.leased_at IS 'Time the current page worker acquired its lease.';
COMMENT ON COLUMN activitypub_distribution_work_items.lease_expires_at IS 'Expiry of the current page lease; a successor rotates the fencing token.';
COMMENT ON COLUMN activitypub_distribution_work_items.attempt_count IS 'Number of page processing claims, including recovery after lease expiry.';
COMMENT ON COLUMN activitypub_distribution_work_items.available_at IS 'Earliest time an unfinished page may be claimed.';
