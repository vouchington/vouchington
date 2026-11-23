import { getRssFeedItemsWorkLimit } from '@services/rss-feed-items/work-limits'
import { registerPostCommitAction } from '@data-stores/psql'
import type { QueryOptions, TransactionQuery } from '@data-stores/psql/types'
import { createCategoryTopicRelationsInTransaction } from './category-relations.mts'
import {
  clearCategorizerVotesInTransaction,
  getClearedCategorizerVoteStatTargets,
} from './category-topic-votes.mts'
import { updateEntityRelationElectionVoteStatsFromPrimaryBatch } from '@services/elections-votes/entity-relation/vote-stats-batch'
import { markRssFeedItemCategorySnapshotsForReconciliation } from './category-snapshot-reconciliations.mts'
import { recordStoryPublicationChangesForCategoryTopics } from './story-publication-change.mts'
import { runCategoryTransaction } from './category-transaction.mts'
import { publishCategoryBackfillEffects } from './category-backfill-effects.mts'

type CategoryBackfillMatch =
  | { kind: 'alias_id' | 'alias_text'; aliasId: string; alias: string }
  | { kind: 'topic_name'; sourceText: string; sourcePhase: 0 | 1 }

export type CategoryBackfillRawPage = {
  rows: Array<{ rss_feed_item_id: string; category_identity_id: string }>
  hasMore: boolean
  match: CategoryBackfillMatch
}

// Backfills topic_id by alias (overwrites stale assignments), or by topic name/slug (fills nulls only).
export async function backfillCategoriesForTopicAliases(
  topicId: string,
  rawPage: CategoryBackfillRawPage,
  options: QueryOptions = {},
): Promise<{ updated: number; hasMore: boolean }> {
  return backfillCategoryBatch(topicId, options, rawPage)
}

