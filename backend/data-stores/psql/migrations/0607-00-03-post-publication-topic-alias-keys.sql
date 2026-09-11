ALTER TABLE post_publication_dirty_work_keys
  DROP CONSTRAINT post_publication_dirty_work_keys_kind_check,
  DROP CONSTRAINT post_publication_dirty_work_keys_check;

ALTER TABLE post_publication_dirty_work_keys
  ADD CONSTRAINT post_publication_dirty_work_keys_kind_check CHECK (kind IN (
    'impact_post', 'impact_topic', 'impact_community', 'impact_rss_feed_item',
    'identity_author', 'identity_author_username',
    'identity_community', 'identity_rss_feed', 'identity_post_slug', 'identity_community_slug',
    'identity_topic_alias', 'sitemap_target'
  )) NOT VALID,
  ADD CONSTRAINT post_publication_dirty_work_keys_check CHECK (
    (kind IN (
      'impact_post', 'impact_topic', 'impact_community', 'impact_rss_feed_item', 'identity_author',
      'identity_community', 'identity_rss_feed'
    )
      AND uuid_value IS NOT NULL AND text_value IS NULL AND post_type IS NULL AND day IS NULL)
    OR
    (kind IN (
      'identity_author_username', 'identity_post_slug', 'identity_community_slug',
      'identity_topic_alias'
    )
      AND uuid_value IS NULL AND text_value IS NOT NULL
      AND char_length(text_value) BETWEEN 1 AND 255
      AND post_type IS NULL AND day IS NULL)
    OR
    (kind = 'sitemap_target'
      AND uuid_value IS NULL AND text_value IS NULL AND post_type IS NOT NULL AND day IS NOT NULL)
  ) NOT VALID;

ALTER TABLE post_publication_dirty_work_keys
  VALIDATE CONSTRAINT post_publication_dirty_work_keys_kind_check;

ALTER TABLE post_publication_dirty_work_keys
  VALIDATE CONSTRAINT post_publication_dirty_work_keys_check;
