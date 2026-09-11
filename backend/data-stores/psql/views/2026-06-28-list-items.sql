-- Unified read-model view over all list item junction tables.
-- Only active (non-removed) rows are included; removed_at IS NULL is enforced per-branch.
-- media_type comes from the rss_feed_items table for RSS items; NULL for posts.
CREATE OR REPLACE VIEW view_list_items AS
  SELECT
    li.id,
    li.list_id,
    'rss_feed_item'::list_item_types AS item_type,
    li.rss_feed_item_id AS entity_id,
    li.order_index,
    li.created_at,
    rfi.media_type::TEXT AS media_type
  FROM list_items__rss_feed_items li
  JOIN rss_feed_items rfi ON rfi.id = li.rss_feed_item_id AND rfi.deleted_at IS NULL
  WHERE li.removed_at IS NULL
UNION ALL
  SELECT
    li.id,
    li.list_id,
    'post'::list_item_types AS item_type,
    li.post_id AS entity_id,
    li.order_index,
    li.created_at,
    NULL::TEXT AS media_type
  FROM list_items__posts li
  WHERE li.removed_at IS NULL;
