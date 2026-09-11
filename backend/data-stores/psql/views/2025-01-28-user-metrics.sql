CREATE OR REPLACE VIEW view_user_metrics AS
  SELECT
    'user_metrics' AS __entity_type,
    id,
    bookmarks__follow__topics_count,
    bookmarks__follow__posts_count,
    bookmarks__follow__users_count,
    bookmarkers__follow_count,
    bookmarks__updated_at
  FROM user_metrics
;
