-- Adding NOT VALID constraints requires ACCESS EXCLUSIVE. Keep this migration limited to the
-- metadata change so the lock commits before validation and ledger initialization scan the table.
ALTER TABLE ap_inbox_deliveries
  ADD CONSTRAINT ap_inbox_deliveries__failed_requires_first_failed
    CHECK (failed_at IS NULL OR first_failed_at IS NOT NULL) NOT VALID,
  ADD CONSTRAINT ap_inbox_deliveries__first_failed_requires_retention
    CHECK (first_failed_at IS NULL OR retention_expires_at IS NOT NULL) NOT VALID,
  ADD CONSTRAINT ap_inbox_deliveries__verified_never_failed_has_no_retention
    CHECK (verified_at IS NULL OR first_failed_at IS NOT NULL OR retention_expires_at IS NULL) NOT VALID,
  ADD CONSTRAINT ap_inbox_deliveries__unverified_requires_retention
    CHECK (verified_at IS NOT NULL OR retention_expires_at IS NOT NULL) NOT VALID,
  ADD CONSTRAINT ap_inbox_deliveries__first_failed_precedes_failure
    CHECK (failed_at IS NULL OR first_failed_at <= failed_at) NOT VALID,
  ADD CONSTRAINT ap_inbox_deliveries__unverified_retention_bounded
    CHECK (verified_at IS NOT NULL OR retention_expires_at <= received_at + INTERVAL '1 hour') NOT VALID,
  ADD CONSTRAINT ap_inbox_deliveries__verified_failure_retention_bounded
    CHECK (
      verified_at IS NULL
      OR first_failed_at IS NULL
      OR retention_expires_at <= first_failed_at + INTERVAL '7 days'
    ) NOT VALID;
