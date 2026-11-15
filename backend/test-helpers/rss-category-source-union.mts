import { read } from '@data-stores/psql'

/** Prior one-shot category ordering, restricted to the test's explicitly owned source keys. */
export async function readOwnedRssCategorySourceUnion(
  itemId: string,
  feedIds: readonly string[],
): Promise<string[]> {
  const { rows } = await read<{ category_text: string }>(
    `/* readOwnedRssCategorySourceUnion */
      SELECT DISTINCT category.category_text
      FROM rss_feed_item_source_category_snapshots snapshot
      JOIN rss_feeds feed ON feed.id = snapshot.rss_feed_id
      CROSS JOIN LATERAL jsonb_array_elements_text(snapshot.categories) category(category_text)
      WHERE snapshot.rss_feed_item_id = $1::uuid
        AND snapshot.rss_feed_id = ANY($2::uuid[]) AND feed.deleted_at IS NULL
      ORDER BY category.category_text`,
    [itemId, feedIds],
  )
  return rows.map(row => row.category_text)
}
