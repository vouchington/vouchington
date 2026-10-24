-- edited-in-place: pre-launch, never deployed to production
-- Remote ActivityPub actors known to this instance (Phase C). A state row per remote actor that
-- has interacted with us (e.g. sent a Follow) — never overloads the `users` table, since remote
-- actors are not local accounts. No profile/content fields are persisted here; only the minimum
-- needed to verify inbound HTTP Signatures and address outbound deliveries. Written by the
-- signature-verified inbox receiver (Phase C2), read by @data-stores/psql config-driven relations
-- via relation__remote_actor__follow__user (see entity-relations-metadata.mts).

CREATE TABLE IF NOT EXISTS remote_actor_identities (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  actor_uri TEXT NOT NULL UNIQUE CHECK (char_length(actor_uri) BETWEEN 1 AND 2048),
  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL
);
COMMENT ON TABLE remote_actor_identities IS 'Stable external actor URI identity for exact ActivityPub replay after the signing-key cache expires; identity alone never authorizes an actor.';
COMMENT ON COLUMN remote_actor_identities.actor_uri IS 'Exact ActivityPub actor URI, retained to map a freshly verified document back to its durable replay identity.';

CREATE TABLE IF NOT EXISTS remote_actors (
  id UUID PRIMARY KEY REFERENCES remote_actor_identities(id) ON DELETE RESTRICT,
  key_id TEXT NOT NULL,
  public_key_pem TEXT NOT NULL,
  inbox_url TEXT NOT NULL,
  shared_inbox_url TEXT,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMPTZ,
  deleted_by_id UUID REFERENCES users ON DELETE SET NULL,
  hostname_id UUID REFERENCES url_hostnames ON DELETE SET NULL
);

CREATE OR REPLACE TRIGGER trigger_remote_actors_updated_at
BEFORE UPDATE ON remote_actors
FOR EACH ROW
EXECUTE FUNCTION fn_update_updated_at();

CREATE UNIQUE INDEX IF NOT EXISTS idx_remote_actors__key_id ON remote_actors (key_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_remote_actors__hostname_id ON remote_actors (hostname_id) WHERE hostname_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_remote_actors__cache_retention
  ON remote_actors (fetched_at, id) WHERE deleted_at IS NULL;
DO $$ BEGIN
  CREATE TYPE operational_tombstone_retention_names AS ENUM (
    'activitypub_post_likes', 'remote_actors', 'feed_hostname_blocks',
    'other_hostname_blocks', 'deleted_conversations', 'app_attestation_keys'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
COMMENT ON TYPE operational_tombstone_retention_names IS 'Independent bounded sweeps of stale operational records.';

CREATE TABLE IF NOT EXISTS operational_tombstone_retention_cursors (
  cleanup_name operational_tombstone_retention_names PRIMARY KEY,
  cursor_at TIMESTAMPTZ,
  cursor_id UUID,
  sweep_cutoff_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK ((cursor_at IS NULL) = (cursor_id IS NULL)),
  CHECK (cursor_id IS NULL OR sweep_cutoff_at IS NOT NULL)
);
CREATE OR REPLACE TRIGGER trigger_operational_tombstone_retention_cursors_updated_at
BEFORE UPDATE ON operational_tombstone_retention_cursors
FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();
COMMENT ON TABLE operational_tombstone_retention_cursors IS 'Durable keyset positions for capped operational retention sweeps.';
COMMENT ON COLUMN operational_tombstone_retention_cursors.cleanup_name IS 'Independent finite retention family.';
COMMENT ON COLUMN operational_tombstone_retention_cursors.cursor_at IS 'Exact timestamp keyset position, preserved at PostgreSQL microsecond precision.';
COMMENT ON COLUMN operational_tombstone_retention_cursors.cursor_id IS 'UUIDv7 tie-breaker position, not an entity reference.';
COMMENT ON COLUMN operational_tombstone_retention_cursors.sweep_cutoff_at IS 'Fixed age cutoff for the unfinished pass.';
COMMENT ON COLUMN operational_tombstone_retention_cursors.updated_at IS 'Most recent cursor checkpoint.';

COMMENT ON TABLE remote_actors IS 'Federation-state row for a remote ActivityPub actor. Holds only what is needed to verify inbound HTTP Signatures and deliver outbound activities — never remote profile/content data.';
COMMENT ON COLUMN remote_actors.key_id IS 'The keyId URI from the remote actor''s public key document, used to match the keyId parameter on inbound HTTP Signatures.';
COMMENT ON COLUMN remote_actors.public_key_pem IS 'PEM-encoded RSA public key fetched from the remote actor document, used to verify inbound HTTP Signatures.';
COMMENT ON COLUMN remote_actors.inbox_url IS 'The remote actor''s inbox URL for outbound deliveries addressed to this actor specifically.';
COMMENT ON COLUMN remote_actors.shared_inbox_url IS 'The remote actor''s shared inbox URL, when advertised, for batched outbound deliveries to the same remote instance.';
COMMENT ON COLUMN remote_actors.fetched_at IS 'When this actor document (and its public key) was last fetched from the remote instance.';
COMMENT ON COLUMN remote_actors.deleted_at IS 'When this remote actor was removed (e.g. instance blocked or actor deleted upstream). NULL while active.';
COMMENT ON COLUMN remote_actors.deleted_by_id IS 'Staff user who removed this remote actor, when removal was a manual moderation action. NULL for automated removals.';
COMMENT ON COLUMN remote_actors.hostname_id IS 'url_hostnames row for this actor''s home instance, resolved from actor_uri when that hostname already has a directory entry (see @services/fediverse-instances). NULL when the instance has never been added to the directory — a lookup only, never creates a url_hostnames row, so unknown remote hosts are not enrolled as crawlable.';
