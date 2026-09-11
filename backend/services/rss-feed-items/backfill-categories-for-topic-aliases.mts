import { beginTransaction, withTransactionOptions } from '@data-stores/psql'
import type { QueryOptions, TransactionQuery } from '@data-stores/psql/types'
import { enqueueRefreshTopHashtags } from '@queues/psql/enqueues'
import { invalidateRssFeedItemsAndWaitForPurge } from '@services/entity-cache/invalidate-rss-feed-items'
import { createCategoryTopicRelationsInTransaction } from './category-relations.mts'
import {
  clearCategorizerVotesInTransaction,
  getClearedCategorizerVoteStatTargets,
} from './category-topic-votes.mts'
import { chunkArray } from './processing-limits.mts'
import {
  publishEntityRelationElectionVoteStats,
  updateEntityRelationElectionVoteStatsFromPrimaryBatch,
} from '@services/elections-votes/entity-relation/vote-stats-batch'
import { markRssFeedItemCategorySnapshotsForReconciliation } from './category-snapshot-reconciliations.mts'
import {
  lockRssFeedItemsForStoryPublicationChanges,
  recordStoryPublicationChangesForCategoryTopics,
} from './story-publication-change.mts'

const CATEGORY_BACKFILL_BATCH_SIZE = 500
const INVALIDATION_CHUNK_SIZE = 100

// Backfills topic_id by alias (overwrites stale assignments), or by topic name/slug (fills nulls only).
export async function backfillCategoriesForTopicAliases(
  topicId: string,
  options: QueryOptions = {},
): Promise<{ updated: number }> {
  return backfillCategoryBatch(topicId, 0, options)
}

async function backfillCategoryBatch(
  topicId: string,
  updated: number,
  options: QueryOptions,
): Promise<{ updated: number }> {
  const run = async (query: TransactionQuery) => {
    const { rows: candidateItems } = await query<{ rss_feed_item_id: string }>(
      `/* backfillCategoriesForTopicAliases.candidateItems */
      SELECT DISTINCT rss_feed_item_id FROM (
        SELECT rss_feed_item_id, category_text
        FROM rss_feed_item_categories
        WHERE
          ((
            (topic_alias_id IN (SELECT id FROM topic_aliases WHERE topic_id = $1)
              OR LOWER(category_text) IN (SELECT alias FROM topic_aliases WHERE topic_id = $1))
            AND (topic_id IS NULL OR topic_id != $1)
          )
          OR (topic_id IS NULL AND LOWER(category_text) = (SELECT LOWER(name) FROM topics WHERE id = $1 AND deleted_at IS NULL AND merged_into_topic_id IS NULL))
          OR (topic_id IS NULL AND LOWER(category_text) = (SELECT slug FROM topics WHERE id = $1 AND deleted_at IS NULL AND merged_into_topic_id IS NULL)))
        ORDER BY rss_feed_item_id, category_text LIMIT $2
      ) candidates ORDER BY rss_feed_item_id`,
      [topicId, CATEGORY_BACKFILL_BATCH_SIZE],
    )
    const candidateItemIds = candidateItems.map(row => row.rss_feed_item_id)
    await lockRssFeedItemsForStoryPublicationChanges(query, candidateItemIds)
    const { rows } = await query<{
      rss_feed_item_id: string
      previous_topic_id: string | null
    }>(
      `/* backfillCategoriesForTopicAliases */
      WITH candidates AS (
        SELECT rss_feed_item_id, category_text, topic_id AS previous_topic_id
        FROM rss_feed_item_categories
        WHERE rss_feed_item_id = ANY($3::uuid[]) AND (
          ((
            topic_alias_id IN (SELECT id FROM topic_aliases WHERE topic_id = $1)
            OR LOWER(category_text) IN (SELECT alias FROM topic_aliases WHERE topic_id = $1)
          ) AND (topic_id IS NULL OR topic_id != $1))
          OR (topic_id IS NULL AND LOWER(category_text) = (SELECT LOWER(name) FROM topics WHERE id = $1 AND deleted_at IS NULL AND merged_into_topic_id IS NULL))
          OR (topic_id IS NULL AND LOWER(category_text) = (SELECT slug FROM topics WHERE id = $1 AND deleted_at IS NULL AND merged_into_topic_id IS NULL)))
        ORDER BY rss_feed_item_id, category_text
        LIMIT $2
        FOR UPDATE
      )
      UPDATE rss_feed_item_categories target
      SET topic_id = $1
      FROM candidates
      WHERE target.rss_feed_item_id = candidates.rss_feed_item_id
        AND target.category_text = candidates.category_text
      RETURNING target.rss_feed_item_id, candidates.previous_topic_id
    `,
      [topicId, CATEGORY_BACKFILL_BATCH_SIZE, candidateItemIds],
    )
    const changedItemIds = [...new Set(rows.map(row => row.rss_feed_item_id))]
    const [createdTargets, clearedVotes] = await Promise.all([
      createCategoryTopicRelationsInTransaction(
        changedItemIds.map(itemId => ({ rss_feed_item_id: itemId, topic_id: topicId })),
        query,
      ),
      clearCategorizerVotesInTransaction(
        rows.flatMap(row =>
          row.previous_topic_id && row.previous_topic_id !== topicId
            ? [{ rss_feed_item_id: row.rss_feed_item_id, topic_id: row.previous_topic_id }]
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
      markRssFeedItemCategorySnapshotsForReconciliation(query, changedItemIds),
      recordStoryPublicationChangesForCategoryTopics(
        query,
        rows.map(row => ({
          rss_feed_item_id: row.rss_feed_item_id,
          previous_topic_id: row.previous_topic_id,
          topic_id: topicId,
        })),
      ),
    ])
    return { rows, changedItemIds, statTargets }
  }
  const result = await runInTransaction(options, run)
  const { rows, changedItemIds, statTargets } = result
  if (rows.length === 0) return { updated }
  await publishEntityRelationElectionVoteStats(statTargets, { enqueueTopHashtagRefresh: false })
  await invalidateRssFeedItemChunks(changedItemIds)
  void enqueueRefreshTopHashtags()
  return backfillCategoryBatch(topicId, updated + rows.length, options)
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
  const [chunk, ...remaining] = chunkArray(itemIds, INVALIDATION_CHUNK_SIZE)
  if (!chunk) return
  await invalidateRssFeedItemsAndWaitForPurge(...chunk)
  return invalidateRssFeedItemChunks(remaining.flat())
}
