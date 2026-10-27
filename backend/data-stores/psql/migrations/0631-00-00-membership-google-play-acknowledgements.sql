-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
-- Provider-specific rows keep their original owner family without copying provider text.
CREATE FUNCTION fn_reject_membership_context_provider_mismatch() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM membership_provider_contexts context
    WHERE context.id = NEW.membership_provider_context_id
      AND context.provider = TG_ARGV[0]::membership_provider_kinds
  ) THEN
    RAISE EXCEPTION '% records require a matching provider context', TG_TABLE_NAME
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TABLE IF NOT EXISTS membership_google_play_acknowledgments (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  membership_provider_evidence_record_id UUID NOT NULL CONSTRAINT uq_membership_google_play_acknowledgment__provider_evidence_id UNIQUE,
  membership_provider_lineage_id UUID NOT NULL,
  membership_provider_context_id UUID NOT NULL,
  subscription_id TEXT NOT NULL CHECK (char_length(subscription_id) BETWEEN 1 AND 255 AND subscription_id = TRIM(subscription_id)),
  purchase_token_lookup_sha256 TEXT NOT NULL CONSTRAINT chk_membersh_google_play_acknowle__purchase_token_lookup_sha256 CHECK (purchase_token_lookup_sha256 ~ '^[a-f0-9]{64}$'), encrypted_purchase_token BYTEA NOT NULL CONSTRAINT chk_membership_google_play_acknowledg__encrypted_purchase_token CHECK (octet_length(encrypted_purchase_token) BETWEEN 1 AND 65536), acknowledged_at TIMESTAMPTZ, skipped_at TIMESTAMPTZ, skip_reason membership_google_play_acknowledgment_skip_reasons,
  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (num_nonnulls(acknowledged_at, skipped_at) <= 1),
  CHECK ((skipped_at IS NULL) = (skip_reason IS NULL)),
  CHECK (skip_reason IS NULL OR skip_reason = 'no_longer_eligible'),
  CONSTRAINT fk_membership_google_play_acknowledgments__evidence_context FOREIGN KEY (membership_provider_evidence_record_id, membership_provider_lineage_id, membership_provider_context_id) REFERENCES membership_provider_evidence_records(id, membership_provider_lineage_id, membership_provider_context_id) ON DELETE RESTRICT,
  CONSTRAINT fk_membership_google_play_acknowledgments__lineage_context FOREIGN KEY (membership_provider_lineage_id, membership_provider_context_id) REFERENCES membership_provider_lineages(id, membership_provider_context_id) ON DELETE RESTRICT
);
CREATE TRIGGER trigger_membership_google_play_acknowledgments_context
  BEFORE INSERT OR UPDATE ON membership_google_play_acknowledgments
  FOR EACH ROW EXECUTE FUNCTION fn_reject_membership_context_provider_mismatch('google_play');
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TABLE IF NOT EXISTS membership_google_play_acknowledgment_work_items (
  membership_google_play_acknowledgment_id UUID PRIMARY KEY REFERENCES membership_google_play_acknowledgments(id) ON DELETE CASCADE,
  lease_token UUID, leased_at TIMESTAMPTZ, lease_expires_at TIMESTAMPTZ,
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  available_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMPTZ, last_error TEXT CHECK (last_error IS NULL OR char_length(last_error) <= 1000),
  CHECK (num_nonnulls(lease_token, leased_at, lease_expires_at) IN (0, 3)),
  CHECK (lease_expires_at IS NULL OR lease_expires_at > leased_at),
  CHECK (completed_at IS NULL OR lease_token IS NULL)
);
COMMENT ON TABLE membership_google_play_acknowledgment_work_items IS 'Provider acknowledgement work separate from encrypted evidence and acknowledgement receipt; retained with its parent for exact replay.';
COMMENT ON COLUMN membership_google_play_acknowledgment_work_items.membership_google_play_acknowledgment_id IS 'Acknowledgement obligation owning this provider task.';
COMMENT ON COLUMN membership_google_play_acknowledgment_work_items.lease_token IS 'Ownership token checked by every completion, skip and defer.';
COMMENT ON COLUMN membership_google_play_acknowledgment_work_items.leased_at IS 'When the current acknowledgement worker acquired its lease.';
COMMENT ON COLUMN membership_google_play_acknowledgment_work_items.lease_expires_at IS 'Deadline after which the worker cannot record a provider outcome.';
COMMENT ON COLUMN membership_google_play_acknowledgment_work_items.available_at IS 'Earliest retry time after provider failure.';
COMMENT ON COLUMN membership_google_play_acknowledgment_work_items.attempt_count IS 'Number of claimed acknowledgement attempts.';
COMMENT ON COLUMN membership_google_play_acknowledgment_work_items.completed_at IS 'When the current eligibility generation was acknowledged or skipped.';
COMMENT ON COLUMN membership_google_play_acknowledgment_work_items.last_error IS 'Bounded provider-neutral diagnostic for the latest failure.';
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE OR REPLACE FUNCTION fn_create_google_play_acknowledgment_work() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO membership_google_play_acknowledgment_work_items (membership_google_play_acknowledgment_id, completed_at)
  VALUES (NEW.id, COALESCE(NEW.acknowledged_at, NEW.skipped_at));
  RETURN NEW;
