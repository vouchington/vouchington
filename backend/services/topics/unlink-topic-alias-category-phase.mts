import type { TransactionQuery } from '@data-stores/psql/types'
import type { ItemCategoryRow } from './unlink-topic-alias-stage.mts'

/** The first statement locks exact staged rows, keeping their tuple IDs stable for the update. */
export async function clearRssItemCategories(
  query: TransactionQuery,
  topicAliasId: string,
  pageCursor: string,
  rows: readonly ItemCategoryRow[],
): Promise<{ postIds: string[]; rssFeedItemIds: string[] }> {
  const first = rows[0]
  if (!first || `${first.rss_feed_item_id}_${first.category_identity_id}` !== pageCursor) {
    return { postIds: [], rssFeedItemIds: [] }
  }
  // Match the ascending write-row order used by category reconciliation.
  const ordered = rows.toSorted(
    (left, right) =>
      left.rss_feed_item_id.localeCompare(right.rss_feed_item_id) ||
      left.category_identity_id.localeCompare(right.category_identity_id),
  )
  const { rows: locked } = await query<{ row_id: string }>(
    `/* clearRssItemCategories lockStaged */
    SELECT category.row_id
    FROM unnest($2::uuid[], $3::uuid[]) AS staged(rss_feed_item_id, category_identity_id)
    CROSS JOIN LATERAL (
      SELECT category.ctid AS row_id
      FROM rss_feed_item_categories AS category
      WHERE category.rss_feed_item_id = staged.rss_feed_item_id
        AND category.category_identity_id = staged.category_identity_id
        AND category.topic_alias_id = $1::uuid
      LIMIT 1
      FOR UPDATE OF category
    ) AS category
    WHERE EXISTS (SELECT 1 FROM topic_aliases alias
      WHERE alias.id = $1::uuid AND alias.unlink_requested_at IS NOT NULL)`,
    [
      topicAliasId,
      ordered.map(row => row.rss_feed_item_id),
      ordered.map(row => row.category_identity_id),
    ],
  )
  if (locked.length === 0) return { postIds: [], rssFeedItemIds: [] }
  const { rows: cleared } = await query<{ rss_feed_item_id: string }>(
    `/* clearRssItemCategories clear */
    UPDATE rss_feed_item_categories AS category
    SET topic_alias_id = NULL
    WHERE category.ctid = ANY(ARRAY(SELECT unnest($1::tid[])))
    RETURNING category.rss_feed_item_id`,
    [locked.map(row => row.row_id)],
  )
  return { postIds: [], rssFeedItemIds: cleared.map(row => row.rss_feed_item_id) }
}
