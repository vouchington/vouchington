import { beginTransaction, write } from '@data-stores/psql'
import { updateEntityRelationElectionVoteStatsFromPrimaryBatch } from '@services/elections-votes/entity-relation/vote-stats-batch'
import { createEntityRelationElectionTarget } from '@services/elections-votes/entity-relation/target'
import type { RssFeedItemCategorySnapshot } from './category-batches.mts'
import { deleteStaleCategoriesAndRetractVotes } from './reconcile-categories-delete.mts'

/** Replaces each supplied item's category snapshot and retracts unsupported categorizer ballots. */
export async function reconcileRssFeedItemCategorySnapshots(
  snapshots: readonly RssFeedItemCategorySnapshot[],
): Promise<{ changedItemIds: string[] }> {
  if (snapshots.length === 0) return { changedItemIds: [] }
  await using query = await beginTransaction()
  const { staleCategories } = await deleteStaleCategoriesAndRetractVotes(snapshots, query)
  await query.commit()
  const targets = await getCategoryRelationTargetsForItems(
    snapshots.map(snapshot => snapshot.rss_feed_item_id),
  )
  await updateEntityRelationElectionVoteStatsFromPrimaryBatch(targets, {
    enqueueTopHashtagRefresh: false,
  })
  return {
    changedItemIds: [...new Set(staleCategories.map(category => category.rss_feed_item_id))],
  }
}

async function getCategoryRelationTargetsForItems(
  itemIds: string[],
): Promise<ReturnType<typeof createEntityRelationElectionTarget>[]> {
  const { rows } = await write<{ id: string; entity_relation: string }>(
    `/* reconcileRssFeedItemCategorySnapshots relationTargets */
      SELECT id, 'relation__rss_feed_item__category__topic'::text AS entity_relation
      FROM relation__rss_feed_item__category__topic WHERE subject_id = ANY($1::uuid[]) AND deleted_at IS NULL
      UNION ALL
      SELECT id, 'relation__rss_feed_item__category__topic_alias'::text AS entity_relation
      FROM relation__rss_feed_item__category__topic_alias WHERE subject_id = ANY($1::uuid[]) AND deleted_at IS NULL`,
    [itemIds],
  )
  return rows.map(row => createEntityRelationElectionTarget(row.id, row.entity_relation))
}
