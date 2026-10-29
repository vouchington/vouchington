import { getRssFeedItemsWorkLimit } from '@services/rss-feed-items/work-limits'
import { registerPostCommitAction } from '@data-stores/psql'
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
import { runCategoryTransaction } from './category-transaction.mts'
import { recordStoryPublicationChangesForCategoryTopics } from './story-publication-change.mts'
import {
  clearUnlinkedTopicAliasCategoryBatch,
  type CategoryClearRawPage,
} from './clear-unlinked-topic-alias-category-batch.mts'
async function clearCategoryBatch(
  topicAliasId: string,
  alias: string,
  formerTopicId: string | undefined,
  options: QueryOptions,
  rawPage: CategoryClearRawPage,
): Promise<{ updated: number; hasMore: boolean }> {
  const run = async (query: TransactionQuery) => {
    const { rows, hasMore } = await clearUnlinkedTopicAliasCategoryBatch(
      query,
      topicAliasId,
      alias,
      formerTopicId,
      rawPage,
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
  const result = await runCategoryTransaction(options, run)
  const { rows, statTargets, hasMore } = result
  if (rows.length === 0) return { updated: 0, hasMore }

  const publish = async () => {
    await publishEntityRelationElectionVoteStats(statTargets, { enqueueTopHashtagRefresh: false })
    await invalidateRssFeedItemChunks([...new Set(rows.map(row => row.rss_feed_item_id))])
  }
  if (options.query) registerPostCommitAction(options.query, publish)
  else await publish()
  return {
    updated: rows.length,
    hasMore,
  }
}

/** Applies one indexed raw item page for a durable alias generation. */
export function clearUnlinkedTopicAliasItemPage(
  topicAliasId: string,
  alias: string,
  rawPage: CategoryClearRawPage,
  options: QueryOptions = {},
): Promise<{ updated: number; hasMore: boolean }> {
  return clearCategoryBatch(topicAliasId, alias, undefined, options, rawPage)
}

/** The RSS worker supplies this to the topic unlink transaction before authored bindings go away. */
export async function clearTopicAliasUnlinkCategoryPage(
  query: TransactionQuery,
  aliasId: string,
  alias: string,
  rows: ReadonlyArray<{ rss_feed_item_id: string; category_identity_id: string }>,
): Promise<void> {
  await clearUnlinkedTopicAliasItemPage(
    aliasId,
    alias,
    { rows: [...rows], hasMore: false, match: 'alias_id' },
    { query },
  )
}

async function invalidateRssFeedItemChunks(itemIds: string[]): Promise<void> {
  const INVALIDATION_CHUNK_SIZE = getRssFeedItemsWorkLimit('backfill_invalidation_chunk_size')
  const [chunk, ...remaining] = chunkArray(itemIds, INVALIDATION_CHUNK_SIZE)
  if (!chunk) return
  await invalidateRssFeedItemsAndWaitForPurge(...chunk)
  return invalidateRssFeedItemChunks(remaining.flat())
}
