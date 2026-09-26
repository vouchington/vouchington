-- Coalesced current-state publication repair work and its retained tombstone keys.
-- Work rows are deleted after an exact-generation acknowledgement; retained keys cascade with
-- that acknowledgement. There is deliberately no append-only publication-change ledger: the
-- current dirty-work generation is the authoritative, de-duplicated repair request.
CREATE TABLE IF NOT EXISTS post_publication_dirty_work (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  post_id UUID,
  author_user_id UUID,
  community_id UUID,
  rss_feed_id UUID,
  topic_alias_id UUID,
  story_id UUID,
  reasons TEXT[] NOT NULL CHECK (
    cardinality(reasons) > 0
    AND reasons <@ ARRAY[
      'post_created', 'post_updated', 'post_content_reset', 'post_audience_changed',
      'post_archived', 'post_deleted', 'post_topics_changed', 'post_related_urls_changed',
      'post_ratings_changed', 'post_clearance_changed', 'post_moderation_flag_changed',
      'community_publication_changed', 'moderation_appeal_resolved', 'author_suspension_changed',
      'author_deleted', 'community_visibility_changed', 'rss_feed_discoverability_changed',
      'rss_feed_enablement_changed', 'rss_feed_source_changed'
    ]::TEXT[]
  ),
  generation BIGINT NOT NULL DEFAULT 1 CHECK (generation > 0),
  cursor_post_id UUID,
  cursor_topic_id UUID,
  cursor_key_id UUID,
  lease_token UUID,
  leased_at TIMESTAMPTZ,
  lease_expires_at TIMESTAMPTZ,
  cursor_updated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (num_nonnulls(post_id, author_user_id, community_id, rss_feed_id, topic_alias_id, story_id) = 1),
  CHECK ((lease_token IS NULL) = (leased_at IS NULL)),
  CHECK ((lease_token IS NULL) = (lease_expires_at IS NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_post_publication_dirty_work__post_id
  ON post_publication_dirty_work (post_id) WHERE post_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_post_publication_dirty_work__author_user_id
  ON post_publication_dirty_work (author_user_id) WHERE author_user_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_post_publication_dirty_work__community_id
  ON post_publication_dirty_work (community_id) WHERE community_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_post_publication_dirty_work__rss_feed_id
  ON post_publication_dirty_work (rss_feed_id) WHERE rss_feed_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_post_publication_dirty_work__topic_alias_id
  ON post_publication_dirty_work (topic_alias_id) WHERE topic_alias_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_post_publication_dirty_work__story_id
  ON post_publication_dirty_work (story_id) WHERE story_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_post_publication_dirty_work__lease_expires_at_id
  ON post_publication_dirty_work (lease_expires_at, id);

CREATE TABLE IF NOT EXISTS post_publication_dirty_work_keys (
  id UUID NOT NULL DEFAULT uuidv7(),
  dirty_work_id UUID NOT NULL REFERENCES post_publication_dirty_work (id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN (
    'impact_post', 'impact_topic', 'impact_community', 'impact_rss_feed_item',
    'identity_author', 'identity_author_username',
    'identity_community', 'identity_rss_feed', 'identity_post_slug', 'identity_community_slug',
    'identity_topic_alias',
    'sitemap_target'
  )),
  uuid_value UUID,
  text_value TEXT,
  post_type post_types,
  day DATE,
  PRIMARY KEY (dirty_work_id, id),
  CHECK (
    (kind IN (
      'impact_post', 'impact_topic', 'impact_community', 'impact_rss_feed_item', 'identity_author',
      'identity_community', 'identity_rss_feed'
    )
      AND uuid_value IS NOT NULL AND text_value IS NULL AND post_type IS NULL AND day IS NULL)
    OR
    (kind IN ('identity_author_username', 'identity_post_slug', 'identity_community_slug', 'identity_topic_alias')
      AND uuid_value IS NULL AND text_value IS NOT NULL
      AND char_length(text_value) BETWEEN 1 AND 255
      AND post_type IS NULL AND day IS NULL)
    OR
    (kind = 'sitemap_target'
      AND uuid_value IS NULL AND text_value IS NULL AND post_type IS NOT NULL AND day IS NOT NULL)
  )
) PARTITION BY RANGE (dirty_work_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_post_publication_dirty_work_keys__uuid_value
  ON post_publication_dirty_work_keys (dirty_work_id, kind, uuid_value)
  WHERE uuid_value IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_post_publication_dirty_work_keys__text_value
  ON post_publication_dirty_work_keys (dirty_work_id, kind, text_value)
  WHERE text_value IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_post_publication_dirty_work_keys__sitemap_target
  ON post_publication_dirty_work_keys (dirty_work_id, kind, post_type, day)
  WHERE post_type IS NOT NULL;

CREATE OR REPLACE TRIGGER trigger_post_publication_dirty_work_updated_at
BEFORE UPDATE ON post_publication_dirty_work
FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();

COMMENT ON TABLE post_publication_dirty_work IS 'One de-duplicated current-state publication repair scope. A generation and lease token fence stale workers; exact acknowledgement deletes completed work.';
COMMENT ON COLUMN post_publication_dirty_work.post_id IS 'Post scope retained without an FK so deletion cannot erase pending repair work.';
COMMENT ON COLUMN post_publication_dirty_work.author_user_id IS 'Author scope retained without an FK so account deletion cannot erase pending repair work.';
COMMENT ON COLUMN post_publication_dirty_work.community_id IS 'Community scope retained without an FK so deletion cannot erase pending repair work.';
COMMENT ON COLUMN post_publication_dirty_work.rss_feed_id IS 'RSS feed scope retained without an FK so deletion cannot erase pending repair work.';
COMMENT ON COLUMN post_publication_dirty_work.topic_alias_id IS 'Topic alias scope retained without an FK so reassignment cannot erase pending repair work.';
COMMENT ON COLUMN post_publication_dirty_work.story_id IS 'Story scope retained without an FK so source deletion cannot erase pending repair work.';
COMMENT ON COLUMN post_publication_dirty_work.reasons IS 'Finite set of coalesced eligibility-change reasons requiring the same current-state repair.';
COMMENT ON COLUMN post_publication_dirty_work.generation IS 'Monotonic compare-and-set generation incremented whenever the scope becomes dirty again.';
COMMENT ON COLUMN post_publication_dirty_work.cursor_post_id IS 'Last post UUID completed by the current generation; NULL starts or restarts post expansion.';
COMMENT ON COLUMN post_publication_dirty_work.cursor_topic_id IS 'Last topic UUID completed by the current generation; NULL starts or restarts topic expansion.';
COMMENT ON COLUMN post_publication_dirty_work.cursor_key_id IS 'Last retained-key UUID completed by the current generation; NULL starts or restarts key repair.';
COMMENT ON COLUMN post_publication_dirty_work.lease_token IS 'Worker ownership token rotated by each successful lease claim.';
COMMENT ON COLUMN post_publication_dirty_work.leased_at IS 'Timestamp when the current worker lease was acquired.';
COMMENT ON COLUMN post_publication_dirty_work.lease_expires_at IS 'Timestamp after which another worker may claim this generation.';
COMMENT ON COLUMN post_publication_dirty_work.cursor_updated_at IS 'Timestamp of the latest generation-fenced cursor checkpoint.';
COMMENT ON TABLE post_publication_dirty_work_keys IS 'Typed retained tombstone keys for pending publication repair. Rows cascade on exact-generation acknowledgement.';
COMMENT ON COLUMN post_publication_dirty_work_keys.dirty_work_id IS 'Owning repair scope; exact acknowledgement cascades removal of its retained keys.';
COMMENT ON COLUMN post_publication_dirty_work_keys.kind IS 'Discriminator that determines which one of the typed key payload shapes is valid.';
COMMENT ON COLUMN post_publication_dirty_work_keys.uuid_value IS 'Retained impacted-entity or public-identity UUID selected by kind; no source FK preserves deletion repair.';
COMMENT ON COLUMN post_publication_dirty_work_keys.text_value IS 'Retained public cache identity selected by kind, including deleted slugs.';
COMMENT ON COLUMN post_publication_dirty_work_keys.post_type IS 'Exact sitemap post type retained for a sitemap target.';
COMMENT ON COLUMN post_publication_dirty_work_keys.day IS 'Exact UTC sitemap day retained for a sitemap target.';
