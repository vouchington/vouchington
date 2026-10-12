CREATE TABLE IF NOT EXISTS membership_google_play_purchase_tokens (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  membership_provider_context_id UUID NOT NULL REFERENCES membership_provider_contexts(id) ON DELETE RESTRICT,
  purchase_token_lookup_sha256 TEXT NOT NULL CONSTRAINT chk_membe_googl_play_purch_tokens__purchase_token_lookup_sha256 CHECK (purchase_token_lookup_sha256 ~ '^[a-f0-9]{64}$'),
  encrypted_purchase_token BYTEA NOT NULL CONSTRAINT chk_member_google_play_purchas_tokens__encrypted_purchase_token CHECK (octet_length(encrypted_purchase_token) BETWEEN 1 AND 65536),
  membership_provider_lineage_id UUID NOT NULL,
  linked_purchase_token_id UUID,
  fetched_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  CHECK (linked_purchase_token_id IS NULL OR linked_purchase_token_id <> id),
  CONSTRAINT fk_membership_google_play_purchase_tokens__lineage_context FOREIGN KEY (membership_provider_lineage_id, membership_provider_context_id) REFERENCES membership_provider_lineages(id, membership_provider_context_id) ON DELETE RESTRICT,
  CONSTRAINT uq_membership_google_play_purchase_tokens__id_lineage_context UNIQUE (id, membership_provider_lineage_id, membership_provider_context_id),
  CONSTRAINT fk_membership_google_play_purchase_tokens__predecessor FOREIGN KEY (linked_purchase_token_id, membership_provider_lineage_id, membership_provider_context_id) REFERENCES membership_google_play_purchase_tokens(id, membership_provider_lineage_id, membership_provider_context_id) ON DELETE RESTRICT
);
CREATE TRIGGER trigger_membership_google_play_purchase_tokens_context
  BEFORE INSERT OR UPDATE ON membership_google_play_purchase_tokens
  FOR EACH ROW EXECUTE FUNCTION fn_reject_non_google_play_membership_context();
CREATE UNIQUE INDEX IF NOT EXISTS idx_membership_google_play_purchase_tokens__context_token ON membership_google_play_purchase_tokens (membership_provider_context_id, purchase_token_lookup_sha256);
CREATE INDEX IF NOT EXISTS idx_membership_google_play_purchase_tokens__lineage ON membership_google_play_purchase_tokens (membership_provider_lineage_id, id DESC);
CREATE INDEX IF NOT EXISTS idx_membership_google_play_purchase_tokens__successor ON membership_google_play_purchase_tokens (linked_purchase_token_id) WHERE linked_purchase_token_id IS NOT NULL;
COMMENT ON TABLE membership_google_play_purchase_tokens IS 'Encrypted Google Play token aliases mapped to one canonical provider lineage; traversal never persists raw purchase tokens.';
COMMENT ON COLUMN membership_google_play_purchase_tokens.membership_provider_context_id IS 'Google Play environment and package identity in which this token alias is valid.';
COMMENT ON COLUMN membership_google_play_purchase_tokens.purchase_token_lookup_sha256 IS 'SHA-256 lookup digest for the encrypted token alias; raw tokens are never stored.';
COMMENT ON COLUMN membership_google_play_purchase_tokens.encrypted_purchase_token IS 'Encrypted Google Play purchase token retained only to traverse its authoritative lineage.';
COMMENT ON COLUMN membership_google_play_purchase_tokens.membership_provider_lineage_id IS 'Canonical provider lineage to which this immutable token alias belongs.';
COMMENT ON COLUMN membership_google_play_purchase_tokens.linked_purchase_token_id IS 'Persisted predecessor alias reported by Google Play, including predecessors that could not be fetched.';
COMMENT ON COLUMN membership_google_play_purchase_tokens.fetched_at IS 'First successful authoritative fetch of this token; NULL means the token was only reported as a predecessor and must not grant access or be acknowledged.';

-- Assigned before each authoritative Play fetch. A slow older fetch cannot overwrite a newer
-- fetch that completes first, even when the subscription expiry and state cycle back unchanged.
CREATE SEQUENCE IF NOT EXISTS membership_google_play_observation_order_seq AS BIGINT;

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TABLE IF NOT EXISTS membership_google_play_recovery_cursors (
  recovery_sweep membership_google_play_recovery_sweeps PRIMARY KEY,
  cursor_evidence_id UUID,
  sweep_upper_bound_evidence_id UUID,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE OR REPLACE TRIGGER trigger_membership_google_play_recovery_cursors_updated_at BEFORE UPDATE ON membership_google_play_recovery_cursors FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();
COMMENT ON TABLE membership_google_play_recovery_cursors IS 'Bounded Google Play notification, acknowledgement, and active-source recovery scans advance only after their queue fan-out succeeds.';
COMMENT ON COLUMN membership_google_play_recovery_cursors.recovery_sweep IS 'Concrete recovery sweep sharing one compare-and-set cursor across dispatchers.';
COMMENT ON COLUMN membership_google_play_recovery_cursors.cursor_evidence_id IS 'Durable UUIDv7 keyset position within the current bounded recovery sweep.';
COMMENT ON COLUMN membership_google_play_recovery_cursors.sweep_upper_bound_evidence_id IS 'Inclusive UUIDv7 high-water mark captured before a sweep so sustained inserts cannot starve older pending work.';
