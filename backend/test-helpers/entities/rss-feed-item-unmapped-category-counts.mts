import { read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function deleteUnmappedRssFeedItemCategory(
  rssFeedItemId: string,
  categoryText: string,
): Promise<void> {
  await write(sql`
    DELETE FROM rss_feed_item_categories
    WHERE rss_feed_item_id = ${rssFeedItemId}
      AND category_text = ${categoryText}
      AND topic_id IS NULL
  `)
}

export async function getUnmappedRssFeedItemCategoryCount(categoryText: string): Promise<{
  item_count: number
  updated_at: Date
} | null> {
  const { rows } = await read<{ item_count: number; updated_at: Date }>(sql`
    SELECT item_count::int, updated_at
    FROM rss_feed_item_unmapped_category_counts
    WHERE category_text = LOWER(${categoryText})
  `)
  return rows[0] ?? null
}

export async function setUnmappedRssFeedItemCategoryCountUpdatedAtForTest(
  categoryText: string,
  updatedAt: Date,
): Promise<void> {
  await write(sql`
    UPDATE rss_feed_item_unmapped_category_counts
    SET updated_at = ${updatedAt}
    WHERE category_text = LOWER(${categoryText})
  `)
}
