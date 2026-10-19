/**
 * Another account's followed feeds may drive a recommendation only when that account is still
 * active, has not restricted processing, and the viewer is allowed to see those follows.
 * `viewer.is_administrator` bypasses the audience check and does not bypass processing restriction.
 * Caller joins `users source_user` and the one-row `viewer` CTE.
 */
export const rssFollowSignalEligibilitySql = `
  source_user.deleted_at IS NULL
  AND source_user.processing_restricted_at IS NULL
  AND (
    viewer.is_administrator
    OR source_user.rss_feed_follows_visibility IN ('everyone', 'users')
    OR (
      source_user.rss_feed_follows_visibility = 'followers'
      AND EXISTS (
        SELECT 1
        FROM relation__user__follow__user viewer_follows_source
        WHERE viewer_follows_source.subject_id = $1
          AND viewer_follows_source.object_id = source_user.id
          AND viewer_follows_source.deleted_at IS NULL
      )
    )
    OR (
      source_user.rss_feed_follows_visibility = 'mutual_followers'
      AND EXISTS (
        SELECT 1
        FROM relation__user__follow__user viewer_follows_source
        WHERE viewer_follows_source.subject_id = $1
          AND viewer_follows_source.object_id = source_user.id
          AND viewer_follows_source.deleted_at IS NULL
      )
      AND EXISTS (
        SELECT 1
        FROM relation__user__follow__user source_follows_viewer
        WHERE source_follows_viewer.subject_id = source_user.id
          AND source_follows_viewer.object_id = $1
          AND source_follows_viewer.deleted_at IS NULL
      )
    )
  )
`
