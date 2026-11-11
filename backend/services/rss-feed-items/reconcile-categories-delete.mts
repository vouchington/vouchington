import type { TransactionQuery } from '@data-stores/psql'
import type { RssFeedItemCategorySnapshot } from './category-batches.mts'
import {
  retractUnsupportedCategorizerVotes,
  type StaleCategory,
} from './reconcile-category-votes.mts'
import {
  lockRssFeedItemsForStoryPublicationChanges,
  recordStoryPublicationChangesForCategoryTopics,
} from './story-publication-change.mts'
import { recordTopicAliasPublicationWork } from '@services/post-publication'

export async function deleteStaleCategoriesAndRetractVotes(
  snapshots: readonly RssFeedItemCategorySnapshot[],
  query: TransactionQuery,
): Promise<{ staleCategories: StaleCategory[] }> {
  const itemIds = snapshots.map(snapshot => snapshot.rss_feed_item_id)
  const categoryItemIds = snapshots.flatMap(snapshot =>
    snapshot.categories.map(() => snapshot.rss_feed_item_id),
  )
  const categoryTexts = snapshots.flatMap(snapshot => snapshot.categories)
  // ast-grep-ignore: no-three-sequential-awaits -- lock the rss_feed_items rows this writer updates before deleting stale categories, then retract votes those categories no longer support
  await lockRssFeedItemsForStoryPublicationChanges(query, itemIds)
  const { rows: staleCategories } = await query<StaleCategory>(
    `/* reconcileRssFeedItemCategorySnapshots */
      WITH snapshot_items AS (SELECT unnest($1::uuid[]) AS rss_feed_item_id),
      desired_categories AS (
        SELECT DISTINCT input.rss_feed_item_id, identity.id AS category_identity_id
        FROM unnest($2::uuid[], $3::text[]) AS input(rss_feed_item_id, category_text)
        JOIN rss_category_identities identity
          ON identity.category_text = LOWER(TRIM(input.category_text))
      ), stale_categories AS (
        DELETE FROM rss_feed_item_categories category USING snapshot_items snapshot
        WHERE category.rss_feed_item_id = snapshot.rss_feed_item_id
          AND NOT EXISTS (SELECT 1 FROM desired_categories desired
            WHERE desired.rss_feed_item_id = category.rss_feed_item_id
              AND desired.category_identity_id = category.category_identity_id)
        RETURNING category.rss_feed_item_id, category.topic_id, category.topic_alias_id
      ) SELECT * FROM stale_categories`,
    [itemIds, categoryItemIds, categoryTexts],
  )
  // ast-grep-ignore: no-three-sequential-awaits -- retract unsupported category votes before capturing resulting story eligibility; finish story publication work before scheduling affected alias publication
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
