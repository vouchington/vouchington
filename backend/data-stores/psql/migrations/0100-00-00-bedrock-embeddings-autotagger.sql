-- Coalesced pre-launch domain baseline.
-- edited-in-place: pre-launch, never deployed to production
-- edited-in-place: folded idx_bedrock_embeddings_batches__job_arn from 0360-00-00-bedrock-batch-job-arn-index
-- Merged from: 0040-00-00-bedrock-batch-embeddings.sql, 0070-00-00-autotagger-embeddings.sql

-- ==========================================================================
-- 0040-00-00-bedrock-batch-embeddings.sql
-- ============================================================================

DO $$ BEGIN
  CREATE TYPE bedrock_embedding_batch_job_types AS ENUM (
  'topics',
  'posts',
  'rss_feed_items',
  'crawl_chunks',
  'images'
);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS bedrock_embeddings_batches (
  id TEXT PRIMARY KEY,
  job_arn TEXT,
  model_id TEXT NOT NULL,
  job_type bedrock_embedding_batch_job_types NOT NULL,
  data JSONB NOT NULL DEFAULT '{}',
  records INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  submitted_at TIMESTAMPTZ,
  in_progress_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  CONSTRAINT chk_bedrock_embeddings_batches__lifecycle CHECK (
    (submitted_at IS NOT NULL OR num_nonnulls(in_progress_at, completed_at, failed_at, cancelled_at) = 0)
    AND num_nonnulls(completed_at, failed_at, cancelled_at) <= 1
  )
);

CREATE OR REPLACE TRIGGER trigger_bedrock_embeddings_batches_updated_at
BEFORE UPDATE ON bedrock_embeddings_batches
FOR EACH ROW
EXECUTE FUNCTION fn_update_updated_at();

CREATE OR REPLACE TRIGGER trigger_bedrock_embeddings_batches_guard_terminal_lifecycle
BEFORE UPDATE ON bedrock_embeddings_batches
FOR EACH ROW
EXECUTE FUNCTION fn_guard_terminal_lifecycle('completed_at', 'failed_at', 'cancelled_at');

CREATE INDEX IF NOT EXISTS idx_bedrock_embeddings_batches__active
ON bedrock_embeddings_batches (created_at)
WHERE submitted_at IS NOT NULL
  AND completed_at IS NULL
  AND failed_at IS NULL
  AND cancelled_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_bedrock_embeddings_batches__created_at
ON bedrock_embeddings_batches (created_at);

CREATE UNIQUE INDEX IF NOT EXISTS idx_bedrock_embeddings_batches__job_arn
ON bedrock_embeddings_batches (job_arn)
WHERE job_arn IS NOT NULL;

COMMENT ON TABLE bedrock_embeddings_batches IS 'Tracks Amazon Bedrock batch embedding jobs and their lifecycle.';
COMMENT ON COLUMN bedrock_embeddings_batches.job_arn IS 'The Bedrock model invocation job ARN.';
COMMENT ON COLUMN bedrock_embeddings_batches.model_id IS 'The Amazon Bedrock model id used for embeddings.';
COMMENT ON COLUMN bedrock_embeddings_batches.job_type IS 'Which entity type this batch processes.';
COMMENT ON COLUMN bedrock_embeddings_batches.data IS 'JSONB metadata about the Bedrock batch job.';
COMMENT ON COLUMN bedrock_embeddings_batches.records IS 'Number of records in this batch.';
COMMENT ON COLUMN bedrock_embeddings_batches.submitted_at IS 'When the Bedrock job was successfully submitted (Submitted/Validating/Scheduled).';
COMMENT ON COLUMN bedrock_embeddings_batches.in_progress_at IS 'When the Bedrock job first reported InProgress or Stopping.';
COMMENT ON COLUMN bedrock_embeddings_batches.completed_at IS 'When the Bedrock job first reached a successful terminal status (Completed or PartiallyCompleted).';
COMMENT ON COLUMN bedrock_embeddings_batches.failed_at IS 'When the Bedrock job terminated unsuccessfully (Failed or Expired).';
COMMENT ON COLUMN bedrock_embeddings_batches.cancelled_at IS 'When the Bedrock job was Stopped before completion.';

