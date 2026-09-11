import { createAsyncGeneratorFromCursor } from '@data-stores/psql'
import sql from 'sql-template-strings'

/** Streams followed RSS feeds for the given user with source details. */
export function streamFollowedRssFeeds(userId: string) {
  return createAsyncGeneratorFromCursor<Record<string, unknown>>(sql`/* streamFollowedRssFeeds */
    SELECT
      rf.id AS rss_feed_id,
      rf.title,
      u.url AS rss_feed_url,
      t.id AS topic_id,
      t.name AS topic_name,
      t.slug AS topic_slug,
      CASE
        WHEN uh.hostname IS NOT NULL THEN CONCAT('https://', uh.hostname, '/')
        ELSE NULL
      END AS home_page_url,
      r.created_at
    FROM relation__user__follow__rss_feed r
    JOIN rss_feeds rf ON rf.id = r.object_id
    JOIN urls u ON u.id = rf.rss_feed_url_id
    JOIN topics t ON t.id = rf.topic_id
    LEFT JOIN url_hostnames uh ON uh.id = t.hostname_id
    WHERE r.subject_id = ${userId}
      AND r.deleted_at IS NULL
      AND rf.deleted_at IS NULL
      AND t.deleted_at IS NULL
      AND t.merged_into_topic_id IS NULL
    ORDER BY rf.title ASC, rf.id ASC
  `)
}
