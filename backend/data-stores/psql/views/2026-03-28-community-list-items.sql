CREATE OR REPLACE VIEW view_community_list_items AS
  SELECT
    id,
    community_id,
    'topic'::community_list_item_types AS item_type,
    topic_id AS entity_id,
    order_index,
    added_by_id,
    created_at
  FROM community_list_items__topics
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
  FROM community_list_items__rss_feeds
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
  FROM community_list_items__posts
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
  FROM community_list_items__url_hostnames
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
  FROM community_list_items__urls
  WHERE removed_at IS NULL;
