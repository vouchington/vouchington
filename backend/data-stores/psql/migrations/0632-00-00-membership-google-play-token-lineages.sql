CREATE TABLE IF NOT EXISTS membership_google_play_purchase_tokens (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  environment membership_provider_environments NOT NULL, application_id TEXT NOT NULL,
  purchase_token_lookup_sha256 TEXT NOT NULL CHECK (purchase_token_lookup_sha256 ~ '^[a-f0-9]{64}$'),
  encrypted_purchase_token BYTEA NOT NULL CHECK (octet_length(encrypted_purchase_token) BETWEEN 1 AND 65536),
  membership_provider_lineage_id UUID NOT NULL,
  provider membership_provider_kinds NOT NULL DEFAULT 'google_play' CHECK (provider = 'google_play'),
  linked_purchase_token_lookup_sha256 TEXT, created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  CHECK (char_length(application_id) BETWEEN 1 AND 255 AND application_id = TRIM(application_id)),
  CHECK (linked_purchase_token_lookup_sha256 IS NULL OR linked_purchase_token_lookup_sha256 ~ '^[a-f0-9]{64}$'),
  CHECK (linked_purchase_token_lookup_sha256 IS NULL OR linked_purchase_token_lookup_sha256 <> purchase_token_lookup_sha256),
  CONSTRAINT fk_membership_google_play_purchase_tokens__lineage_context FOREIGN KEY (membership_provider_lineage_id, provider, environment, application_id) REFERENCES membership_provider_lineages(id, provider, environment, application_id) ON DELETE RESTRICT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_membership_google_play_purchase_tokens__context_token ON membership_google_play_purchase_tokens (environment, application_id, purchase_token_lookup_sha256);
CREATE INDEX IF NOT EXISTS idx_membership_google_play_purchase_tokens__lineage ON membership_google_play_purchase_tokens (membership_provider_lineage_id, id DESC);
CREATE INDEX IF NOT EXISTS idx_membership_google_play_purchase_tokens__lineage_context ON membership_google_play_purchase_tokens (membership_provider_lineage_id, provider, environment, application_id);
CREATE INDEX IF NOT EXISTS idx_membership_google_play_purchase_tokens__successor ON membership_google_play_purchase_tokens (membership_provider_lineage_id, linked_purchase_token_lookup_sha256) WHERE linked_purchase_token_lookup_sha256 IS NOT NULL;
COMMENT ON TABLE membership_google_play_purchase_tokens IS 'Encrypted Google Play token aliases mapped to one canonical provider lineage; traversal never persists raw purchase tokens.';
COMMENT ON COLUMN membership_google_play_purchase_tokens.environment IS 'Google Play environment in which this token alias is valid.';
COMMENT ON COLUMN membership_google_play_purchase_tokens.application_id IS 'Google Play package name in which this token alias is valid.';
COMMENT ON COLUMN membership_google_play_purchase_tokens.purchase_token_lookup_sha256 IS 'SHA-256 lookup digest for the encrypted token alias; raw tokens are never stored.';
COMMENT ON COLUMN membership_google_play_purchase_tokens.encrypted_purchase_token IS 'Encrypted Google Play purchase token retained only to traverse its authoritative lineage.';
COMMENT ON COLUMN membership_google_play_purchase_tokens.membership_provider_lineage_id IS 'Canonical provider lineage to which this immutable token alias belongs.';
COMMENT ON COLUMN membership_google_play_purchase_tokens.provider IS 'Context discriminator constrained to Google Play.';
COMMENT ON COLUMN membership_google_play_purchase_tokens.linked_purchase_token_lookup_sha256 IS 'SHA-256 lookup digest of the predecessor token reported by Google Play, when present.';

-- Assigned before each authoritative Play fetch. A slow older fetch cannot overwrite a newer
-- fetch that completes first, even when the subscription expiry and state cycle back unchanged.
CREATE SEQUENCE IF NOT EXISTS membership_google_play_observation_order_seq AS BIGINT;

CREATE TABLE IF NOT EXISTS membership_google_play_recovery_cursors (
  id TEXT PRIMARY KEY CHECK (id IN ('notifications', 'active_sources', 'acknowledgements')),
  last_evidence_id UUID,
  sweep_upper_bound_id UUID,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE OR REPLACE TRIGGER trigger_membership_google_play_recovery_cursors_updated_at BEFORE UPDATE ON membership_google_play_recovery_cursors FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();
COMMENT ON TABLE membership_google_play_recovery_cursors IS 'Bounded Google Play notification, acknowledgement, and active-source recovery scans advance only after their queue fan-out succeeds.';
COMMENT ON COLUMN membership_google_play_recovery_cursors.last_evidence_id IS 'Durable UUIDv7 keyset position within the current bounded recovery sweep.';
COMMENT ON COLUMN membership_google_play_recovery_cursors.sweep_upper_bound_id IS 'Inclusive UUIDv7 high-water mark captured before a sweep so sustained inserts cannot starve older pending work.';
