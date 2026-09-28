import type { QueryExecutor } from '@data-stores/psql'
import type { RssFeedItemCategoryInput } from '@voucha/types/entities/rss-feed-item'

export function orderedCategorySnapshots(
  snapshots: readonly RssFeedItemCategoryInput[],
): RssFeedItemCategoryInput[] {
  return [
    ...new Map(snapshots.map(snapshot => [snapshot.rss_feed_item_id, snapshot])).values(),
  ].sort((left, right) => left.rss_feed_item_id.localeCompare(right.rss_feed_item_id))
}

export async function replaceCategorySnapshotChildren(
  query: QueryExecutor,
  rssFeedId: string,
  snapshots: readonly RssFeedItemCategoryInput[],
): Promise<void> {
  const itemIds = snapshots.map(snapshot => snapshot.rss_feed_item_id)
  const childItemIds: string[] = []
  const ordinals: number[] = []
  const categories: string[] = []
  for (const snapshot of snapshots) {
    snapshot.categories.forEach((category, ordinal) => {
      childItemIds.push(snapshot.rss_feed_item_id)
      ordinals.push(ordinal)
      categories.push(category)
    })
  }
  await query(
    `/* replaceCategorySnapshotChildren:source */
      DELETE FROM rss_feed_item_source_category_snapshot_categories
      WHERE rss_feed_id = $1
        AND rss_feed_item_id = ANY($2::uuid[])`,
    [rssFeedId, itemIds],
  )
  await query(
    `/* replaceCategorySnapshotChildren:reconciliation */
      DELETE FROM rss_feed_item_category_snapshot_reconciliation_categories
      WHERE rss_feed_item_id = ANY($1::uuid[])`,
    [itemIds],
  )
  if (childItemIds.length === 0) return
  await query(
    `/* replaceCategorySnapshotChildren:sourceCategories */
      INSERT INTO rss_feed_item_source_category_snapshot_categories
        (rss_feed_id, rss_feed_item_id, ordinal, category_text)
      SELECT $1, rss_feed_item_id, ordinal, category_text
      FROM UNNEST($2::uuid[], $3::int[], $4::text[])
        AS category(rss_feed_item_id, ordinal, category_text)
      ORDER BY rss_feed_item_id, ordinal`,
    [rssFeedId, childItemIds, ordinals, categories],
  )
  await query(
    `/* replaceCategorySnapshotChildren:reconciliationCategories */
      INSERT INTO rss_feed_item_category_snapshot_reconciliation_categories
        (rss_feed_item_id, ordinal, category_text)
      SELECT rss_feed_item_id, ordinal, category_text
      FROM UNNEST($1::uuid[], $2::int[], $3::text[])
        AS category(rss_feed_item_id, ordinal, category_text)
      ORDER BY rss_feed_item_id, ordinal`,
    [childItemIds, ordinals, categories],
  )
}
