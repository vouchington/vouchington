-- Coalesced pre-launch domain baseline.
-- edited-in-place: pre-launch, never deployed to production
-- Merged from: 0003-00-00-images.sql, 0140-00-00-post-images.sql

-- ==========================================================================
-- 0003-00-00-images.sql
-- ============================================================================

CREATE TABLE IF NOT EXISTS images (
  id UUID PRIMARY KEY DEFAULT uuidv7(),

  created_by_id UUID NOT NULL REFERENCES users ON DELETE CASCADE,
  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMPTZ,
  deleted_by_id UUID REFERENCES users ON DELETE SET NULL,

  -- image data
  data JSONB NOT NULL, -- raw sharp metadata,
  sha_256 BYTEA CHECK (octet_length(sha_256) = 32) UNIQUE, -- sha 256 sum of the image data

  -- upload lifecycle tracking
  s3_key TEXT NOT NULL,
  upload_started_at TIMESTAMPTZ,
  upload_completed_at TIMESTAMPTZ,
  upload_failed_at TIMESTAMPTZ,
  upload_error TEXT,
  upload_staged_at TIMESTAMPTZ,
  upload_source_deleted_at TIMESTAMPTZ,
  CONSTRAINT chk_images__completed_requires_sha_256 CHECK (upload_completed_at IS NULL OR sha_256 IS NOT NULL),

  CONSTRAINT chk_images__upload_lifecycle CHECK (
    (upload_started_at IS NOT NULL OR (upload_completed_at IS NULL AND upload_failed_at IS NULL))
    AND (upload_completed_at IS NULL OR upload_failed_at IS NULL)
    AND (upload_completed_at IS NULL OR upload_error IS NULL)
    AND (upload_failed_at IS NULL OR upload_error IS NOT NULL)
  ),

  openai_omni_moderation_results JSONB,
  openai_omni_moderation_flagged BOOLEAN,
  openai_omni_moderation_created_at TIMESTAMPTZ,

  quarantine_pending_at TIMESTAMPTZ, -- moderation-history-guard-allow: a sensitive-image transfer remains blocked until its permanent evidence copy succeeds
  quarantined_at TIMESTAMPTZ, -- moderation-history-guard-allow: permanent evidence retention — quarantine is irreversible; no lifted_at needed
  quarantine_s3_key TEXT,

  bedrock_nova_multimodal_v1_embedding VECTOR(1024),
  bedrock_nova_multimodal_v1_embedding_created_at TIMESTAMPTZ
);

CREATE OR REPLACE TRIGGER trigger_images_updated_at
BEFORE UPDATE ON images
FOR EACH ROW
EXECUTE FUNCTION fn_update_updated_at();

CREATE OR REPLACE TRIGGER trigger_images_guard_terminal_lifecycle
BEFORE UPDATE ON images
FOR EACH ROW
EXECUTE FUNCTION fn_guard_terminal_lifecycle('upload_completed_at', 'upload_failed_at');

-- Index for cleanup job to find in-flight uploads (upload_completed_at and upload_failed_at both null = pending or processing)
CREATE INDEX IF NOT EXISTS idx_images__upload_in_flight
ON images (id)
WHERE upload_completed_at IS NULL AND upload_failed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_images__quarantine_pending
ON images (quarantine_pending_at, id)
WHERE quarantine_pending_at IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_images__bedrock_nova_multimodal_v1_embedding
ON images USING hnsw (bedrock_nova_multimodal_v1_embedding vector_cosine_ops)
WHERE bedrock_nova_multimodal_v1_embedding IS NOT NULL;

-- Add FK from users.profile_image_id to images (column defined in 0010)
ALTER TABLE users
ADD CONSTRAINT fk_users_profile_image_id FOREIGN KEY (profile_image_id) REFERENCES images(id) ON DELETE SET NULL NOT VALID;

ALTER TABLE users VALIDATE CONSTRAINT fk_users_profile_image_id;

CREATE INDEX IF NOT EXISTS idx_users__profile_image_id
ON users (profile_image_id)
WHERE profile_image_id IS NOT NULL;

COMMENT ON COLUMN users.profile_image_id IS 'The user''s profile image. NULL if no profile image is set.';

COMMENT ON TABLE images IS 'Uploaded images with S3 storage, metadata, and moderation results.';
COMMENT ON COLUMN images.data IS 'Raw sharp (image processing library) metadata as JSONB.';
COMMENT ON COLUMN images.sha_256 IS 'SHA-256 hash of the original image file bytes. NULL until completion freezes and hashes the staged upload.';
COMMENT ON COLUMN images.upload_staged_at IS 'When the private browser upload staging source was created.';
COMMENT ON COLUMN images.upload_source_deleted_at IS 'Durable evidence that the browser-writable source object was deleted. NULL keeps the source eligible for bounded reconciliation.';
COMMENT ON COLUMN images.s3_key IS 'S3 object key where the image is stored.';
COMMENT ON COLUMN images.upload_started_at IS 'When upload processing began (S3 object received and hash calculation started). NULL = pending.';
COMMENT ON COLUMN images.upload_completed_at IS 'When upload processing finished successfully. NULL until complete.';
COMMENT ON COLUMN images.upload_failed_at IS 'When upload processing failed terminally. NULL until failed.';
COMMENT ON COLUMN images.upload_error IS 'Error message if upload processing failed.';
COMMENT ON COLUMN images.openai_omni_moderation_results IS 'Raw JSONB results from OpenAI omni moderation API.';
COMMENT ON COLUMN images.openai_omni_moderation_flagged IS 'Whether OpenAI moderation flagged this image.';
COMMENT ON COLUMN images.openai_omni_moderation_created_at IS 'When the moderation check was performed.';
COMMENT ON COLUMN images.quarantine_pending_at IS 'When CSAM quarantine began. Pending images are unavailable until permanent copy and deletion complete.';
COMMENT ON COLUMN images.quarantined_at IS 'When the image was copied to the CSAM quarantine bucket. NULL until the permanent copy succeeds.';
COMMENT ON COLUMN images.quarantine_s3_key IS 'S3 key in the permanent quarantine bucket. NULL until the copy succeeds.';
COMMENT ON COLUMN images.bedrock_nova_multimodal_v1_embedding IS '1024-dimensional vector from Amazon Nova 2 Multimodal Embeddings V1 for the image.';
COMMENT ON COLUMN images.bedrock_nova_multimodal_v1_embedding_created_at IS 'When the image embedding was generated.';
