import { beginTransaction, write, type TransactionQuery } from '@data-stores/psql'
import { updateEntityRelationElectionVoteStatsFromPrimaryBatch } from '@services/elections-votes/entity-relation/vote-stats-batch'
import { createEntityRelationElectionTarget } from '@services/elections-votes/entity-relation/target'
import type { RssFeedItemCategorySnapshot } from './category-batches.mts'
import {
  retractUnsupportedCategorizerVotes,
  type StaleCategory,
} from './reconcile-category-votes.mts'
import {
  lockRssFeedItemsForStoryPublicationChanges,
  recordStoryPublicationChangesForCategoryTopics,
} from './story-publication-change.mts'
import {
  lockTopicAliasPublicationScopes,
  recordTopicAliasPublicationWork,
} from '@services/post-publication'

/** Replaces each supplied item's category snapshot and retracts unsupported categorizer ballots. */
export async function reconcileRssFeedItemCategorySnapshots(
  snapshots: readonly RssFeedItemCategorySnapshot[],
): Promise<{ changedItemIds: string[] }> {
  if (snapshots.length === 0) return { changedItemIds: [] }
  // ast-grep-ignore: no-three-sequential-awaits -- commit removals, discover surviving relations, then persist their writer-visible stats
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

async function deleteStaleCategoriesAndRetractVotes(
  snapshots: readonly RssFeedItemCategorySnapshot[],
  query: TransactionQuery,
): Promise<{ staleCategories: StaleCategory[] }> {
  const itemIds = snapshots.map(snapshot => snapshot.rss_feed_item_id)
  const categoryItemIds = snapshots.flatMap(snapshot =>
    snapshot.categories.map(() => snapshot.rss_feed_item_id),
  )
  const categoryTexts = snapshots.flatMap(snapshot => snapshot.categories)
  // ast-grep-ignore: no-three-sequential-awaits -- discover alias scopes, lock them, then lock their RSS items before deletion
  const staleTopicAliasIds = await getStaleCategoryTopicAliasIds(
    query,
    itemIds,
    categoryItemIds,
    categoryTexts,
  )
  await lockTopicAliasPublicationScopes(query, staleTopicAliasIds)
  await lockRssFeedItemsForStoryPublicationChanges(query, itemIds)
  const { rows: staleCategories } = await query<StaleCategory>(
    `/* reconcileRssFeedItemCategorySnapshots */
      WITH snapshot_items AS (SELECT unnest($1::uuid[]) AS rss_feed_item_id),
      desired_categories AS (
        SELECT DISTINCT rss_feed_item_id, LOWER(category_text) AS category_text
        FROM unnest($2::uuid[], $3::text[]) AS input(rss_feed_item_id, category_text)
      ), stale_categories AS (
        DELETE FROM rss_feed_item_categories category USING snapshot_items snapshot
        WHERE category.rss_feed_item_id = snapshot.rss_feed_item_id
          AND NOT EXISTS (SELECT 1 FROM desired_categories desired
            WHERE desired.rss_feed_item_id = category.rss_feed_item_id
              AND desired.category_text = LOWER(category.category_text))
        RETURNING category.rss_feed_item_id, category.topic_id, category.topic_alias_id
      ) SELECT * FROM stale_categories`,
    [itemIds, categoryItemIds, categoryTexts],
  )
  // ast-grep-ignore: no-three-sequential-awaits -- retract stale votes before recording the resulting story and alias publication work.
  await retractUnsupportedCategorizerVotes(staleCategories, query)
  await recordStoryPublicationChangesForCategoryTopics(
    query,
    staleCategories.map(category => ({
      rss_feed_item_id: category.rss_feed_item_id,
      previous_topic_id: category.topic_id,
      topic_id: null,
    })),
  )
  await recordTopicAliasPublicationWork(
    query,
    staleCategories.flatMap(category => (category.topic_alias_id ? [category.topic_alias_id] : [])),
  )
  return { staleCategories }
}

/** Discovers alias scopes before the item lock so category writers share alias → item ordering. */
async function getStaleCategoryTopicAliasIds(
  query: TransactionQuery,
  itemIds: readonly string[],
  categoryItemIds: readonly string[],
  categoryTexts: readonly string[],
): Promise<string[]> {
  const { rows } = await query<{ topic_alias_id: string }>(
    `/* reconcileRssFeedItemCategorySnapshots staleAliasScopes */
      WITH snapshot_items AS (SELECT unnest($1::uuid[]) AS rss_feed_item_id),
      desired_categories AS (
        SELECT DISTINCT rss_feed_item_id, LOWER(category_text) AS category_text
        FROM unnest($2::uuid[], $3::text[]) AS input(rss_feed_item_id, category_text)
      )
      SELECT DISTINCT category.topic_alias_id
      FROM rss_feed_item_categories category
      JOIN snapshot_items snapshot ON category.rss_feed_item_id = snapshot.rss_feed_item_id
      WHERE category.topic_alias_id IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM desired_categories desired
          WHERE desired.rss_feed_item_id = category.rss_feed_item_id
            AND desired.category_text = LOWER(category.category_text))
      ORDER BY category.topic_alias_id`,
    [itemIds, categoryItemIds, categoryTexts],
  )
  return rows.map(row => row.topic_alias_id)
}

async function getCategoryRelationTargetsForItems(
  itemIds: string[],
): Promise<ReturnType<typeof createEntityRelationElectionTarget>[]> {
  const { rows } = await write<{ id: string; relation_table: string }>(
    `/* reconcileRssFeedItemCategorySnapshots relationTargets */
      SELECT id, 'relation__rss_feed_item__category__topic'::text AS relation_table
      FROM relation__rss_feed_item__category__topic WHERE subject_id = ANY($1::uuid[]) AND deleted_at IS NULL
      UNION ALL
      SELECT id, 'relation__rss_feed_item__category__topic_alias'::text AS relation_table
      FROM relation__rss_feed_item__category__topic_alias WHERE subject_id = ANY($1::uuid[]) AND deleted_at IS NULL`,
    [itemIds],
  )
  return rows.map(row => createEntityRelationElectionTarget(row.id, row.relation_table))
}
