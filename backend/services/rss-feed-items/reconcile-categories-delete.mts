import { getRssFeedItemsWorkLimit } from './work-limits.mts'
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
): Promise<{ staleCategories: StaleCategory[]; hasMore: boolean }> {
  const limit = getRssFeedItemsWorkLimit('category_clear_batch_size')
  const itemIds = snapshots.map(snapshot => snapshot.rss_feed_item_id)
  // ast-grep-ignore: no-three-sequential-awaits -- lock the rss_feed_items rows this writer updates before selecting and deleting their stale category keys
  await lockRssFeedItemsForStoryPublicationChanges(query, itemIds)
  const staleKeys = await getStaleCategoryKeys(query, snapshots, limit)
  const staleCategories = await deleteStaleCategoryKeys(query, staleKeys)
  const candidateCount = staleKeys.length
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
  return {
    staleCategories,
    hasMore: candidateCount === limit || candidateCount > staleCategories.length,
  }
}

type StaleCategoryKey = { rss_feed_item_id: string; category_identity_id: string }

async function getStaleCategoryKeys(
  query: TransactionQuery,
  snapshots: readonly RssFeedItemCategorySnapshot[],
  limit: number,
): Promise<StaleCategoryKey[]> {
  const { rows } = await query<StaleCategoryKey>(
    `/* reconcileRssFeedItemCategorySnapshots stalePage */
      SELECT category.rss_feed_item_id, category.category_identity_id
      FROM rss_feed_item_categories category
      WHERE category.rss_feed_item_id = ANY($1::uuid[])
        AND NOT EXISTS (
          SELECT 1
          FROM unnest($2::uuid[], $3::text[]) AS input(rss_feed_item_id, category_text)
          JOIN rss_category_identities identity
            ON identity.category_text = LOWER(TRIM(input.category_text))
          WHERE input.rss_feed_item_id = category.rss_feed_item_id
            AND identity.id = category.category_identity_id)
      ORDER BY category.rss_feed_item_id, category.category_identity_id LIMIT $4`,
    [
      snapshots.map(snapshot => snapshot.rss_feed_item_id),
      snapshots.flatMap(snapshot => snapshot.categories.map(() => snapshot.rss_feed_item_id)),
      snapshots.flatMap(snapshot => snapshot.categories),
      limit,
    ],
  )
  return rows
}

async function deleteStaleCategoryKeys(
  query: TransactionQuery,
  keys: readonly StaleCategoryKey[],
): Promise<StaleCategory[]> {
  if (keys.length === 0) return []
  const tuples = keys.map((_, index) => `($${index * 2 + 1}::uuid, $${index * 2 + 2}::uuid)`)
  const { rows } = await query<StaleCategory>(
    `/* reconcileRssFeedItemCategorySnapshots */
      DELETE FROM rss_feed_item_categories category
      WHERE (category.rss_feed_item_id, category.category_identity_id) IN (${tuples.join(', ')})
      RETURNING category.rss_feed_item_id, category.topic_id, category.topic_alias_id`,
    keys.flatMap(key => [key.rss_feed_item_id, key.category_identity_id]),
  )
  return rows
}
