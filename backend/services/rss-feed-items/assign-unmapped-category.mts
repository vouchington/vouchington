import type { TransactionQuery } from '@data-stores/psql'
import { createTopicAliases } from '@services/topics/aliases'
import { backfillCategoriesForTopicAliases } from './backfill-categories-for-topic-aliases.mts'
import { getRssFeedItemsWorkLimit } from './work-limits.mts'

export async function assignCategoryInTransaction(
  currentUserId: string,
  topicId: string,
  category: string,
  query: TransactionQuery,
) {
  const [alias] = await createTopicAliases(topicId, [category], {
    query,
    revisedById: currentUserId,
  })
  if (!alias) return { updated: 0, hasMore: false }
  const { rows: rawRows } = await query<{
    rss_feed_item_id: string
    category_identity_id: string
  }>(
    `/* assignCategoryInTransaction rawPage */
     SELECT category.rss_feed_item_id, category.category_identity_id
     FROM rss_category_identities identity
     JOIN rss_feed_item_categories category
       ON category.category_identity_id = identity.id
     WHERE identity.category_text = LOWER($1::text)
     ORDER BY category.rss_feed_item_id
     LIMIT $2::integer`,
    [category, getRssFeedItemsWorkLimit('category_backfill_batch_size') + 1],
  )
  const pageSize = getRssFeedItemsWorkLimit('category_backfill_batch_size')
  const result = await backfillCategoriesForTopicAliases(
    topicId,
    {
      rows: rawRows.slice(0, pageSize),
      hasMore: rawRows.length > pageSize,
      match: { kind: 'alias_text', aliasId: alias.id, alias: alias.alias },
    },
    { query },
  )
  await query(
    `/* assignCategoryInTransaction markAliasCategoryMappingDirty */
     INSERT INTO topic_alias_category_mapping_reconciliations
       (topic_alias_id, alias, unlink_requested_at)
     SELECT id, alias, unlink_requested_at FROM topic_aliases
     WHERE id = $1::uuid AND alias = $2::text AND unlink_requested_at IS NULL
     ON CONFLICT (topic_alias_id) DO UPDATE
     SET alias = EXCLUDED.alias,
       unlink_requested_at = EXCLUDED.unlink_requested_at,
       generation = topic_alias_category_mapping_reconciliations.generation + 1,
       phase = 'rss_item_categories', sweep_upper_bound_item_id = NULL, sweep_upper_bound_feed_id = NULL,
       cursor_item_id = NULL, cursor_category_identity_id = NULL, cursor_feed_id = NULL`,
    [alias.id, alias.alias],
  )
  return result
}
