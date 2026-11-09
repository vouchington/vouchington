CREATE OR REPLACE FUNCTION fn_update_topic_bookmark_stats_for_topic_id(target_topic_id UUID)
RETURNS VOID AS $$
  UPDATE topic_metrics
  SET
    bookmarks__updated_at = CURRENT_TIMESTAMP,
    bookmarks__follow_count = (
      SELECT COUNT(*)
      FROM relation__user__follow__topic
      WHERE object_id = target_topic_id AND deleted_at IS NULL
    )
  WHERE topic_id = target_topic_id;
$$ LANGUAGE sql;
