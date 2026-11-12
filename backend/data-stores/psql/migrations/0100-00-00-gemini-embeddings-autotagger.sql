-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
-- Coalesced pre-launch domain baseline.

-- ==========================================================================
-- ============================================================================

DO $$ BEGIN
  CREATE TYPE gemini_embedding_batch_job_types AS ENUM (
  'topics',
  'posts',
  'rss_feed_items',
  'crawl_chunks',
  'images'
);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TABLE IF NOT EXISTS gemini_embedding_batches (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  job_name TEXT,
  model_id TEXT NOT NULL,
  job_type gemini_embedding_batch_job_types NOT NULL,
  data JSONB NOT NULL DEFAULT '{}',
  url_id UUID REFERENCES urls ON DELETE SET NULL,
  crawl_id UUID REFERENCES crawls ON DELETE SET NULL,
  records INT NOT NULL DEFAULT 0 CHECK (records BETWEEN 0 AND 1000000),
  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  submitted_at TIMESTAMPTZ,
  in_progress_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  CONSTRAINT chk_gemini_embedding_batches__lifecycle CHECK (
    (submitted_at IS NOT NULL OR num_nonnulls(in_progress_at, completed_at, failed_at, cancelled_at) = 0)
    AND num_nonnulls(completed_at, failed_at, cancelled_at) <= 1
  )
);

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE OR REPLACE TRIGGER trigger_gemini_embedding_batches_updated_at
BEFORE UPDATE ON gemini_embedding_batches
FOR EACH ROW
EXECUTE FUNCTION fn_update_updated_at();

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE OR REPLACE TRIGGER trigger_gemini_embedding_batches_guard_terminal_lifecycle
BEFORE UPDATE ON gemini_embedding_batches
FOR EACH ROW
EXECUTE FUNCTION fn_reject_terminal_lifecycle('completed_at', 'failed_at', 'cancelled_at');

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX IF NOT EXISTS idx_gemini_embedding_batches__active
ON gemini_embedding_batches (id)
WHERE submitted_at IS NOT NULL
  AND completed_at IS NULL
  AND failed_at IS NULL
  AND cancelled_at IS NULL;

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE UNIQUE INDEX IF NOT EXISTS idx_gemini_embedding_batches__job_name
ON gemini_embedding_batches (job_name)
WHERE job_name IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_gemini_embedding_batches__preparing
ON gemini_embedding_batches (id)
WHERE submitted_at IS NULL AND completed_at IS NULL
  AND failed_at IS NULL AND cancelled_at IS NULL;

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX IF NOT EXISTS idx_gemini_embedding_batches__url_id
ON gemini_embedding_batches (url_id)
WHERE url_id IS NOT NULL;

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX IF NOT EXISTS idx_gemini_embedding_batches__crawl_id
ON gemini_embedding_batches (crawl_id)
WHERE crawl_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_gemini_embedding_batches__terminal_retention
ON gemini_embedding_batches ((COALESCE(completed_at, failed_at, cancelled_at)), id)
WHERE completed_at IS NOT NULL OR failed_at IS NOT NULL OR cancelled_at IS NOT NULL;


