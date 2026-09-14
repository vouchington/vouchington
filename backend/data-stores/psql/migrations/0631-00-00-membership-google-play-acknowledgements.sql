CREATE TABLE IF NOT EXISTS membership_google_play_acknowledgements (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  membership_provider_evidence_id UUID NOT NULL UNIQUE,
  membership_provider_lineage_id UUID NOT NULL,
  provider membership_provider_kinds NOT NULL DEFAULT 'google_play' CHECK (provider = 'google_play'),
  environment membership_provider_environments NOT NULL, application_id TEXT NOT NULL,
  subscription_id TEXT NOT NULL CHECK (char_length(subscription_id) BETWEEN 1 AND 255 AND subscription_id = TRIM(subscription_id)),
  purchase_token_lookup_sha256 TEXT NOT NULL CHECK (purchase_token_lookup_sha256 ~ '^[a-f0-9]{64}$'), encrypted_purchase_token BYTEA NOT NULL CHECK (octet_length(encrypted_purchase_token) BETWEEN 1 AND 65536), acknowledged_at TIMESTAMPTZ, skipped_at TIMESTAMPTZ, skip_reason TEXT, attempt_claim_token UUID,
  attempt_claimed_at TIMESTAMPTZ, next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  attempt_count INTEGER NOT NULL DEFAULT 0, last_error TEXT,
  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (char_length(application_id) BETWEEN 1 AND 255 AND application_id = TRIM(application_id)),
  CHECK (attempt_count >= 0),
  CHECK (num_nonnulls(acknowledged_at, skipped_at) <= 1),
  CHECK ((skipped_at IS NULL) = (skip_reason IS NULL)),
  CHECK (skip_reason IS NULL OR skip_reason = 'no_longer_eligible'),
  CHECK (acknowledged_at IS NULL OR attempt_claim_token IS NULL),
  CHECK (skipped_at IS NULL OR attempt_claim_token IS NULL),
  CHECK (attempt_claimed_at IS NULL OR attempt_claim_token IS NOT NULL),
  CONSTRAINT fk_membership_google_play_acknowledgements__evidence_context FOREIGN KEY (membership_provider_evidence_id, membership_provider_lineage_id, provider, environment, application_id) REFERENCES membership_provider_evidence_records(id, membership_provider_lineage_id, provider, environment, application_id) ON DELETE RESTRICT,
  CONSTRAINT fk_membership_google_play_acknowledgements__lineage_context FOREIGN KEY (membership_provider_lineage_id, provider, environment, application_id) REFERENCES membership_provider_lineages(id, provider, environment, application_id) ON DELETE RESTRICT
);
CREATE OR REPLACE TRIGGER trigger_membership_google_play_acknowledgements_updated_at BEFORE UPDATE ON membership_google_play_acknowledgements FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();
CREATE UNIQUE INDEX IF NOT EXISTS idx_membership_google_play_acknowledgements__purchase ON membership_google_play_acknowledgements (environment, application_id, purchase_token_lookup_sha256);
CREATE INDEX IF NOT EXISTS idx_membership_google_play_acknowledgements__lineage_context ON membership_google_play_acknowledgements (membership_provider_lineage_id, provider, environment, application_id);
CREATE INDEX IF NOT EXISTS idx_membership_google_play_acknowledgements__due ON membership_google_play_acknowledgements (next_attempt_at, id) WHERE acknowledged_at IS NULL AND skipped_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_membership_google_play_acknowledgements__pending_id ON membership_google_play_acknowledgements (id) WHERE acknowledged_at IS NULL AND skipped_at IS NULL;
COMMENT ON TABLE membership_google_play_acknowledgements IS 'Durable Google Play acknowledgement ledger. A retry always refetches subscriptionsv2 before another acknowledgement attempt.';
COMMENT ON COLUMN membership_google_play_acknowledgements.membership_provider_evidence_id IS 'Immutable verified provider evidence whose eligible purchase requires acknowledgement.';
COMMENT ON COLUMN membership_google_play_acknowledgements.membership_provider_lineage_id IS 'Canonical Google Play purchase lineage constrained to match the evidence context.';
COMMENT ON COLUMN membership_google_play_acknowledgements.provider IS 'Context discriminator constrained to Google Play.';
COMMENT ON COLUMN membership_google_play_acknowledgements.environment IS 'Google Play environment constrained to match the evidence and lineage context.';
COMMENT ON COLUMN membership_google_play_acknowledgements.application_id IS 'Google Play package name constrained to match the evidence and lineage context.';
COMMENT ON COLUMN membership_google_play_acknowledgements.subscription_id IS 'Google Play subscription product identifier acknowledged for this purchase.';
COMMENT ON COLUMN membership_google_play_acknowledgements.purchase_token_lookup_sha256 IS 'SHA-256 lookup digest for the encrypted purchase token; raw tokens are never stored.';
COMMENT ON COLUMN membership_google_play_acknowledgements.encrypted_purchase_token IS 'Encrypted Google Play purchase token used only for the authoritative acknowledgement request.';
COMMENT ON COLUMN membership_google_play_acknowledgements.acknowledged_at IS 'When Google Play confirmed acknowledgement for this purchase.';
COMMENT ON COLUMN membership_google_play_acknowledgements.skipped_at IS 'When a fresh authoritative fetch proved acknowledgement was no longer eligible.';
COMMENT ON COLUMN membership_google_play_acknowledgements.skip_reason IS 'Stable reason why this acknowledgement was terminally skipped.';
COMMENT ON COLUMN membership_google_play_acknowledgements.attempt_claim_token IS 'Ephemeral fencing token for the current acknowledgement processor; it identifies no durable relation.';
COMMENT ON COLUMN membership_google_play_acknowledgements.attempt_claimed_at IS 'When the current acknowledgement processor acquired its fencing token.';
COMMENT ON COLUMN membership_google_play_acknowledgements.next_attempt_at IS 'Earliest time recovery may retry this unacknowledged purchase.';
COMMENT ON COLUMN membership_google_play_acknowledgements.attempt_count IS 'Number of durable acknowledgement processing attempts.';
COMMENT ON COLUMN membership_google_play_acknowledgements.last_error IS 'Bounded diagnostic from the most recent recoverable acknowledgement failure.';
