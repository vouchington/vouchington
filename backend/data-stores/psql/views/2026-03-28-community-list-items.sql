-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE OR REPLACE VIEW view_community_list_items AS
  SELECT
    id,
    community_id,
    'topic'::community_list_item_types AS item_type,
    topic_id AS entity_id,
    order_index,
    added_by_id,
    created_at
  FROM community_list_topics
  WHERE removed_at IS NULL

  UNION ALL

  SELECT
    id,
    community_id,
    'rss_feed'::community_list_item_types AS item_type,
    rss_feed_id AS entity_id,
    order_index,
    added_by_id,
    created_at
  FROM community_list_rss_feeds
  WHERE removed_at IS NULL

  UNION ALL

  SELECT
    id,
    community_id,
    'post'::community_list_item_types AS item_type,
    post_id AS entity_id,
    order_index,
    added_by_id,
    created_at
  FROM community_list_posts
  WHERE removed_at IS NULL

  UNION ALL

  SELECT
    id,
    community_id,
    'url_hostname'::community_list_item_types AS item_type,
    url_hostname_id AS entity_id,
    order_index,
    added_by_id,
    created_at
  FROM community_list_url_hostnames
  WHERE removed_at IS NULL

  UNION ALL

  SELECT
    id,
    community_id,
    'url'::community_list_item_types AS item_type,
    url_id AS entity_id,
    order_index,
    added_by_id,
    created_at
  FROM community_list_urls
  WHERE removed_at IS NULL;

COMMENT ON VIEW view_community_list_items IS 'Community list content projection; callers enforce list visibility and row access.';
