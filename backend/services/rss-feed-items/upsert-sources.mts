import type { RssFeedItemToUpsert } from './types.mts'
import sql from 'sql-template-strings'

export type RssFeedItemSourceInput = {
  id: string
  isoDate?: string
  pubDate?: string
}

export function buildRssFeedItemSourceInputs(
  rows: Array<{ id: string; guid: string }>,
  feedItemsByGuid: ReadonlyMap<string, Pick<RssFeedItemToUpsert, 'isoDate' | 'pubDate'>>,
): RssFeedItemSourceInput[] {
  return rows.map(row => {
    const feedItem = feedItemsByGuid.get(row.guid)
    if (!feedItem) throw new Error(`RSS feed input missing for item identity: ${row.id}`)
    return { id: row.id, isoDate: feedItem.isoDate, pubDate: feedItem.pubDate }
  })
}

export function buildRssFeedItemSourcesQuery(rssFeedId: string, rows: RssFeedItemSourceInput[]) {
  if (rows.length === 0) {
    throw new Error('buildRssFeedItemSourcesQuery requires at least one RSS feed item ID')
  }
  return sql`/* buildRssFeedItemSourcesQuery */
    INSERT INTO rss_feed_item_sources (rss_feed_id, rss_feed_item_id, published_at)
    SELECT
      ${rssFeedId},
      input.rss_feed_item_id,
      LEAST(
        COALESCE(fn_text_to_timestamptz(input.iso_date), 'infinity'::timestamptz),
        COALESCE(fn_text_to_timestamptz(input.pub_date), 'infinity'::timestamptz),
        uuid_extract_timestamp(input.rss_feed_item_id)
      )
    FROM unnest(
      ${rows.map(row => row.id)}::uuid[],
      ${rows.map(row => row.isoDate ?? null)}::text[],
      ${rows.map(row => row.pubDate ?? null)}::text[]
    ) AS input (rss_feed_item_id, iso_date, pub_date)
    ORDER BY input.rss_feed_item_id
    ON CONFLICT (rss_feed_id, rss_feed_item_id) DO NOTHING
    RETURNING rss_feed_item_id`
}
