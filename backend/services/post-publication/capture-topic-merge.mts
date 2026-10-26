import { impactPublicationKeys } from './captured-keys.mts'
import { enqueueCapturedPublicationChangeAfterCommit } from './direct-capture.mts'
import { getPostPublicationWorkLimit } from './work-limits.mts'
import type { TransactionQuery } from '@data-stores/psql'
import { lockPostPublicationRssFeedScopes } from './capture-rss-feeds.mts'

/** Retains feed and hashtag projections before merging a feed's owning topic. */
export async function recordTopicMergePublicationChanges(
  query: TransactionQuery,
  sourceTopicId: string,
  lockedTopicAliasIds: ReadonlySet<string>,
  destinationTopicId?: string,
): Promise<void> {
  const POST_PUBLICATION_CAPTURE_BATCH_SIZE = getPostPublicationWorkLimit('capture_batch_size')
  let afterFeedId: string | null = null
  while (true) {
    // oxlint-disable-next-line no-await-in-loop -- every feed page is locked and captured in ascending order.
    const feedResult = await query<{ id: string }>(
      `/* listTopicMergeRssFeedPublicationScopes */
      SELECT id FROM (
        SELECT id FROM rss_feeds WHERE topic_id = $1::uuid AND deleted_at IS NULL
        UNION
        SELECT category.rss_feed_id FROM rss_feed_categories category
        JOIN rss_feeds feed ON feed.id = category.rss_feed_id AND feed.deleted_at IS NULL
        WHERE category.topic_id = $1::uuid
        UNION
        -- no-mistakes-disable-next-line postgres-required-predicates: atomic topic merge reverse lookup must retain every source reference across partitions before repointing.
        SELECT source.rss_feed_id FROM rss_feed_item_categories category
        JOIN rss_feed_item_sources source ON source.rss_feed_item_id = category.rss_feed_item_id
        JOIN rss_feeds feed ON feed.id = source.rss_feed_id AND feed.deleted_at IS NULL
        WHERE category.topic_id = $1::uuid
        UNION
        -- no-mistakes-disable-next-line postgres-required-predicates: atomic topic merge reverse lookup must retain every source reference across partitions before repointing.
        SELECT source.rss_feed_id FROM relation__rss_feed_item__category__topic relation
        JOIN rss_feed_item_sources source ON source.rss_feed_item_id = relation.subject_id
        JOIN rss_feeds feed ON feed.id = source.rss_feed_id AND feed.deleted_at IS NULL
        WHERE relation.object_id = $1::uuid
      ) affected
      WHERE ($2::uuid IS NULL OR id > $2::uuid)
      ORDER BY id LIMIT $3`,
      [sourceTopicId, afterFeedId, POST_PUBLICATION_CAPTURE_BATCH_SIZE],
    )
    const feedRows: Array<{ id: string }> = feedResult.rows
    if (feedRows.length === 0) break
    const rssFeedIds = feedRows.map(row => row.id)
    // oxlint-disable-next-line no-await-in-loop -- transaction-scoped feed locks survive through the later alias validation.
    await lockPostPublicationRssFeedScopes(query, rssFeedIds)
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
    if (topicAliasRows.length === 0) break
    if (!topicAliasRows.every(row => lockedTopicAliasIds.has(row.topic_alias_id)))
      throw createTopicMergePublicationScopeConflict()
    afterTopicAliasId = topicAliasRows.at(-1)!.topic_alias_id
  }
  // All moved references survive on the destination. A single immutable change starts
  // destination-scoped indexed pages after commit instead of retaining one action per old row.
  enqueueCapturedPublicationChangeAfterCommit(query, {
    scope: { type: 'topic', topicId: destinationTopicId ?? sourceTopicId },
    reason: 'post_topics_changed',
    keys: impactPublicationKeys({ topicIds: [sourceTopicId, destinationTopicId ?? sourceTopicId] }),
  })
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
