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

CREATE OR REPLACE FUNCTION fn_update_user_bookmark_stats_for_user_id(target_user_id UUID)
RETURNS VOID AS $$
  UPDATE user_metrics
  SET
    bookmarks__updated_at = CURRENT_TIMESTAMP,
    bookmarks__follow__topics_count = (
      SELECT COUNT(*) FROM relation__user__follow__topic
      WHERE subject_id = target_user_id AND deleted_at IS NULL
    ),
    bookmarks__follow__posts_count = (
      SELECT COUNT(*) FROM relation__user__follow__post
      WHERE subject_id = target_user_id AND deleted_at IS NULL
    ),
    bookmarks__follow__users_count = (
      SELECT COUNT(*) FROM relation__user__follow__user
      WHERE subject_id = target_user_id AND deleted_at IS NULL
    ),
    bookmarkers__follow_count = (
      SELECT COUNT(*) FROM relation__user__follow__user
      WHERE object_id = target_user_id AND deleted_at IS NULL
    )
  WHERE id = target_user_id;
$$ LANGUAGE sql;
