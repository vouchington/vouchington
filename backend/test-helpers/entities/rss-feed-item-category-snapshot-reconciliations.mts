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
    SELECT
      parent.rss_feed_item_id,
      parent.generation,
      parent.updated_at,
      COALESCE(
        ARRAY(
          SELECT category.category_text
          FROM rss_feed_item_category_snapshot_reconciliation_categories category
          WHERE category.rss_feed_item_id = parent.rss_feed_item_id
          ORDER BY category.ordinal
        ),
        ARRAY[]::text[]
      ) AS categories
    FROM rss_feed_item_category_snapshot_reconciliations parent
    WHERE parent.rss_feed_item_id = ${rssFeedItemId}
  `)
  return rows[0]
}

export async function listTestRssFeedItemCategorySnapshotReconciliations(
  rssFeedItemIds: string[],
): Promise<TestRssFeedItemCategorySnapshotReconciliation[]> {
  if (rssFeedItemIds.length === 0) return []
  const { rows } = await read<TestRssFeedItemCategorySnapshotReconciliation>(sql`
    /* listTestRssFeedItemCategorySnapshotReconciliations */
    SELECT
      parent.rss_feed_item_id,
      parent.generation,
      parent.updated_at,
      COALESCE(
        ARRAY(
          SELECT category.category_text
          FROM rss_feed_item_category_snapshot_reconciliation_categories category
          WHERE category.rss_feed_item_id = parent.rss_feed_item_id
          ORDER BY category.ordinal
        ),
        ARRAY[]::text[]
      ) AS categories
    FROM rss_feed_item_category_snapshot_reconciliations parent
    WHERE parent.rss_feed_item_id = ANY(${rssFeedItemIds}::uuid[])
    ORDER BY parent.updated_at, parent.rss_feed_item_id
  `)
  return rows
}

export async function replaceTestRssFeedItemCategorySnapshotReconciliation(
  rssFeedItemId: string,
  categories: string[],
): Promise<void> {
  await write(sql`
    /* replaceTestRssFeedItemCategorySnapshotReconciliation */
    INSERT INTO rss_feed_item_category_snapshot_reconciliations (rss_feed_item_id)
    VALUES (${rssFeedItemId})
    ON CONFLICT (rss_feed_item_id) DO UPDATE
    SET generation = rss_feed_item_category_snapshot_reconciliations.generation + 1,
        updated_at = CURRENT_TIMESTAMP
  `)
  await write(sql`
    /* replaceTestRssFeedItemCategorySnapshotReconciliation:clear */
    DELETE FROM rss_feed_item_category_snapshot_reconciliation_categories
    WHERE rss_feed_item_id = ${rssFeedItemId}
  `)
  if (categories.length === 0) return
  await write(
    `/* replaceTestRssFeedItemCategorySnapshotReconciliation:categories */
      INSERT INTO rss_feed_item_category_snapshot_reconciliation_categories
        (rss_feed_item_id, ordinal, category_text)
      SELECT $1, ordinal, category_text
      FROM UNNEST($2::int[], $3::text[]) AS category(ordinal, category_text)`,
    [rssFeedItemId, categories.map((_, ordinal) => ordinal), categories],
  )
}
