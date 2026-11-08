import { write } from '@data-stores/psql'

/** Read the live source union only after the item's projection result has been claimed. */
export async function getRssFeedItemCategorySnapshots(
  rssFeedItemIds: readonly string[],
): Promise<Map<string, string[]>> {
  if (rssFeedItemIds.length === 0) return new Map()
  const { rows } = await write<{ rss_feed_item_id: string; categories: string[] }>(
    `/* getRssFeedItemCategorySnapshots */
      SELECT source_snapshot.rss_feed_item_id,
             ARRAY_AGG(DISTINCT source_category.category_text ORDER BY source_category.category_text)
               AS categories
      FROM rss_feed_item_source_category_snapshots source_snapshot
      JOIN rss_feed_item_sources source
        ON source.rss_feed_id = source_snapshot.rss_feed_id
       AND source.rss_feed_item_id = source_snapshot.rss_feed_item_id
      JOIN rss_feeds feed ON feed.id = source.rss_feed_id
      CROSS JOIN LATERAL jsonb_array_elements_text(source_snapshot.categories)
        AS source_category(category_text)
      WHERE source_snapshot.rss_feed_item_id = ANY($1::uuid[])
        AND feed.deleted_at IS NULL
      GROUP BY source_snapshot.rss_feed_item_id`,
    [rssFeedItemIds],
  )
  return new Map(rows.map(row => [row.rss_feed_item_id, row.categories]))
}
