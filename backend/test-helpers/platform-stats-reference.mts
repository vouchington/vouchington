import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'

type PlatformStatsReference = {
  topic_count: number
  rss_feed_count: number
  post_count: number
  review_count: number
  data_point_count: number
  hostname_count: number
}

/** Historical live aggregate, retained only to compare a refreshed snapshot in an isolated test DB. */
export async function getPlatformStatsReference(): Promise<PlatformStatsReference> {
  const { rows } = await read<PlatformStatsReference>(sql`/* getPlatformStatsReference */
    SELECT
      (SELECT COUNT(*)::INTEGER FROM topics
       WHERE deleted_at IS NULL AND merged_into_topic_id IS NULL) AS topic_count,
      (SELECT COUNT(*)::INTEGER FROM rss_feeds
       JOIN view_rss_feed_current_states current_state
         ON current_state.rss_feed_id = rss_feeds.id
       WHERE deleted_at IS NULL AND current_state.is_enabled = TRUE) AS rss_feed_count,
      post_counts.post_count, post_counts.review_count, post_counts.data_point_count,
      (SELECT COUNT(*)::INTEGER FROM url_hostnames
       WHERE votes_count_up > 0 AND NOT is_blocked) AS hostname_count
    FROM (
      SELECT COUNT(*)::INTEGER AS post_count,
        COUNT(*) FILTER (WHERE post_type = 'review')::INTEGER AS review_count,
        COUNT(*) FILTER (WHERE post_type = 'data_point')::INTEGER AS data_point_count
      FROM view_public_post_eligibility
    ) post_counts
  `)
  return rows[0]!
}
