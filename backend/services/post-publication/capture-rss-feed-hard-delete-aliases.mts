import type { TransactionQuery } from '@data-stores/psql'
import { POST_PUBLICATION_CAPTURE_BATCH_SIZE } from './constants.mts'
import {
  lockTopicAliasPublicationScopes,
  recordTopicAliasPublicationWork,
} from './capture-topic-alias.mts'

export async function lockRssFeedHardDeleteTopicAliasPublicationScopes(
  query: TransactionQuery,
  rssFeedId: string,
): Promise<void> {
  const { rows } = await query<{ topic_alias_id: string }>(
    `/* lockRssFeedHardDeleteTopicAliasPublicationScopes */
    SELECT DISTINCT category.topic_alias_id
    FROM rss_feed_item_categories category
    JOIN rss_feed_item_sources source ON source.rss_feed_item_id = category.rss_feed_item_id
    WHERE source.rss_feed_id = $1::uuid AND category.topic_alias_id IS NOT NULL
    ORDER BY category.topic_alias_id`,
    [rssFeedId],
  )
  await lockTopicAliasPublicationScopes(
    query,
    rows.map(row => row.topic_alias_id),
  )
}

/** Records category hashtag scopes before a feed cascade removes their only remaining source. */
export async function recordRssFeedHardDeleteTopicAliasPublicationScopes(
  query: TransactionQuery,
  rssFeedId: string,
): Promise<void> {
  let afterTopicAliasId: string | null = null
  while (true) {
    // oxlint-disable-next-line no-await-in-loop -- ascending alias pages preserve the publication scope lock order.
    const result = await query<{ topic_alias_id: string }>(
      `/* listRssFeedHardDeleteTopicAliasPublicationScopes */
      SELECT DISTINCT category.topic_alias_id
      FROM rss_feed_item_categories category
      JOIN rss_feed_item_sources source ON source.rss_feed_item_id = category.rss_feed_item_id
      WHERE source.rss_feed_id = $1::uuid
        AND category.topic_alias_id IS NOT NULL
        AND ($2::uuid IS NULL OR category.topic_alias_id > $2::uuid)
      ORDER BY category.topic_alias_id
      LIMIT $3`,
      [rssFeedId, afterTopicAliasId, POST_PUBLICATION_CAPTURE_BATCH_SIZE],
    )
    const rows: Array<{ topic_alias_id: string }> = result.rows
    if (rows.length === 0) return
    // oxlint-disable-next-line no-await-in-loop -- each alias scope page is bounded before the feed cascade.
    await recordTopicAliasPublicationWork(
      query,
      rows.map(row => row.topic_alias_id),
    )
    afterTopicAliasId = rows.at(-1)!.topic_alias_id
  }
}
