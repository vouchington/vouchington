import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'

export type RssFeedWithTopicForDiscoverability = {
  id: string
  topic_id: string
  deleted_at: Date | null
  topic_votes_score_net: number
}

export async function getRssFeedWithTopicForDiscoverability(
  rssFeedId: string,
): Promise<RssFeedWithTopicForDiscoverability | null> {
  const { rows } = await read(sql`/* getRssFeedWithTopicForDiscoverability */
    SELECT
      rss_feeds.id,
      rss_feeds.topic_id,
      rss_feeds.deleted_at,
      topics.votes_score_net AS topic_votes_score_net
    FROM rss_feeds
    JOIN topics ON topics.id = rss_feeds.topic_id
    WHERE rss_feeds.id = ${rssFeedId}
      AND topics.deleted_at IS NULL
      AND topics.merged_into_topic_id IS NULL
    LIMIT 1
  `)
  return (rows[0] as RssFeedWithTopicForDiscoverability | undefined) ?? null
}
