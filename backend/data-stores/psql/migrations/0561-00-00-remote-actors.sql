-- edited-in-place: pre-launch, never deployed to production
-- Remote ActivityPub actors known to this instance (Phase C). A state row per remote actor that
-- has interacted with us (e.g. sent a Follow) — never overloads the `users` table, since remote
-- actors are not local accounts. No profile/content fields are persisted here; only the minimum
-- needed to verify inbound HTTP Signatures and address outbound deliveries. Written by the
-- signature-verified inbox receiver (Phase C2), read by @data-stores/psql config-driven relations
-- via relation__remote_actor__follow__user (see entity-relations-metadata.mts).

CREATE TABLE IF NOT EXISTS remote_actors (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  actor_uri TEXT NOT NULL,
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

CREATE UNIQUE INDEX IF NOT EXISTS idx_remote_actors__actor_uri ON remote_actors (actor_uri) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_remote_actors__key_id ON remote_actors (key_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_remote_actors__hostname_id ON remote_actors (hostname_id) WHERE hostname_id IS NOT NULL;

COMMENT ON TABLE remote_actors IS 'Federation-state row for a remote ActivityPub actor. Holds only what is needed to verify inbound HTTP Signatures and deliver outbound activities — never remote profile/content data.';
COMMENT ON COLUMN remote_actors.actor_uri IS 'The remote actor''s stable ActivityPub id (e.g. https://remote.example/users/alice).';
COMMENT ON COLUMN remote_actors.key_id IS 'The keyId URI from the remote actor''s public key document, used to match the keyId parameter on inbound HTTP Signatures.';
COMMENT ON COLUMN remote_actors.public_key_pem IS 'PEM-encoded RSA public key fetched from the remote actor document, used to verify inbound HTTP Signatures.';
COMMENT ON COLUMN remote_actors.inbox_url IS 'The remote actor''s inbox URL for outbound deliveries addressed to this actor specifically.';
COMMENT ON COLUMN remote_actors.shared_inbox_url IS 'The remote actor''s shared inbox URL, when advertised, for batched outbound deliveries to the same remote instance.';
COMMENT ON COLUMN remote_actors.fetched_at IS 'When this actor document (and its public key) was last fetched from the remote instance.';
COMMENT ON COLUMN remote_actors.deleted_at IS 'When this remote actor was removed (e.g. instance blocked or actor deleted upstream). NULL while active.';
COMMENT ON COLUMN remote_actors.deleted_by_id IS 'Staff user who removed this remote actor, when removal was a manual moderation action. NULL for automated removals.';
COMMENT ON COLUMN remote_actors.hostname_id IS 'url_hostnames row for this actor''s home instance, resolved from actor_uri when that hostname already has a directory entry (see @services/fediverse-instances). NULL when the instance has never been added to the directory — a lookup only, never creates a url_hostnames row, so unknown remote hosts are not enrolled as crawlable.';
