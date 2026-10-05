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
  updated_at: string
} | null> {
  const { rows } = await read<{ item_count: number; updated_at: string }>(sql`
    SELECT item_count::int,
      to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS updated_at
    FROM rss_feed_item_unmapped_category_counts
    WHERE category_text = LOWER(${categoryText})
  `)
  return rows[0] ?? null
}
