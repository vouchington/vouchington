-- ActivityPub inbound-activity replay dedup (Phase C2). Every activity accepted by the inbox
-- receiver is recorded here by its ActivityPub activity `id` before processing. A duplicate
-- delivery (retried by the sending server, or replayed by an attacker who captured a valid
-- signed request) is rejected once its activity id is already present.

CREATE TABLE IF NOT EXISTS ap_inbox_activities (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  activity_id TEXT NOT NULL,
  activity_type TEXT NOT NULL,
  actor_uri TEXT NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_ap_inbox_activities__activity_id ON ap_inbox_activities (activity_id);

COMMENT ON TABLE ap_inbox_activities IS 'Replay-dedup ledger for the ActivityPub inbox receiver. One row per accepted activity id; a second delivery of the same activity id is rejected before it reaches any write-path.';
COMMENT ON COLUMN ap_inbox_activities.activity_id IS 'The ActivityPub activity''s `id` field (a remote URI). Unique — the dedup key.';
COMMENT ON COLUMN ap_inbox_activities.activity_type IS 'The activity''s `type` field (e.g. Follow, Undo, Like), recorded for operational visibility.';
COMMENT ON COLUMN ap_inbox_activities.actor_uri IS 'The activity''s `actor` field (the sending remote actor''s ActivityPub id), recorded for operational visibility.';
COMMENT ON COLUMN ap_inbox_activities.received_at IS 'When this activity was accepted by the inbox receiver.';
