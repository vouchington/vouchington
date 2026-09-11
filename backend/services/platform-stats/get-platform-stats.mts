import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type { PlatformStats } from './types.mts'

export async function getPlatformStats(): Promise<PlatformStats> {
  const query = sql`/* getPlatformStats */
    SELECT
      (SELECT COUNT(*)::INTEGER
       FROM topics
       WHERE deleted_at IS NULL AND merged_into_topic_id IS NULL) AS topic_count,
      (SELECT COUNT(*)::INTEGER
       FROM rss_feeds
       JOIN view_rss_feed_current_states current_state
         ON current_state.rss_feed_id = rss_feeds.id
       WHERE deleted_at IS NULL AND current_state.is_enabled = TRUE) AS rss_feed_count,
      post_counts.post_count,
      post_counts.review_count,
      post_counts.data_point_count,
      (SELECT COUNT(*)::INTEGER FROM url_hostnames WHERE votes_count_up > 0 AND blocked IS NOT TRUE) AS hostname_count
    FROM (
      SELECT
        COUNT(*)::INTEGER AS post_count,
        COUNT(*) FILTER (WHERE post_type = 'review')::INTEGER AS review_count,
        COUNT(*) FILTER (WHERE post_type = 'data_point')::INTEGER AS data_point_count
      FROM view_public_post_eligibility eligibility
    ) post_counts
  `

  const { rows } = await read(query)
  return rows[0]
}
