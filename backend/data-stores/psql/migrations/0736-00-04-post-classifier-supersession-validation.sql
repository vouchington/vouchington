-- Preserve the already-applied 0736-00-02 bytes. Rebuild its CHECK using the
-- cross-file NOT VALID / VALIDATE path while retaining continuous enforcement.
ALTER TABLE post_classifier_applications
  ADD CONSTRAINT chk_post_classifier_applications__superseded_lease_v2
  CHECK (superseded_at IS NULL OR lease_token IS NULL) NOT VALID;
ALTER TABLE post_classifier_applications
  VALIDATE CONSTRAINT chk_post_classifier_applications__superseded_lease_v2;
ALTER TABLE post_classifier_applications
  DROP CONSTRAINT chk_post_classifier_applications__superseded_lease;
ALTER TABLE post_classifier_applications
  RENAME CONSTRAINT chk_post_classifier_applications__superseded_lease_v2
  TO chk_post_classifier_applications__superseded_lease;

COMMENT ON COLUMN post_classifier_applications.superseded_at IS
  'Current obsolete-receipt marker; cleared when the exact approved content/configuration identity becomes current again. Outcomes and attempt budget remain immutable.';
