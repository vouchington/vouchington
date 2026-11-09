import { rssFollowSignalEligibilitySql } from './rss-follow-signal-eligibility.mts'
import { getRecommendedRssFeedsWorkLimit } from './work-limits.mts'

/**
 * The collaborative arm: the viewer's newest N follows, each feed's newest M co-followers, and
 * each co-follower's newest K follows, so the expansion is bounded by N x M x K before scoring.
 * Each step is an index-ordered LIMIT: `subject__newest` for the first and third, and
 * `object__newest` for the second. Caller defines `viewer`, `user_followed_feeds` and
 * `user_muted_feeds` and binds the viewer as `$1`.
 */
export function collaborativeFeedsCtesSql(): string {
  const viewerFeedLimit = getRecommendedRssFeedsWorkLimit('collaborative_viewer_feed_limit')
  const coFollowerLimit = getRecommendedRssFeedsWorkLimit('collaborative_co_follower_limit')
  const coFollowerFeedLimit = getRecommendedRssFeedsWorkLimit(
    'collaborative_co_follower_feed_limit',
  )
  return `
    collaborative_seed_feeds AS (
      SELECT object_id AS feed_id
      FROM relation__user__follow__rss_feed
      WHERE subject_id = $1
        AND deleted_at IS NULL
      ORDER BY created_at DESC, object_id DESC
      LIMIT ${viewerFeedLimit}
    ),
    -- Collaborative feeds (weight 2.0): feeds followed by users who share feed overlap
    collaborative_feeds AS (
      SELECT
        co_followed.object_id AS feed_id,
        2.0 AS score,
        'collaborative'::TEXT AS reason
      FROM collaborative_seed_feeds seed
      CROSS JOIN LATERAL (
        SELECT ufr1.subject_id
        FROM relation__user__follow__rss_feed ufr1
        WHERE ufr1.object_id = seed.feed_id
          AND ufr1.subject_id != $1
          AND ufr1.deleted_at IS NULL
        ORDER BY ufr1.created_at DESC, ufr1.subject_id DESC
        LIMIT ${coFollowerLimit}
      ) co_follower
      JOIN users source_user ON source_user.id = co_follower.subject_id
      CROSS JOIN viewer
      CROSS JOIN LATERAL (
        SELECT ufr2.object_id
        FROM relation__user__follow__rss_feed ufr2
        WHERE ufr2.subject_id = co_follower.subject_id
          AND ufr2.deleted_at IS NULL
        ORDER BY ufr2.created_at DESC, ufr2.object_id DESC
        LIMIT ${coFollowerFeedLimit}
      ) co_followed
      JOIN rss_feeds rf
        ON rf.id = co_followed.object_id
        AND rf.deleted_at IS NULL
      JOIN view_rss_feed_current_states current_state
        ON current_state.rss_feed_id = rf.id
        AND current_state.is_enabled = TRUE
        AND current_state.is_discoverable = TRUE
      WHERE ${rssFollowSignalEligibilitySql}
        AND NOT EXISTS (SELECT 1 FROM user_followed_feeds WHERE user_followed_feeds.feed_id = co_followed.object_id)
        AND NOT EXISTS (SELECT 1 FROM user_muted_feeds WHERE user_muted_feeds.feed_id = co_followed.object_id)
    ),`
}
