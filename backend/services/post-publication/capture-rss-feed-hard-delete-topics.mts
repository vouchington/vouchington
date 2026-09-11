import type { TransactionQuery } from '@data-stores/psql'
import { retainPostPublicationImpactKeys } from './capture-keys.mts'

const RSS_FEED_HARD_DELETE_CAPTURE_BATCH_SIZE = 500

export async function retainRssFeedHardDeleteTopicImpacts(
  query: TransactionQuery,
  rssFeedId: string,
  dirtyWorkId: string,
): Promise<void> {
  let afterTopicId: string | null = null
  while (true) {
    // oxlint-disable-next-line no-await-in-loop -- each retained topic page is bounded.
    const result = await query<{ topic_id: string }>(
      `/* getRssFeedHardDeleteTopicImpacts */
      SELECT topic_id FROM (
        SELECT feed.topic_id
        FROM rss_feeds feed
        WHERE feed.id = $1::uuid
        UNION
        SELECT category.topic_id
        FROM rss_feed_item_categories category
        JOIN rss_feed_item_sources source ON source.rss_feed_item_id = category.rss_feed_item_id
        WHERE source.rss_feed_id = $1::uuid AND category.topic_id IS NOT NULL
      ) topics
      WHERE $2::uuid IS NULL OR topic_id > $2::uuid
      ORDER BY topic_id
      LIMIT $3`,
      [rssFeedId, afterTopicId, RSS_FEED_HARD_DELETE_CAPTURE_BATCH_SIZE],
    )
    const rows: Array<{ topic_id: string }> = result.rows
    if (rows.length === 0) return
    // oxlint-disable-next-line no-await-in-loop -- each retained topic impact page is bounded.
    await retainPostPublicationImpactKeys(query, dirtyWorkId, {
      topicIds: rows.map(row => row.topic_id),
    })
    afterTopicId = rows.at(-1)!.topic_id
  }
}
