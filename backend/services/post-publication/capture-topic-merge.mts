import { retainPostPublicationImpacts } from './capture-impacts.mts'
import { recordPostPublicationChanges } from './capture-posts.mts'
import { getPostPublicationWorkLimit } from './work-limits.mts'
import type { TransactionQuery } from '@data-stores/psql'
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
    // oxlint-disable-next-line no-await-in-loop -- every feed capture is bounded to its ordered lock page.
    const feedWork = await recordRssFeedDiscoverabilityChanges(query, rssFeedIds)
    // oxlint-disable no-await-in-loop -- each feed page retains old and new topic projections before references move.
    // no-mistakes-disable-next-line query-reached-per-item: feed work and impact rows are bounded to the current configured capture page.
    await retainPostPublicationImpacts(
      query,
      new Map(
        feedWork.flatMap(work =>
          work.rss_feed_identity_id ? [[work.rss_feed_identity_id, work.id] as const] : [],
        ),
      ),
      rssFeedIds.map(scopeId => ({
        scopeId,
        impacts: {
          postIds: new Set<string>(),
          topicIds: new Set([sourceTopicId, destinationTopicId ?? sourceTopicId]),
        },
      })),
    )
    // oxlint-enable no-await-in-loop
    afterFeedId = feedRows.at(-1)!.id
  }

  await captureMergedTopicPosts(query, sourceTopicId, destinationTopicId ?? sourceTopicId)
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

async function captureMergedTopicPosts(
  query: TransactionQuery,
  sourceId: string,
  destinationId: string,
): Promise<void> {
  const limit = getPostPublicationWorkLimit('capture_batch_size')
  let after: string | null = null
  while (true) {
    // oxlint-disable-next-line no-await-in-loop -- globally sorted bounded post scopes precede reference mutation.
    const { rows }: { rows: Array<{ id: string }> } = await query(
      `/* captureMergedTopicPosts */ SELECT id FROM (
        -- no-mistakes-disable-next-line postgres-required-predicates: atomic topic merge reverse lookup must retain every source reference across partitions before repointing.
        SELECT post_id AS id FROM post_data_point_topics WHERE topic_id = $1::uuid
        -- no-mistakes-disable-next-line postgres-required-predicates: atomic topic merge reverse lookup must retain every source reference across partitions before repointing.
        UNION SELECT post_id FROM post_explicit_topic_categories WHERE topic_id = $1::uuid
        -- no-mistakes-disable-next-line postgres-required-predicates: atomic topic merge reverse lookup must retain every source reference across partitions before repointing.
        UNION SELECT post_id FROM post_review_topic_ratings WHERE topic_id = $1::uuid
        -- no-mistakes-disable-next-line postgres-required-predicates: atomic topic merge reverse lookup must retain every source reference across partitions before repointing.
        UNION SELECT post_id FROM post_topic_recommendations WHERE created_topic_id = $1::uuid
        -- no-mistakes-disable-next-line postgres-required-predicates: atomic topic merge reverse lookup must retain every source reference across partitions before repointing.
        UNION SELECT subject_id FROM relation__post__category__topic WHERE object_id = $1::uuid
        -- no-mistakes-disable-next-line postgres-required-predicates: atomic topic merge reverse lookup must retain every source reference across partitions before repointing.
        UNION SELECT subject_id FROM relation__post__mentioned__topic WHERE object_id = $1::uuid
        UNION SELECT object_id FROM relation__topic__related__post WHERE subject_id = $1::uuid
        UNION SELECT object_id FROM relation__topic__mentioned__post WHERE subject_id = $1::uuid
        UNION SELECT object_id FROM relation__topic__faq__post WHERE subject_id = $1::uuid
      ) affected WHERE ($2::uuid IS NULL OR id > $2::uuid) ORDER BY id LIMIT $3`,
      [sourceId, after, limit],
    )
    if (rows.length === 0) return
    // oxlint-disable no-await-in-loop -- capture every bounded page before changing its references.
    // no-mistakes-disable-next-line query-reached-per-item: each globally ordered capture page is bounded by the configured batch size and must lock before the atomic reference mutation.
    await recordPostPublicationChanges(
      query,
      'post_topics_changed',
      rows.map(row => ({
        postId: row.id,
        impactedTopicIds: [sourceId, destinationId],
      })),
    )
    // oxlint-enable no-await-in-loop
    after = rows.at(-1)!.id
  }
}
