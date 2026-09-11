CREATE OR REPLACE FUNCTION fn_enforce_membership_provider_evidence_immutability()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'membership provider evidence records are immutable';
  END IF;

  IF ROW(
    NEW.id,
    NEW.provider,
    NEW.environment,
    NEW.application_id,
    NEW.provider_event_id,
    NEW.evidence_lookup_sha256,
    NEW.encrypted_evidence,
    NEW.received_at
  ) IS DISTINCT FROM ROW(
    OLD.id,
    OLD.provider,
    OLD.environment,
    OLD.application_id,
    OLD.provider_event_id,
    OLD.evidence_lookup_sha256,
    OLD.encrypted_evidence,
    OLD.received_at
  ) OR (
    OLD.membership_provider_lineage_id IS NOT NULL
    AND NEW.membership_provider_lineage_id IS DISTINCT FROM OLD.membership_provider_lineage_id
  ) THEN
    RAISE EXCEPTION 'membership provider evidence identity is immutable';
  END IF;

  IF OLD.rejected_at IS NOT NULL
    OR num_nonnulls(NEW.verified_at, NEW.rejected_at) <> 1
    OR (
      OLD.verified_at IS NOT NULL
      AND (NEW.verified_at IS NOT NULL OR NEW.rejected_at IS NULL)
    )
  THEN
    RAISE EXCEPTION 'membership provider evidence lifecycle is terminal';
  END IF;

  RETURN NEW;
END $$;

CREATE OR REPLACE TRIGGER trigger_membership_provider_evidence_immutable
BEFORE UPDATE OR DELETE ON membership_provider_evidence_records
FOR EACH ROW
EXECUTE FUNCTION fn_enforce_membership_provider_evidence_immutability();

ALTER TABLE membership_changes
ADD CONSTRAINT membership_changes_lifecycle_mutually_exclusive
CHECK (num_nonnulls(cancelled_at, expired_at, past_due_at, paused_at) <= 1)
NOT VALID;

ALTER TABLE membership_changes
VALIDATE CONSTRAINT membership_changes_lifecycle_mutually_exclusive;
