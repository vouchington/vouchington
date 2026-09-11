import { write, type QueryOptions } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function lockTestRssFeedItemCategory(
  rssFeedItemId: string,
  categoryText: string,
  query: NonNullable<QueryOptions['query']>,
): Promise<void> {
  await write(
    sql`/* lockTestRssFeedItemCategory */
      SELECT rss_feed_item_id
      FROM rss_feed_item_categories
      WHERE rss_feed_item_id = ${rssFeedItemId}
        AND category_text = ${categoryText}
      FOR UPDATE
    `,
    { query },
  )
}
