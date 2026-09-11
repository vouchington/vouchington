import type { TransactionQuery } from '@data-stores/psql'
import { POST_PUBLICATION_CAPTURE_BATCH_SIZE } from './constants.mts'
import {
  lockPostPublicationRssFeedScopes,
  recordRssFeedDiscoverabilityChanges,
} from './capture-rss-feeds.mts'
import { recordTopicAliasPublicationWork } from './capture-topic-alias.mts'

/** Retains feed and hashtag projections before merging a feed's owning topic. */
export async function recordTopicMergePublicationChanges(
  query: TransactionQuery,
  sourceTopicId: string,
  lockedTopicAliasIds: ReadonlySet<string>,
): Promise<void> {
  let afterFeedId: string | null = null
  while (true) {
    // oxlint-disable-next-line no-await-in-loop -- every feed page is locked and captured in ascending order.
    const feedResult = await query<{ id: string }>(
      `/* listTopicMergeRssFeedPublicationScopes */
      SELECT id
      FROM rss_feeds
      WHERE topic_id = $1::uuid
        AND deleted_at IS NULL
        AND ($2::uuid IS NULL OR id > $2::uuid)
      ORDER BY id
      LIMIT $3`,
      [sourceTopicId, afterFeedId, POST_PUBLICATION_CAPTURE_BATCH_SIZE],
    )
    const feedRows: Array<{ id: string }> = feedResult.rows
    if (feedRows.length === 0) break
    const rssFeedIds = feedRows.map(row => row.id)
    // oxlint-disable-next-line no-await-in-loop -- transaction-scoped feed locks survive through the later alias validation.
    await lockPostPublicationRssFeedScopes(query, rssFeedIds)
    // oxlint-disable-next-line no-await-in-loop -- every feed capture is bounded to its ordered lock page.
    await recordRssFeedDiscoverabilityChanges(query, rssFeedIds)
    afterFeedId = feedRows.at(-1)!.id
  }

  let afterTopicAliasId: string | null = null
  while (true) {
    // oxlint-disable-next-line no-await-in-loop -- every alias page is fresh-scanned after all feed locks are held.
    const aliasResult = await query<{ topic_alias_id: string }>(
      `/* listTopicMergeRssCategoryAliasPublicationScopes */
      SELECT DISTINCT category.topic_alias_id
      FROM rss_feed_item_categories category
      WHERE category.topic_alias_id IS NOT NULL
        AND ($2::uuid IS NULL OR category.topic_alias_id > $2::uuid)
        AND EXISTS (
          SELECT 1
          FROM rss_feed_item_sources source
          JOIN rss_feeds feed ON feed.id = source.rss_feed_id
          WHERE source.rss_feed_item_id = category.rss_feed_item_id
            AND feed.topic_id = $1::uuid AND feed.deleted_at IS NULL
        )
      ORDER BY category.topic_alias_id
      LIMIT $3`,
      [sourceTopicId, afterTopicAliasId, POST_PUBLICATION_CAPTURE_BATCH_SIZE],
    )
    const topicAliasRows: Array<{ topic_alias_id: string }> = aliasResult.rows
    if (topicAliasRows.length === 0) return
    if (!topicAliasRows.every(row => lockedTopicAliasIds.has(row.topic_alias_id)))
      throw createTopicMergePublicationScopeConflict()
    // oxlint-disable-next-line no-await-in-loop -- every validated alias page reuses pre-acquired advisory scopes.
    await recordTopicAliasPublicationWork(
      query,
      topicAliasRows.map(row => row.topic_alias_id),
    )
    afterTopicAliasId = topicAliasRows.at(-1)!.topic_alias_id
  }
}

class TopicMergePublicationScopeConflictError extends Error {
  readonly status = 409

  constructor() {
    super('Topic aliases changed while acquiring publication scopes; retry the request')
    this.name = 'TopicMergePublicationScopeConflictError'
  }
}

function createTopicMergePublicationScopeConflict(): TopicMergePublicationScopeConflictError {
  return new TopicMergePublicationScopeConflictError()
}