async function backfillCategoryBatch(
  topicId: string,
  options: QueryOptions,
  rawPage: CategoryBackfillRawPage,
): Promise<{ updated: number; hasMore: boolean }> {
  const CATEGORY_BACKFILL_BATCH_SIZE = getRssFeedItemsWorkLimit('category_backfill_batch_size')
  const run = async (query: TransactionQuery) => {
    const { rows: candidateItems } = await query<{
      rss_feed_item_id: string
      category_identity_id: string
      previous_topic_id: string | null
    }>(
      `/* backfillCategoriesForTopicAliases rawCandidates */
           SELECT category.rss_feed_item_id, category.category_identity_id,
             category.topic_id AS previous_topic_id
           FROM UNNEST($2::uuid[], $3::uuid[]) AS raw(rss_feed_item_id, category_identity_id)
           JOIN rss_feed_item_categories category
             ON category.rss_feed_item_id = raw.rss_feed_item_id
             AND category.category_identity_id = raw.category_identity_id
           JOIN rss_category_identities identity ON identity.id = category.category_identity_id
           WHERE category.topic_id IS DISTINCT FROM $1::uuid
             AND (
               ($4::text = 'alias_id' AND category.topic_alias_id = $5::uuid)
               OR ($4::text = 'alias_text' AND identity.category_text = LOWER($6::text))
               OR ($4::text = 'topic_name' AND category.topic_id IS NULL
                 AND identity.category_text IN (
                   SELECT LOWER(name) FROM topics WHERE id = $1::uuid
                     AND deleted_at IS NULL AND merged_into_topic_id IS NULL
                   UNION
                   SELECT slug FROM topics WHERE id = $1::uuid
                     AND deleted_at IS NULL AND merged_into_topic_id IS NULL
                 ))
             )
             AND ($4::text = 'topic_name' OR EXISTS (
               SELECT 1 FROM topic_aliases owner
               WHERE owner.id = $5::uuid AND owner.topic_id = $1::uuid
                 AND owner.alias = LOWER($6::text)
                 AND owner.unlink_requested_at IS NULL
             ))
           ORDER BY category.rss_feed_item_id, category.category_identity_id`,
      [
        topicId,
        rawPage.rows.map(row => row.rss_feed_item_id),
        rawPage.rows.map(row => row.category_identity_id),
        rawPage.match.kind,
        rawPage.match.kind === 'topic_name' ? null : rawPage.match.aliasId,
        rawPage.match.kind === 'topic_name' ? null : rawPage.match.alias,
      ],
    )
    const hasMore = rawPage.hasMore
    const candidateItemIds = [...new Set(candidateItems.map(row => row.rss_feed_item_id))]
    if (candidateItemIds.length === 0)
      return { rows: [], changedItemIds: [], statTargets: [], hasMore }
    const oldTopicIds = candidateItems.flatMap(row =>
      row.previous_topic_id ? [row.previous_topic_id] : [],
    )
    const { rows } = await query<{
      rss_feed_item_id: string
      previous_topic_id: string | null
    }>(
      `/* backfillCategoriesForTopicAliases */
      WITH input AS MATERIALIZED (
        SELECT * FROM UNNEST($5::uuid[], $6::uuid[], $7::uuid[])
          AS row(rss_feed_item_id, category_identity_id, previous_topic_id)
      ), candidates AS (
        SELECT category.rss_feed_item_id, category.category_identity_id,
          category.topic_id AS previous_topic_id
        FROM input
        JOIN LATERAL (
          SELECT rss_feed_item_id, category_identity_id, topic_id
          FROM rss_feed_item_categories
          WHERE rss_feed_item_id = input.rss_feed_item_id
            AND category_identity_id = input.category_identity_id
          LIMIT 1
        ) category ON TRUE
        WHERE category.rss_feed_item_id = ANY($3::uuid[])
          AND category.topic_id IS NOT DISTINCT FROM input.previous_topic_id
          AND (category.topic_id IS NULL OR category.topic_id = ANY($4::uuid[]))
        ORDER BY category.rss_feed_item_id, category.category_identity_id
        LIMIT $2
      )
      UPDATE rss_feed_item_categories target
      SET topic_id = $1
      FROM candidates
      WHERE target.rss_feed_item_id = candidates.rss_feed_item_id
        AND target.category_identity_id = candidates.category_identity_id
        AND target.rss_feed_item_id = ANY($3::uuid[])
        AND target.topic_id IS NOT DISTINCT FROM candidates.previous_topic_id
        AND (NOT $11::boolean OR target.topic_alias_id = $10::uuid)
        AND (
          ($8::integer IS NOT NULL AND EXISTS (
            SELECT 1 FROM topics
            WHERE id = $1::uuid AND deleted_at IS NULL AND merged_into_topic_id IS NULL
              AND CASE $8::integer WHEN 0 THEN LOWER(name) WHEN 1 THEN slug END = $9::text
          ))
          OR ($8::integer IS NULL AND EXISTS (
            SELECT 1 FROM topic_aliases
            WHERE id = $10::uuid AND alias = LOWER($9::text) AND topic_id = $1::uuid
              AND unlink_requested_at IS NULL
          ))
        )
      RETURNING target.rss_feed_item_id, candidates.previous_topic_id
    `,
      [
        topicId,
        CATEGORY_BACKFILL_BATCH_SIZE,
        candidateItemIds,
        oldTopicIds,
        candidateItems.map(row => row.rss_feed_item_id),
        candidateItems.map(row => row.category_identity_id),
        candidateItems.map(row => row.previous_topic_id),
        rawPage.match.kind === 'topic_name' ? rawPage.match.sourcePhase : null,
        rawPage.match.kind === 'topic_name' ? rawPage.match.sourceText : rawPage.match.alias,
        rawPage.match.kind === 'topic_name' ? null : rawPage.match.aliasId,
        rawPage.match.kind === 'alias_id',
      ],
    )
    if (rows.length === 0) return { rows: [], changedItemIds: [], statTargets: [], hasMore }
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
    return { rows, changedItemIds, statTargets, hasMore }
  }
  const result = await runCategoryTransaction(options, run)
  const { rows, changedItemIds, statTargets, hasMore } = result
  if (rows.length === 0) return { updated: 0, hasMore }
  const publish = () => publishCategoryBackfillEffects(statTargets, changedItemIds)
  if (options.query) registerPostCommitAction(options.query, publish)
  else await publish()
  return { updated: rows.length, hasMore }
}
