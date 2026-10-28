-- ActivityPub inbound-activity replay dedup (Phase C2). Every activity accepted by the inbox
-- receiver is recorded here by its ActivityPub activity `id` before processing. A duplicate
-- delivery (retried by the sending server, or replayed by an attacker who captured a valid
-- signed request) is rejected once its activity id is already present.

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TABLE IF NOT EXISTS activitypub_inbox_activities (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  activity_id TEXT NOT NULL,
  activity_type TEXT NOT NULL,
  actor_uri TEXT NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL
);

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE UNIQUE INDEX IF NOT EXISTS idx_activitypub_inbox_activities__activity_id ON activitypub_inbox_activities (activity_id);

-- Each Follow cycle keeps its terminal state beyond the maximum replay horizon.
CREATE TABLE IF NOT EXISTS activitypub_remote_follow_activities (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  activity_id TEXT NOT NULL CHECK (char_length(activity_id) BETWEEN 1 AND 2048),
  remote_actor_id UUID NOT NULL,
  target_user_id UUID NOT NULL,
  undone_at TIMESTAMPTZ,
  confirmed_at TIMESTAMPTZ DEFAULT clock_timestamp(),
  CHECK (confirmed_at IS NOT NULL OR undone_at IS NOT NULL),
  CONSTRAINT uq_ap_remote_follow_activities__actor_activity UNIQUE (remote_actor_id, activity_id),
  CONSTRAINT uq_ap_remote_follow_activities__scope_id
    UNIQUE (remote_actor_id, target_user_id, id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_activitypub_remote_follow_activities__confirmed_activity
  ON activitypub_remote_follow_activities (activity_id) WHERE confirmed_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_activitypub_remote_follow_activities__target_user_id
  ON activitypub_remote_follow_activities (target_user_id);

CREATE INDEX IF NOT EXISTS idx_activitypub_remote_follow_activities__undone_retention
  ON activitypub_remote_follow_activities (undone_at, id) WHERE undone_at IS NOT NULL;

COMMENT ON TABLE activitypub_remote_follow_activities IS 'Per-activity remote Follow identity. Active cycles remain domain facts; terminal cycles expire after their configured replay-safe retention window.';
COMMENT ON COLUMN activitypub_remote_follow_activities.created_at IS 'Virtual UUIDv7 creation time for per-activity Follow identity; active identities remain while terminal retention is measured from undone_at.';
COMMENT ON COLUMN activitypub_remote_follow_activities.activity_id IS 'External Follow URI. Undo-only assertions are actor scoped; receipt of the original Follow establishes one global URI owner.';
COMMENT ON COLUMN activitypub_remote_follow_activities.remote_actor_id IS 'Signing remote actor that sent the Follow.';
COMMENT ON COLUMN activitypub_remote_follow_activities.target_user_id IS 'Local user targeted by the Follow.';
COMMENT ON COLUMN activitypub_remote_follow_activities.confirmed_at IS 'When the original signed Follow was received. NULL for an Undo-only assertion; confirmation never clears or restarts terminal retention.';
COMMENT ON COLUMN activitypub_remote_follow_activities.undone_at IS 'Set by Undo or replacement, including Undo before Follow; never cleared while retained and starts the terminal identity retention window.';

COMMENT ON TABLE activitypub_inbox_activities IS 'Replay-dedup ledger for the ActivityPub inbox receiver. One row per accepted activity id; a second delivery of the same activity id is rejected before it reaches any write-path.';
COMMENT ON COLUMN activitypub_inbox_activities.activity_id IS 'The ActivityPub activity''s `id` field (a remote URI). Unique — the dedup key.';
COMMENT ON COLUMN activitypub_inbox_activities.activity_type IS 'The activity''s `type` field (e.g. Follow, Undo, Like), recorded for operational visibility.';
COMMENT ON COLUMN activitypub_inbox_activities.actor_uri IS 'The activity''s `actor` field (the sending remote actor''s ActivityPub id), recorded for operational visibility.';
COMMENT ON COLUMN activitypub_inbox_activities.received_at IS 'When this activity was accepted by the inbox receiver.';