CREATE TABLE IF NOT EXISTS bedrock_embeddings_batch_entities (
  batch_id TEXT NOT NULL REFERENCES bedrock_embeddings_batches ON DELETE CASCADE,
  entity_type bedrock_embedding_batch_job_types NOT NULL,
  topic_id UUID REFERENCES topics(id) ON DELETE CASCADE,
  post_id UUID REFERENCES posts(id) ON DELETE CASCADE,
  rss_feed_item_id UUID REFERENCES rss_feed_items(id) ON DELETE CASCADE,
  crawl_id UUID,
  crawl_order_index INT,
  image_id UUID REFERENCES images(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_bedrock_embeddings_batch_entities__crawl_chunk
    FOREIGN KEY (crawl_id, crawl_order_index) REFERENCES crawl_chunks(crawl_id, order_index) ON DELETE CASCADE,
  CONSTRAINT chk_bedrock_embeddings_batch_entities__entity_columns
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

CREATE OR REPLACE TRIGGER trigger_bedrock_embeddings_batch_entities_updated_at
BEFORE UPDATE ON bedrock_embeddings_batch_entities
FOR EACH ROW
EXECUTE FUNCTION fn_update_updated_at();

CREATE INDEX IF NOT EXISTS idx_bedrock_embeddings_batch_entities__batch_id
ON bedrock_embeddings_batch_entities (batch_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_bedrock_embeddings_batch_entities__topic
ON bedrock_embeddings_batch_entities (topic_id)
WHERE topic_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_bedrock_embeddings_batch_entities__post
ON bedrock_embeddings_batch_entities (post_id)
WHERE post_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_bedrock_embeddings_batch_entities__rss_feed_item
ON bedrock_embeddings_batch_entities (rss_feed_item_id)
WHERE rss_feed_item_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_bedrock_embeddings_batch_entities__crawl_chunk
ON bedrock_embeddings_batch_entities (crawl_id, crawl_order_index)
WHERE crawl_id IS NOT NULL AND crawl_order_index IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_bedrock_embeddings_batch_entities__crawl_id
ON bedrock_embeddings_batch_entities (crawl_id)
WHERE crawl_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_bedrock_embeddings_batch_entities__image
ON bedrock_embeddings_batch_entities (image_id)
WHERE image_id IS NOT NULL;

COMMENT ON TABLE bedrock_embeddings_batch_entities IS 'Lock table tracking which entities are currently being processed in a Bedrock embeddings batch.';
COMMENT ON COLUMN bedrock_embeddings_batch_entities.batch_id IS 'The batch job processing this entity.';
COMMENT ON COLUMN bedrock_embeddings_batch_entities.entity_type IS 'The entity type being processed.';
COMMENT ON COLUMN bedrock_embeddings_batch_entities.topic_id IS 'Topic currently being processed in a Bedrock embeddings batch.';
COMMENT ON COLUMN bedrock_embeddings_batch_entities.post_id IS 'Post currently being processed in a Bedrock embeddings batch.';
COMMENT ON COLUMN bedrock_embeddings_batch_entities.rss_feed_item_id IS 'RSS feed item currently being processed in a Bedrock embeddings batch.';
COMMENT ON COLUMN bedrock_embeddings_batch_entities.crawl_id IS 'Crawl containing the crawl chunk currently being processed in a Bedrock embeddings batch.';
COMMENT ON COLUMN bedrock_embeddings_batch_entities.crawl_order_index IS 'Order index of the crawl chunk currently being processed in a Bedrock embeddings batch.';
COMMENT ON COLUMN bedrock_embeddings_batch_entities.image_id IS 'Image currently being processed in a Bedrock embeddings batch.';

-- ==========================================================================
-- 0070-00-00-autotagger-embeddings.sql
-- ============================================================================

-- Autotagger uses the generic agents system

CREATE TABLE IF NOT EXISTS post_autotagger_results (
  post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  prompt_id UUID NOT NULL REFERENCES agent_prompts(id) ON DELETE CASCADE,
  content_sha256 BYTEA NOT NULL CHECK (octet_length(content_sha256) = 32),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by_id UUID REFERENCES users ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_by_id UUID REFERENCES users ON DELETE SET NULL,
  deleted_at TIMESTAMPTZ,
  deleted_by_id UUID REFERENCES users ON DELETE SET NULL,
  PRIMARY KEY (post_id, prompt_id)
) PARTITION BY RANGE (post_id);

CREATE INDEX IF NOT EXISTS idx_post_autotagger_results__lookup ON post_autotagger_results(post_id, prompt_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_post_autotagger_results__prompt_id ON post_autotagger_results(prompt_id);

CREATE TABLE IF NOT EXISTS post_autotagger_result_topics (
  post_id UUID NOT NULL,
  prompt_id UUID NOT NULL,
  topic_id UUID NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  topic_order INT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (post_id, prompt_id, topic_id),
  FOREIGN KEY (post_id, prompt_id) REFERENCES post_autotagger_results(post_id, prompt_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_post_autotagger_result_topics__topic_id ON post_autotagger_result_topics(topic_id);

COMMENT ON TABLE post_autotagger_results IS 'Autotagger LLM results for posts. Keyed by (post, prompt). RANGE-partitioned by post_id.';
COMMENT ON COLUMN post_autotagger_results.post_id IS 'The post that was auto-tagged.';
COMMENT ON COLUMN post_autotagger_results.prompt_id IS 'The agent prompt version used for tagging.';
COMMENT ON COLUMN post_autotagger_results.content_sha256 IS 'SHA-256 of the post content that was analyzed.';

COMMENT ON TABLE post_autotagger_result_topics IS 'Topics suggested by the autotagger for a given post result.';
COMMENT ON COLUMN post_autotagger_result_topics.post_id IS 'The post (part of composite FK to post_autotagger_results).';
COMMENT ON COLUMN post_autotagger_result_topics.prompt_id IS 'The prompt version (part of composite FK to post_autotagger_results).';
COMMENT ON COLUMN post_autotagger_result_topics.topic_id IS 'The topic suggested by the autotagger.';
COMMENT ON COLUMN post_autotagger_result_topics.topic_order IS 'Relevance order of this topic suggestion (0 = most relevant).';

CREATE TABLE IF NOT EXISTS rss_feed_item_autotagger_results (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  rss_feed_item_id UUID NOT NULL REFERENCES rss_feed_items ON DELETE CASCADE,
  content_sha256 BYTEA NOT NULL CHECK (octet_length(content_sha256) = 32),
  prompt_id UUID NOT NULL REFERENCES agent_prompts(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  created_by_id UUID REFERENCES users ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_by_id UUID REFERENCES users ON DELETE SET NULL,
  deleted_at TIMESTAMPTZ,
  deleted_by_id UUID REFERENCES users ON DELETE SET NULL,
  UNIQUE(rss_feed_item_id, content_sha256, prompt_id)
);

CREATE INDEX IF NOT EXISTS idx_rss_feed_item_autotagger_results__lookup ON rss_feed_item_autotagger_results(rss_feed_item_id, prompt_id, content_sha256) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_rss_feed_item_autotagger_results__prompt_id ON rss_feed_item_autotagger_results(prompt_id);

CREATE TABLE IF NOT EXISTS rss_feed_item_autotagger_result_topics (
  rss_feed_item_autotagger_result_id UUID NOT NULL REFERENCES rss_feed_item_autotagger_results(id) ON DELETE CASCADE,
  topic_id UUID NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  topic_order INT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (rss_feed_item_autotagger_result_id, topic_id)
);

CREATE INDEX IF NOT EXISTS idx_rss_feed_item_autotagger_result_topics__topic_id ON rss_feed_item_autotagger_result_topics(topic_id);

COMMENT ON TABLE rss_feed_item_autotagger_results IS 'Autotagger LLM results for RSS feed items. Keyed by (rss_feed_item_id, content hash, prompt).';
COMMENT ON COLUMN rss_feed_item_autotagger_results.rss_feed_item_id IS 'The RSS feed item that was auto-tagged.';
COMMENT ON COLUMN rss_feed_item_autotagger_results.content_sha256 IS 'SHA-256 of the item content that was analyzed.';
COMMENT ON COLUMN rss_feed_item_autotagger_results.prompt_id IS 'The agent prompt version used for tagging.';

COMMENT ON TABLE rss_feed_item_autotagger_result_topics IS 'Topics suggested by the autotagger for a given RSS feed item result.';
COMMENT ON COLUMN rss_feed_item_autotagger_result_topics.rss_feed_item_autotagger_result_id IS 'The autotagger result this topic belongs to.';
COMMENT ON COLUMN rss_feed_item_autotagger_result_topics.topic_id IS 'The topic suggested by the autotagger.';
COMMENT ON COLUMN rss_feed_item_autotagger_result_topics.topic_order IS 'Relevance order of this topic suggestion (0 = most relevant).';

-- Trigger to update updated_at on post_autotagger_results
CREATE TRIGGER trigger_post_autotagger_results_updated_at
BEFORE UPDATE ON post_autotagger_results
FOR EACH ROW
EXECUTE FUNCTION fn_update_updated_at();

-- Trigger to update updated_at on rss_feed_item_autotagger_results
CREATE TRIGGER trigger_rss_feed_item_autotagger_results_updated_at
BEFORE UPDATE ON rss_feed_item_autotagger_results
FOR EACH ROW
EXECUTE FUNCTION fn_update_updated_at();

-- Create centralized embeddings table with content_sha256 as primary key
CREATE TABLE IF NOT EXISTS bedrock_nova_multimodal_v1_embeddings (
  content_sha256 BYTEA PRIMARY KEY CHECK (OCTET_LENGTH(content_sha256) = 32),
  embedding VECTOR(1024) NOT NULL, -- no-index because this is a lookup table
  input_token_count INT CHECK (input_token_count IS NULL OR input_token_count >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE OR REPLACE TRIGGER trigger_bedrock_nova_multimodal_v1_embeddings_updated_at
BEFORE UPDATE ON bedrock_nova_multimodal_v1_embeddings
FOR EACH ROW
EXECUTE FUNCTION fn_update_updated_at();

CREATE TABLE IF NOT EXISTS bedrock_nova_multimodal_v1_image_embeddings (
  image_sha_256 BYTEA PRIMARY KEY CHECK (OCTET_LENGTH(image_sha_256) = 32),
  embedding VECTOR(1024) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE OR REPLACE TRIGGER trigger_bedrock_nova_multimodal_v1_image_embeddings_updated_at
BEFORE UPDATE ON bedrock_nova_multimodal_v1_image_embeddings
FOR EACH ROW
EXECUTE FUNCTION fn_update_updated_at();

COMMENT ON TABLE bedrock_nova_multimodal_v1_embeddings IS 'Centralized lookup table for Amazon Nova multimodal text vectors, keyed by content hash.';
COMMENT ON COLUMN bedrock_nova_multimodal_v1_embeddings.content_sha256 IS 'SHA-256 of the input content. Primary key for deduplication.';
COMMENT ON COLUMN bedrock_nova_multimodal_v1_embeddings.embedding IS '1024-dimensional vector from Amazon Nova 2 Multimodal Embeddings V1.';
COMMENT ON COLUMN bedrock_nova_multimodal_v1_embeddings.input_token_count IS 'Number of tokens Bedrock consumed for this content. NULL until first embedded; populated on insert and backfilled on cache hits.';
COMMENT ON TABLE bedrock_nova_multimodal_v1_image_embeddings IS 'Centralized lookup table for Amazon Nova multimodal image vectors, keyed by image hash.';
COMMENT ON COLUMN bedrock_nova_multimodal_v1_image_embeddings.image_sha_256 IS 'SHA-256 of the original image bytes. Primary key for image embedding deduplication.';
COMMENT ON COLUMN bedrock_nova_multimodal_v1_image_embeddings.embedding IS '1024-dimensional image vector from Amazon Nova 2 Multimodal Embeddings V1.';
