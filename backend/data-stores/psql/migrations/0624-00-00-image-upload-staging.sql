ALTER TABLE images
  -- Staging rows are intentionally unhashed until completion.
  -- squawk-ignore ban-drop-not-null
  ALTER COLUMN sha_256 DROP NOT NULL;

ALTER TABLE images
  ADD COLUMN upload_staged_at TIMESTAMPTZ,
  ADD COLUMN upload_source_deleted_at TIMESTAMPTZ;

ALTER TABLE images
  ADD CONSTRAINT chk_images__completed_requires_sha_256
  CHECK (upload_completed_at IS NULL OR sha_256 IS NOT NULL) NOT VALID;

ALTER TABLE images
  VALIDATE CONSTRAINT chk_images__completed_requires_sha_256;

COMMENT ON COLUMN images.sha_256 IS
  'SHA-256 hash of the original image file bytes. NULL until completion freezes and hashes the staged upload.';
COMMENT ON COLUMN images.upload_staged_at IS
  'When the private browser upload staging source was created.';
COMMENT ON COLUMN images.upload_source_deleted_at IS
  'Durable evidence that the browser-writable source object was deleted. NULL keeps the source eligible for bounded reconciliation.';
