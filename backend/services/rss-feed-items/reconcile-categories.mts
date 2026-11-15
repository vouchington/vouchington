import { beginTransaction, type TransactionQuery } from '@data-stores/psql'
import {
  updateEntityRelationElectionVoteStatsFromPrimaryBatch,
  publishEntityRelationElectionVoteStats,
} from '@services/elections-votes/entity-relation/vote-stats-batch'
import { createEntityRelationElectionTarget } from '@services/elections-votes/entity-relation/target'
import type { RssFeedItemCategorySnapshot } from './category-batches.mts'
import type { StaleCategory } from './reconcile-category-votes.mts'
import { deleteStaleCategoriesAndRetractVotes } from './reconcile-categories-delete.mts'

/** Replaces each supplied item's category snapshot and retracts unsupported categorizer ballots. */
export async function reconcileRssFeedItemCategorySnapshots(
  snapshots: readonly RssFeedItemCategorySnapshot[],
): Promise<{ changedItemIds: string[]; hasMore: boolean }> {
  if (snapshots.length === 0) return { changedItemIds: [], hasMore: false }
  const { updatedTargets, ...result } = await commitCategorySnapshotReconciliation(snapshots)
  await publishEntityRelationElectionVoteStats(updatedTargets, { enqueueTopHashtagRefresh: false })
  return result
}

async function commitCategorySnapshotReconciliation(
  snapshots: readonly RssFeedItemCategorySnapshot[],
) {
  await using query = await beginTransaction()
  const result = await persistCategorySnapshotReconciliation(query, snapshots)
  await query.commit()
  return result
}

async function persistCategorySnapshotReconciliation(
  query: TransactionQuery,
  snapshots: readonly RssFeedItemCategorySnapshot[],
) {
  const { staleCategories, hasMore } = await deleteStaleCategoriesAndRetractVotes(snapshots, query)
  const updatedTargets = await refreshCategoryRelationVoteStatsForItems(
    query,
    snapshots,
    staleCategories,
  )
  return {
    updatedTargets,
    hasMore,
    changedItemIds: [...new Set(staleCategories.map(category => category.rss_feed_item_id))],
  }
}

async function refreshCategoryRelationVoteStatsForItems(
  query: TransactionQuery,
  snapshots: readonly RssFeedItemCategorySnapshot[],
  staleCategories: readonly StaleCategory[],
): Promise<ReturnType<typeof createEntityRelationElectionTarget>[]> {
  const { rows } = await query<{ id: string; entity_relation: string }>(
    `/* reconcileRssFeedItemCategorySnapshots relationTargets */
      WITH mappings AS (
        SELECT category.rss_feed_item_id, category.topic_id, category.topic_alias_id
        FROM unnest($1::uuid[], $2::text[]) input(item_id, category_text)
        JOIN rss_category_identities identity ON identity.category_text = LOWER(TRIM(input.category_text))
        JOIN rss_feed_item_categories category ON category.rss_feed_item_id = input.item_id
          AND category.category_identity_id = identity.id
        UNION ALL
        SELECT item_id, topic_id, alias_id FROM unnest($3::uuid[], $4::uuid[], $5::uuid[])
          input(item_id, topic_id, alias_id)
      )
      SELECT relation.id, 'relation__rss_feed_item__category__topic'::text AS entity_relation
      FROM mappings JOIN relation__rss_feed_item__category__topic relation
        ON relation.subject_id = mappings.rss_feed_item_id AND relation.object_id = mappings.topic_id
      WHERE relation.deleted_at IS NULL
      UNION ALL
      SELECT relation.id, 'relation__rss_feed_item__category__topic_alias'::text AS entity_relation
      FROM mappings JOIN relation__rss_feed_item__category__topic_alias relation
        ON relation.subject_id = mappings.rss_feed_item_id AND relation.object_id = mappings.topic_alias_id
      WHERE relation.deleted_at IS NULL`,
    [
      snapshots.flatMap(snapshot => snapshot.categories.map(() => snapshot.rss_feed_item_id)),
      snapshots.flatMap(snapshot => snapshot.categories),
      staleCategories.map(category => category.rss_feed_item_id),
      staleCategories.map(category => category.topic_id),
      staleCategories.map(category => category.topic_alias_id),
    ],
  )
  const targets = [...new Map(rows.map(row => [row.id, row])).values()].map(row =>
    createEntityRelationElectionTarget(row.id, row.entity_relation),
  )
  return updateEntityRelationElectionVoteStatsFromPrimaryBatch(targets, {
    query,
    invalidateCache: false,
    enqueueTopHashtagRefresh: false,
  })
}