COMMENT ON TABLE gemini_embedding_batches IS 'Tracks Vertex AI batch embedding jobs and their lifecycle.';
COMMENT ON COLUMN gemini_embedding_batches.id IS 'UUIDv7 identifier of this Vertex embedding batch.';
COMMENT ON COLUMN gemini_embedding_batches.job_name IS 'The Vertex batch prediction resource name.';
COMMENT ON COLUMN gemini_embedding_batches.model_id IS 'The Vertex AI model id used for embeddings.';
COMMENT ON COLUMN gemini_embedding_batches.job_type IS 'Which entity type this batch processes.';
COMMENT ON COLUMN gemini_embedding_batches.data IS 'JSONB batch document: provider state, GCS URIs, input size, and submission metadata; model_id and job_name columns are canonical.';
COMMENT ON COLUMN gemini_embedding_batches.url_id IS 'Optional URL this batch was created for.';
COMMENT ON COLUMN gemini_embedding_batches.crawl_id IS 'Optional crawl this batch was created for. Cleared before that crawl partition is dropped.';
COMMENT ON COLUMN gemini_embedding_batches.records IS 'Number of records in this batch.';
COMMENT ON COLUMN gemini_embedding_batches.submitted_at IS 'When submission intent was persisted before contacting Vertex; a missing receipt is reconciled by display name.';
COMMENT ON COLUMN gemini_embedding_batches.in_progress_at IS 'When the Vertex job first reported running, cancelling or paused, or successful output awaiting ingestion.';
COMMENT ON COLUMN gemini_embedding_batches.completed_at IS 'When all successful terminal output was validated and applied.';
COMMENT ON COLUMN gemini_embedding_batches.failed_at IS 'When the provider failed, a submission receipt expired, the final bounded queue attempt failed to ingest results, or the configured batch lifetime expired before ingestion.';
COMMENT ON COLUMN gemini_embedding_batches.cancelled_at IS 'When the Vertex job was JOB_STATE_CANCELLED before completion.';

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TABLE IF NOT EXISTS gemini_embedding_batch_entities (
  batch_id UUID NOT NULL REFERENCES gemini_embedding_batches ON DELETE CASCADE,
  entity_type gemini_embedding_batch_job_types NOT NULL,
  topic_id UUID REFERENCES topics(id) ON DELETE CASCADE,
  post_id UUID REFERENCES posts(id) ON DELETE CASCADE,
  rss_feed_item_id UUID REFERENCES rss_feed_items(id) ON DELETE CASCADE,
  crawl_id UUID,
  crawl_order_index INT,
  image_id UUID REFERENCES images(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_gemini_embedding_batch_entities__crawl_chunk
    FOREIGN KEY (crawl_id, crawl_order_index) REFERENCES crawl_chunks(crawl_id, order_index) ON DELETE CASCADE,
  CONSTRAINT chk_gemini_embedding_batch_entities__entity_columns
    CHECK (
      (
        entity_type = 'topics'
        AND topic_id IS NOT NULL
        AND post_id IS NULL
        AND rss_feed_item_id IS NULL
        AND crawl_id IS NULL
        AND crawl_order_index IS NULL
        AND image_id IS NULL
      )
      OR (
        entity_type = 'posts'
        AND topic_id IS NULL
        AND post_id IS NOT NULL
        AND rss_feed_item_id IS NULL
        AND crawl_id IS NULL
        AND crawl_order_index IS NULL
        AND image_id IS NULL
      )
      OR (
        entity_type = 'rss_feed_items'
        AND topic_id IS NULL
        AND post_id IS NULL
        AND rss_feed_item_id IS NOT NULL
        AND crawl_id IS NULL
        AND crawl_order_index IS NULL
        AND image_id IS NULL
      )
      OR (
        entity_type = 'crawl_chunks'
        AND topic_id IS NULL
        AND post_id IS NULL
        AND rss_feed_item_id IS NULL
        AND crawl_id IS NOT NULL
        AND crawl_order_index IS NOT NULL
        AND image_id IS NULL
      )
      OR (
        entity_type = 'images'
        AND topic_id IS NULL
        AND post_id IS NULL
        AND rss_feed_item_id IS NULL
        AND crawl_id IS NULL
        AND crawl_order_index IS NULL
        AND image_id IS NOT NULL
      )
    )
);

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX IF NOT EXISTS idx_gemini_embedding_batch_entities__batch_id
ON gemini_embedding_batch_entities (batch_id);

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX IF NOT EXISTS idx_gemini_embedding_batch_entities__topic
ON gemini_embedding_batch_entities (topic_id)
WHERE topic_id IS NOT NULL;

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX IF NOT EXISTS idx_gemini_embedding_batch_entities__post
ON gemini_embedding_batch_entities (post_id)
WHERE post_id IS NOT NULL;

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX IF NOT EXISTS idx_gemini_embedding_batch_entities__rss_feed_item
ON gemini_embedding_batch_entities (rss_feed_item_id)
WHERE rss_feed_item_id IS NOT NULL;

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX IF NOT EXISTS idx_gemini_embedding_batch_entities__crawl_chunk
ON gemini_embedding_batch_entities (crawl_id, crawl_order_index)
WHERE crawl_id IS NOT NULL AND crawl_order_index IS NOT NULL;

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX IF NOT EXISTS idx_gemini_embedding_batch_entities__crawl_id
ON gemini_embedding_batch_entities (crawl_id)
WHERE crawl_id IS NOT NULL;

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX IF NOT EXISTS idx_gemini_embedding_batch_entities__image
ON gemini_embedding_batch_entities (image_id)
WHERE image_id IS NOT NULL;

COMMENT ON TABLE gemini_embedding_batch_entities IS 'Batch membership for best-effort duplicate-work suppression; membership does not grant exclusive entity ownership.';
COMMENT ON COLUMN gemini_embedding_batch_entities.batch_id IS 'The batch job processing this entity.';
COMMENT ON COLUMN gemini_embedding_batch_entities.entity_type IS 'The entity type being processed.';
COMMENT ON COLUMN gemini_embedding_batch_entities.topic_id IS 'Topic currently being processed in a Vertex embeddings batch.';
COMMENT ON COLUMN gemini_embedding_batch_entities.post_id IS 'Post currently being processed in a Vertex embeddings batch.';
COMMENT ON COLUMN gemini_embedding_batch_entities.rss_feed_item_id IS 'RSS feed item currently being processed in a Vertex embeddings batch.';
COMMENT ON COLUMN gemini_embedding_batch_entities.crawl_id IS 'Crawl containing the crawl chunk currently being processed in a Vertex embeddings batch.';
COMMENT ON COLUMN gemini_embedding_batch_entities.crawl_order_index IS 'Order index of the crawl chunk currently being processed in a Vertex embeddings batch.';
COMMENT ON COLUMN gemini_embedding_batch_entities.image_id IS 'Image currently being processed in a Vertex embeddings batch.';

-- ==========================================================================
-- 0070-00-00-autotagger-embeddings.sql
-- ============================================================================

-- Create centralized embeddings table with content_sha256 as primary key
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TABLE IF NOT EXISTS gemini_embedding_2_embeddings (
  content_sha256 BYTEA PRIMARY KEY CHECK (OCTET_LENGTH(content_sha256) = 32),
  embedding halfvec(1536) NOT NULL, -- no-index because this is a lookup table
  input_token_count INT CHECK (input_token_count IS NULL OR input_token_count >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE OR REPLACE TRIGGER trigger_gemini_embedding_2_embeddings_updated_at
BEFORE UPDATE ON gemini_embedding_2_embeddings
FOR EACH ROW
EXECUTE FUNCTION fn_update_updated_at();


COMMENT ON TABLE gemini_embedding_2_embeddings IS 'Recomputable Gemini Embedding 2 document-vector cache keyed by canonical content hash; bounded age-based pages are removed by the daily data-retention sweep.';
COMMENT ON COLUMN gemini_embedding_2_embeddings.content_sha256 IS 'SHA-256 of the input content. Primary key for deduplication.';
COMMENT ON COLUMN gemini_embedding_2_embeddings.embedding IS '1536-dimensional vector from Gemini Embedding 2.';
COMMENT ON COLUMN gemini_embedding_2_embeddings.input_token_count IS 'Number of tokens Vertex consumed for this content. NULL until first embedded; populated on insert and backfilled on cache hits.';
