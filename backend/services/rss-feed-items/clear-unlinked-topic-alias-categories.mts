import { getRssFeedItemsWorkLimit } from '@services/rss-feed-items/work-limits'
import { beginTransaction, withTransactionOptions } from '@data-stores/psql'
import type { QueryOptions, TransactionQuery } from '@data-stores/psql/types'
import { invalidateRssFeedItemsAndWaitForPurge } from '@services/entity-cache/invalidate-rss-feed-items'
import {
  publishEntityRelationElectionVoteStats,
  updateEntityRelationElectionVoteStatsFromPrimaryBatch,
} from '@services/elections-votes/entity-relation/vote-stats-batch'
import {
  clearCategorizerVotesInTransaction,
  getClearedCategorizerVoteStatTargets,
} from './category-topic-votes.mts'
import { createCategoryTopicRelationsInTransaction } from './category-relations.mts'
import { markRssFeedItemCategorySnapshotsForReconciliation } from './category-snapshot-reconciliations.mts'
import { chunkArray } from './processing-limits.mts'
import { recordStoryPublicationChangesForCategoryTopics } from './story-publication-change.mts'
import { clearUnlinkedTopicAliasCategoryBatch } from './clear-unlinked-topic-alias-category-batch.mts'
import { clearUnlinkedTopicAliasFeedCategories } from './clear-unlinked-topic-alias-feed-categories.mts'
/**
 * Re-resolves mappings for an alias that no longer has an active topic owner.
 *
 * A standalone hashtag alias remains the source of truth for `topic_alias_id`; only the derived
 * topic mapping changes. Name/slug matches are considered after the alias match disappears so an
 * RSS category can continue to map to a different active topic with the same public key.
 */
export async function clearUnlinkedTopicAliasCategories(
  topicAliasId: string,
  alias: string,
  formerTopicId: string | undefined,
  options: QueryOptions,
): Promise<{ updated: number; hasMore: boolean }> {
  const feedBatchSize = getRssFeedItemsWorkLimit('category_clear_batch_size')
  const feedUpdated = await runInTransaction(options, query =>
    clearUnlinkedTopicAliasFeedCategories(query, topicAliasId, alias, formerTopicId, feedBatchSize),
  )
  const itemResult = await clearCategoryBatch(topicAliasId, alias, formerTopicId, options)
  return {
    updated: feedUpdated + itemResult.updated,
    hasMore: feedUpdated === feedBatchSize || itemResult.hasMore,
  }
}
async function clearCategoryBatch(
  topicAliasId: string,
  alias: string,
  formerTopicId: string | undefined,
  options: QueryOptions,
): Promise<{ updated: number; hasMore: boolean }> {
  const run = async (query: TransactionQuery) => {
    const { rows, hasMore } = await clearUnlinkedTopicAliasCategoryBatch(
      query,
      topicAliasId,
      alias,
      formerTopicId,
    )
    const [clearedVotes, createdTargets] = await Promise.all([
      clearCategorizerVotesInTransaction(
        rows.flatMap(row =>
          row.replacement_topic_id && row.replacement_topic_id === row.topic_id
            ? []
            : [{ rss_feed_item_id: row.rss_feed_item_id, topic_id: row.topic_id }],
        ),
        query,
      ),
      createCategoryTopicRelationsInTransaction(
        rows.flatMap(row =>
          row.replacement_topic_id
            ? [{ rss_feed_item_id: row.rss_feed_item_id, topic_id: row.replacement_topic_id }]
            : [],
        ),
        query,
      ),
    ])
    const statTargets = [...createdTargets, ...getClearedCategorizerVoteStatTargets(clearedVotes)]
    await updateEntityRelationElectionVoteStatsFromPrimaryBatch(statTargets, {
      query,
      invalidateCache: false,
      enqueueTopHashtagRefresh: false,
    })
    await Promise.all([
      markRssFeedItemCategorySnapshotsForReconciliation(query, [
        ...new Set(rows.map(row => row.rss_feed_item_id)),
      ]),
      recordStoryPublicationChangesForCategoryTopics(
        query,
        rows.map(row => ({
          rss_feed_item_id: row.rss_feed_item_id,
          previous_topic_id: row.topic_id,
          topic_id: row.replacement_topic_id,
        })),
      ),
    ])
    return { rows, statTargets, hasMore }
  }
  const result = await runInTransaction(options, run)
  const { rows, statTargets, hasMore } = result
  if (rows.length === 0) return { updated: 0, hasMore }

  await publishEntityRelationElectionVoteStats(statTargets, { enqueueTopHashtagRefresh: false })
  await invalidateRssFeedItemChunks([...new Set(rows.map(row => row.rss_feed_item_id))])
  return {
    updated: rows.length,
    hasMore,
  }
}

async function runInTransaction<Result>(
  options: QueryOptions,
  run: (query: TransactionQuery) => Promise<Result>,
): Promise<Result> {
  if (options.query || options.client) return withTransactionOptions(options, run)
  await using transaction = await beginTransaction()
  const result = await run(transaction)
  await transaction.commit()
  return result
}
async function invalidateRssFeedItemChunks(itemIds: string[]): Promise<void> {
  const INVALIDATION_CHUNK_SIZE = getRssFeedItemsWorkLimit('backfill_invalidation_chunk_size')
  const [chunk, ...remaining] = chunkArray(itemIds, INVALIDATION_CHUNK_SIZE)
  if (!chunk) return
  await invalidateRssFeedItemsAndWaitForPurge(...chunk)
  return invalidateRssFeedItemChunks(remaining.flat())
}
