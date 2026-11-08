import { beginTransaction, read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function getTestUrlRanking(urlId: string): Promise<{
  feedRank: number
  latestPublishedAt: Date | null
}> {
  const { rows } = await read<{ feed_rank: number; latest_published_at: Date | null }>(
    sql`/* getTestUrlRanking */
      SELECT feed_rank, latest_published_at FROM urls WHERE id = ${urlId}`,
  )
  if (!rows[0]) throw new Error(`URL not found: ${urlId}`)
  return { feedRank: rows[0].feed_rank, latestPublishedAt: rows[0].latest_published_at }
}

export async function reassignTestRssFeedItemUrl(itemId: string, urlId: string): Promise<void> {
  await write(sql`/* reassignTestRssFeedItemUrl */
    UPDATE rss_feed_items SET url_id = ${urlId} WHERE id = ${itemId}`)
}

export async function rollBackTestRssFeedItemMoveAndDate(
  itemId: string,
  urlId: string,
  isoDate: string,
): Promise<void> {
  await using transaction = await beginTransaction()
  await transaction(sql`/* rollBackTestRssFeedItemMoveAndDate */
    UPDATE rss_feed_items
    SET url_id = ${urlId}, data = jsonb_set(data, '{isoDate}', to_jsonb(${isoDate}::text))
    WHERE id = ${itemId}`)
}

export async function setTestRssFeedItemDate(itemId: string, isoDate: string): Promise<void> {
  await write(sql`/* setTestRssFeedItemDate */
    UPDATE rss_feed_items SET data = jsonb_set(data, '{isoDate}', to_jsonb(${isoDate}::text))
    WHERE id = ${itemId}`)
}

export async function softDeleteTestRssFeedItem(itemId: string): Promise<void> {
  await write(sql`/* softDeleteTestRssFeedItem */
    UPDATE rss_feed_items SET deleted_at = CURRENT_TIMESTAMP WHERE id = ${itemId}`)
}

export async function hardDeleteTestRssFeedItem(itemId: string): Promise<void> {
  await write(
    sql`/* hardDeleteTestRssFeedItem */ DELETE FROM rss_feed_item_guids WHERE id = ${itemId}`,
  )
}

export async function moveTestRssFeedUrl(feedId: string, urlId: string): Promise<void> {
  await write(sql`/* moveTestRssFeedUrl */
    UPDATE rss_feeds SET rss_feed_url_id = ${urlId} WHERE id = ${feedId}`)
}

export async function softDeleteTestRssFeed(feedId: string): Promise<void> {
  await write(sql`/* softDeleteTestRssFeed */
    UPDATE rss_feeds SET deleted_at = CURRENT_TIMESTAMP WHERE id = ${feedId}`)
}
