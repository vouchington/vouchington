-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TABLE IF NOT EXISTS membership_google_play_acknowledgements (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  membership_provider_evidence_record_id UUID NOT NULL CONSTRAINT uq_membership_google_play_acknowledgement__provider_evidence_id UNIQUE,
  membership_provider_lineage_id UUID NOT NULL,
  provider membership_provider_kinds NOT NULL DEFAULT 'google_play' CHECK (provider = 'google_play'),
  environment membership_provider_environments NOT NULL, application_id TEXT NOT NULL,
  subscription_id TEXT NOT NULL CHECK (char_length(subscription_id) BETWEEN 1 AND 255 AND subscription_id = TRIM(subscription_id)),
  purchase_token_lookup_sha256 TEXT NOT NULL CONSTRAINT chk_membersh_google_play_acknowle__purchase_token_lookup_sha256 CHECK (purchase_token_lookup_sha256 ~ '^[a-f0-9]{64}$'), encrypted_purchase_token BYTEA NOT NULL CONSTRAINT chk_membership_google_play_acknowledg__encrypted_purchase_token CHECK (octet_length(encrypted_purchase_token) BETWEEN 1 AND 65536), acknowledged_at TIMESTAMPTZ, skipped_at TIMESTAMPTZ, skip_reason membership_google_play_acknowledgement_skip_reasons,
  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (char_length(application_id) BETWEEN 1 AND 255 AND application_id = TRIM(application_id)),
  CHECK (num_nonnulls(acknowledged_at, skipped_at) <= 1),
  CHECK ((skipped_at IS NULL) = (skip_reason IS NULL)),
  CHECK (skip_reason IS NULL OR skip_reason = 'no_longer_eligible'),
  CONSTRAINT fk_membership_google_play_acknowledgements__evidence_context FOREIGN KEY (membership_provider_evidence_record_id, membership_provider_lineage_id, provider, environment, application_id) REFERENCES membership_provider_evidence_records(id, membership_provider_lineage_id, provider, environment, application_id) ON DELETE RESTRICT,
  CONSTRAINT fk_membership_google_play_acknowledgements__lineage_context FOREIGN KEY (membership_provider_lineage_id, provider, environment, application_id) REFERENCES membership_provider_lineages(id, provider, environment, application_id) ON DELETE RESTRICT
);
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TABLE IF NOT EXISTS membership_google_play_acknowledgement_work_items (
  membership_google_play_acknowledgement_id UUID PRIMARY KEY REFERENCES membership_google_play_acknowledgements(id) ON DELETE CASCADE,
  lease_token UUID, leased_at TIMESTAMPTZ, lease_expires_at TIMESTAMPTZ,
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  available_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMPTZ, last_error TEXT CHECK (last_error IS NULL OR char_length(last_error) <= 1000),
  CHECK (num_nonnulls(lease_token, leased_at, lease_expires_at) IN (0, 3)),
  CHECK (lease_expires_at IS NULL OR lease_expires_at > leased_at),
  CHECK (completed_at IS NULL OR lease_token IS NULL)
);
COMMENT ON TABLE membership_google_play_acknowledgement_work_items IS 'Provider acknowledgement work separate from encrypted evidence and acknowledgement receipt; retained with its parent for exact replay.';
COMMENT ON COLUMN membership_google_play_acknowledgement_work_items.membership_google_play_acknowledgement_id IS 'Acknowledgement obligation owning this provider task.';
COMMENT ON COLUMN membership_google_play_acknowledgement_work_items.lease_token IS 'Ownership token checked by every completion, skip and defer.';
COMMENT ON COLUMN membership_google_play_acknowledgement_work_items.leased_at IS 'When the current acknowledgement worker acquired its lease.';
COMMENT ON COLUMN membership_google_play_acknowledgement_work_items.lease_expires_at IS 'Deadline after which the worker cannot record a provider outcome.';
COMMENT ON COLUMN membership_google_play_acknowledgement_work_items.available_at IS 'Earliest retry time after provider failure.';
COMMENT ON COLUMN membership_google_play_acknowledgement_work_items.attempt_count IS 'Number of claimed acknowledgement attempts.';
COMMENT ON COLUMN membership_google_play_acknowledgement_work_items.completed_at IS 'When the current eligibility generation was acknowledged or skipped.';
COMMENT ON COLUMN membership_google_play_acknowledgement_work_items.last_error IS 'Bounded provider-neutral diagnostic for the latest failure.';
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE OR REPLACE FUNCTION fn_create_google_play_acknowledgement_work() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO membership_google_play_acknowledgement_work_items (membership_google_play_acknowledgement_id, completed_at)
  VALUES (NEW.id, COALESCE(NEW.acknowledged_at, NEW.skipped_at));
  RETURN NEW;
END;
$$;
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TRIGGER trigger_google_play_acknowledgements_work AFTER INSERT ON membership_google_play_acknowledgements
FOR EACH ROW EXECUTE FUNCTION fn_create_google_play_acknowledgement_work();
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE OR REPLACE TRIGGER trigger_membership_google_play_acknowledgements_updated_at BEFORE UPDATE ON membership_google_play_acknowledgements FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();
CREATE UNIQUE INDEX IF NOT EXISTS idx_membership_google_play_acknowledgements__purchase ON membership_google_play_acknowledgements (environment, application_id, purchase_token_lookup_sha256);
CREATE INDEX IF NOT EXISTS idx_membership_google_play_acknowledgements__lineage_context ON membership_google_play_acknowledgements (membership_provider_lineage_id, provider, environment, application_id);
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX IF NOT EXISTS idx_google_play_acknowledgement_work_items__claim ON membership_google_play_acknowledgement_work_items (available_at, membership_google_play_acknowledgement_id) WHERE completed_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_membership_google_play_acknowledgements__pending_id ON membership_google_play_acknowledgements (id) WHERE acknowledged_at IS NULL AND skipped_at IS NULL;
COMMENT ON TABLE membership_google_play_acknowledgements IS 'Durable Google Play acknowledgement ledger. A retry always refetches subscriptionsv2 before another acknowledgement attempt.';
COMMENT ON COLUMN membership_google_play_acknowledgements.membership_provider_evidence_record_id IS 'Immutable verified provider evidence whose eligible purchase requires acknowledgement.';
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