END;
$$;
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TRIGGER trigger_google_play_acknowledgments_work AFTER INSERT ON membership_google_play_acknowledgments
FOR EACH ROW EXECUTE FUNCTION fn_create_google_play_acknowledgment_work();
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE OR REPLACE TRIGGER trigger_membership_google_play_acknowledgments_updated_at BEFORE UPDATE ON membership_google_play_acknowledgments FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE UNIQUE INDEX IF NOT EXISTS idx_membership_google_play_acknowledgments__purchase ON membership_google_play_acknowledgments (membership_provider_context_id, purchase_token_lookup_sha256);
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX IF NOT EXISTS idx_membership_google_play_acknowledgments__lineage_context ON membership_google_play_acknowledgments (membership_provider_lineage_id, membership_provider_context_id);
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX IF NOT EXISTS idx_membership_google_play_acknowledgment_work_items__claim ON membership_google_play_acknowledgment_work_items (available_at, membership_google_play_acknowledgment_id) WHERE completed_at IS NULL;
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX IF NOT EXISTS idx_membership_google_play_acknowledgments__pending_id ON membership_google_play_acknowledgments (id) WHERE acknowledged_at IS NULL AND skipped_at IS NULL;
CREATE INDEX idx_membership_google_play_acknowledgments__terminal
  ON membership_google_play_acknowledgments (COALESCE(acknowledged_at, skipped_at), id)
  WHERE acknowledged_at IS NOT NULL OR skipped_at IS NOT NULL;
CREATE TYPE membership_operational_cleanup_kinds AS ENUM ('entitlement_effects', 'renewal_notices', 'google_acknowledgments');
CREATE TABLE membership_operational_cleanup_cursors (
  kind membership_operational_cleanup_kinds PRIMARY KEY,
  cursor_at TIMESTAMPTZ,
  cursor_id UUID,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK ((cursor_at IS NULL) = (cursor_id IS NULL))
);
CREATE TRIGGER trigger_membership_operational_cleanup_cursors_updated_at
BEFORE UPDATE ON membership_operational_cleanup_cursors FOR EACH ROW
EXECUTE FUNCTION fn_update_updated_at();
COMMENT ON TABLE membership_operational_cleanup_cursors IS 'One persisted keyset position per bounded membership operational retention sweep.';
COMMENT ON COLUMN membership_operational_cleanup_cursors.kind IS 'Fixed retention family.';
COMMENT ON COLUMN membership_operational_cleanup_cursors.cursor_at IS 'Last examined due timestamp in the current sweep.';
COMMENT ON COLUMN membership_operational_cleanup_cursors.cursor_id IS 'Deletion-stable UUIDv7 keyset position; it does not reference a surviving row.';
COMMENT ON COLUMN membership_operational_cleanup_cursors.updated_at IS 'When this cleanup stream last checkpointed.';
INSERT INTO membership_operational_cleanup_cursors (kind)
VALUES ('entitlement_effects'), ('renewal_notices'), ('google_acknowledgments')
ON CONFLICT (kind) DO NOTHING;
COMMENT ON TABLE membership_google_play_acknowledgments IS 'Durable Google Play acknowledgement ledger. A retry always refetches subscriptionsv2 before another acknowledgement attempt.';
COMMENT ON COLUMN membership_google_play_acknowledgments.membership_provider_evidence_record_id IS 'Immutable verified provider evidence whose eligible purchase requires acknowledgement.';
COMMENT ON COLUMN membership_google_play_acknowledgments.membership_provider_lineage_id IS 'Canonical Google Play purchase lineage constrained to match the evidence context.';
COMMENT ON COLUMN membership_google_play_acknowledgments.membership_provider_context_id IS 'Google Play provider context constrained to match the evidence and lineage.';
COMMENT ON COLUMN membership_google_play_acknowledgments.subscription_id IS 'Google Play subscription product identifier acknowledged for this purchase.';
COMMENT ON COLUMN membership_google_play_acknowledgments.purchase_token_lookup_sha256 IS 'SHA-256 lookup digest for the encrypted purchase token; raw tokens are never stored.';
COMMENT ON COLUMN membership_google_play_acknowledgments.encrypted_purchase_token IS 'Encrypted Google Play purchase token used only for the authoritative acknowledgement request.';
COMMENT ON COLUMN membership_google_play_acknowledgments.acknowledged_at IS 'When Google Play confirmed acknowledgement for this purchase.';
COMMENT ON COLUMN membership_google_play_acknowledgments.skipped_at IS 'When a fresh authoritative fetch proved acknowledgement was no longer eligible.';
COMMENT ON COLUMN membership_google_play_acknowledgments.skip_reason IS 'Stable reason why this acknowledgement was terminally skipped.';
