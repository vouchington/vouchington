import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function hasExistingPostAutotagging(post_id: string): Promise<boolean> {
  const { rows } = await read(sql`/* hasExistingPostAutotagging */
    SELECT 1
    FROM post_autotagger_results
    WHERE post_id = ${post_id}
      AND deleted_at IS NULL
    LIMIT 1
  `)
  return rows.length > 0
}

export async function hasExistingRssFeedItemAutotagging(
  rss_feed_item_id: string,
): Promise<boolean> {
  const { rows } = await read(sql`/* hasExistingRssFeedItemAutotagging */
    SELECT 1
    FROM rss_feed_item_autotagger_results
    WHERE rss_feed_item_id = ${rss_feed_item_id}
      AND deleted_at IS NULL
    LIMIT 1
  `)
  return rows.length > 0
}
