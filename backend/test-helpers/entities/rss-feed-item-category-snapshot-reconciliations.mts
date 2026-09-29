import { read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'

export type TestRssFeedItemCategorySnapshotReconciliation = {
  rss_feed_item_id: string
  categories: unknown
  generation: string
  updated_at: Date
}

export async function getTestRssFeedItemCategorySnapshotReconciliation(
  rssFeedItemId: string,
): Promise<TestRssFeedItemCategorySnapshotReconciliation | undefined> {
  const { rows } = await read<TestRssFeedItemCategorySnapshotReconciliation>(sql`
    /* getTestRssFeedItemCategorySnapshotReconciliation */
    SELECT rss_feed_item_id, categories, generation, updated_at
    FROM rss_feed_item_category_snapshot_reconciliations
    WHERE rss_feed_item_id = ${rssFeedItemId}
  `)
  return rows[0]
}

export async function listTestRssFeedItemCategorySnapshotReconciliations(
  rssFeedItemIds: string[],
): Promise<TestRssFeedItemCategorySnapshotReconciliation[]> {
  if (rssFeedItemIds.length === 0) return []
  const { rows } = await read<TestRssFeedItemCategorySnapshotReconciliation>(sql`
    /* listTestRssFeedItemCategorySnapshotReconciliations */
    SELECT rss_feed_item_id, categories, generation, updated_at
    FROM rss_feed_item_category_snapshot_reconciliations
    WHERE rss_feed_item_id = ANY(${rssFeedItemIds}::uuid[])
    ORDER BY updated_at, rss_feed_item_id
  `)
  return rows
}

export async function replaceTestRssFeedItemCategorySnapshotReconciliation(
  rssFeedItemId: string,
  categories: unknown,
): Promise<void> {
  await write(sql`
    /* replaceTestRssFeedItemCategorySnapshotReconciliation */
    INSERT INTO rss_feed_item_category_snapshot_reconciliations
      (rss_feed_item_id, categories)
    VALUES (${rssFeedItemId}, ${JSON.stringify(categories)}::jsonb)
    ON CONFLICT (rss_feed_item_id) DO UPDATE
    SET categories = EXCLUDED.categories,
        generation = rss_feed_item_category_snapshot_reconciliations.generation + 1,
        updated_at = CURRENT_TIMESTAMP
  `)
}
