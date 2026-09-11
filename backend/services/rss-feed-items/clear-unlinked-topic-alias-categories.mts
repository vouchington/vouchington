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
const INVALIDATION_CHUNK_SIZE = 100
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
): Promise<{ updated: number }> {
  const clearFeedCategories = (query: TransactionQuery) =>
    query(
      `/* clearCategoriesForUnlinkedTopicAlias.feedCategories */
        WITH candidates AS (
          SELECT
            feed_category.rss_feed_id,
            feed_category.category_text,
            replacement.topic_id AS replacement_topic_id
          FROM rss_feed_categories feed_category
          LEFT JOIN topic_aliases source_alias ON source_alias.id = $1
          LEFT JOIN LATERAL (
            SELECT topic.id AS topic_id
            FROM topics topic
            WHERE topic.deleted_at IS NULL
              AND topic.merged_into_topic_id IS NULL
              AND (
                LOWER(topic.name) IN (
                  LOWER(feed_category.category_text),
                  LOWER(CASE WHEN LEFT(feed_category.category_text, 1) = '#' THEN SUBSTRING(feed_category.category_text FROM 2) ELSE feed_category.category_text END),
                  LOWER(source_alias.alias)
                )
                OR topic.slug IN (
                  LOWER(feed_category.category_text),
                  LOWER(CASE WHEN LEFT(feed_category.category_text, 1) = '#' THEN SUBSTRING(feed_category.category_text FROM 2) ELSE feed_category.category_text END),
                  LOWER(source_alias.alias)
                )
              )
            ORDER BY topic.id
            LIMIT 1
          ) replacement ON TRUE
          WHERE feed_category.topic_id IS NOT NULL
            AND LOWER(feed_category.category_text) = LOWER($2)
            AND ($3::uuid IS NULL OR feed_category.topic_id = $3)
            AND NOT EXISTS (
              SELECT 1
              FROM topic_aliases current_alias
              WHERE current_alias.alias = LOWER($2)
                AND current_alias.topic_id IS NOT NULL
            )
        )
        UPDATE rss_feed_categories target
        SET topic_id = candidates.replacement_topic_id,
            updated_at = CURRENT_TIMESTAMP
        FROM candidates
        WHERE target.rss_feed_id = candidates.rss_feed_id
          AND target.category_text = candidates.category_text`,
      [topicAliasId, alias, formerTopicId ?? null],
    )

  await runInTransaction(options, clearFeedCategories)
  return clearCategoryBatch(topicAliasId, alias, formerTopicId, 0, options)
}
async function clearCategoryBatch(
  topicAliasId: string,
  alias: string,
  formerTopicId: string | undefined,
  updated: number,
  options: QueryOptions,
): Promise<{ updated: number }> {
  const run = async (query: TransactionQuery) => {
    const rows = await clearUnlinkedTopicAliasCategoryBatch(
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
    return { rows, statTargets }
  }
  const result = await runInTransaction(options, run)
  const { rows, statTargets } = result
  if (rows.length === 0) return { updated }

  await publishEntityRelationElectionVoteStats(statTargets, { enqueueTopHashtagRefresh: false })
  await invalidateRssFeedItemChunks([...new Set(rows.map(row => row.rss_feed_item_id))])
  return clearCategoryBatch(topicAliasId, alias, formerTopicId, updated + rows.length, options)
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
