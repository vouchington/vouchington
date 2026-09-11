-- The metadata-only column and retention-trigger migration commits before this backfill, so its
-- ACCESS EXCLUSIVE lock is not held while legacy rows are repaired.
UPDATE ap_inbox_deliveries
SET first_failed_at = failed_at
WHERE failed_at IS NOT NULL
  AND first_failed_at IS NULL;

UPDATE ap_inbox_deliveries
SET retention_expires_at = CASE
  WHEN verified_at IS NULL THEN received_at + INTERVAL '1 hour'
  WHEN first_failed_at IS NOT NULL THEN first_failed_at + INTERVAL '7 days'
  ELSE NULL
END
WHERE retention_expires_at IS NULL;
