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
  const categoryItemIds = snapshots.flatMap(snapshot =>
    snapshot.categories.map(() => snapshot.rss_feed_item_id),
  )
  const categoryTexts = snapshots.flatMap(snapshot => snapshot.categories)
  // ast-grep-ignore: no-three-sequential-awaits -- lock the rss_feed_items rows this writer updates before deleting stale categories, then retract votes those categories no longer support
  await lockRssFeedItemsForStoryPublicationChanges(query, itemIds)
  const { rows } = await query<{
    rss_feed_item_id: string | null
    topic_id: string | null
    topic_alias_id: string | null
    candidate_count: string
  }>(
    `/* reconcileRssFeedItemCategorySnapshots */
      WITH desired_categories AS (
        SELECT DISTINCT input.rss_feed_item_id, identity.id AS category_identity_id
        FROM unnest($2::uuid[], $3::text[]) AS input(rss_feed_item_id, category_text)
        JOIN rss_category_identities identity
          ON identity.category_text = LOWER(TRIM(input.category_text))
      ), stale_page AS (
        SELECT category.ctid AS tuple_id, category.rss_feed_item_id, category.category_identity_id
        FROM rss_feed_item_categories category
        WHERE category.rss_feed_item_id = ANY($1::uuid[])
          AND NOT EXISTS (SELECT 1 FROM desired_categories desired
            WHERE desired.rss_feed_item_id = category.rss_feed_item_id
              AND desired.category_identity_id = category.category_identity_id)
        ORDER BY category.rss_feed_item_id, category.category_identity_id LIMIT $4
      ), stale_categories AS (
        DELETE FROM rss_feed_item_categories category
        WHERE category.ctid = ANY(ARRAY(SELECT page.tuple_id FROM stale_page page))
          AND category.rss_feed_item_id = ANY($1::uuid[])
        RETURNING category.rss_feed_item_id, category.topic_id, category.topic_alias_id
      ) SELECT category.rss_feed_item_id, category.topic_id, category.topic_alias_id,
          stats.candidate_count
        FROM (SELECT COUNT(*) AS candidate_count FROM stale_page) stats
        LEFT JOIN stale_categories category ON TRUE`,
    [itemIds, categoryItemIds, categoryTexts, limit],
  )
  const staleCategories: StaleCategory[] = rows.flatMap(row =>
    row.rss_feed_item_id
      ? [
          {
            rss_feed_item_id: row.rss_feed_item_id,
            topic_id: row.topic_id,
            topic_alias_id: row.topic_alias_id,
          },
        ]
      : [],
  )
  const candidateCount = Number(rows[0]?.candidate_count ?? 0)
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
