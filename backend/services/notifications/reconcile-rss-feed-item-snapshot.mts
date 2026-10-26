import { write } from '@data-stores/psql'
import { itemHasDiscoverableSourceSql } from '@modules/feed-query-builders/discoverability-sql'
import sql from 'sql-template-strings'
import type { RssFeedItemSnapshot } from './reconcile-rss-feed-item-writes.mts'

export async function getRssFeedItemNotificationSnapshot(
  rssFeedItemId: string,
): Promise<RssFeedItemSnapshot | null> {
  const query = sql`/* getRssFeedItemNotificationSnapshot */
    SELECT
      rss_feed_items.id AS rss_feed_item_id,
      COALESCE(rss_feeds.title, urls.url, 'RSS Feed') AS feed_name,
      COALESCE(
        NULLIF(BTRIM(REGEXP_REPLACE(REGEXP_REPLACE(rss_feed_items.data->>'title', '<[^>]*>', ' ', 'g'), '&nbsp;|&#160;|&#xA0;', ' ', 'gi')), ''),
        NULLIF(BTRIM(REGEXP_REPLACE(REGEXP_REPLACE(rss_feed_items.data->>'summary', '<[^>]*>', ' ', 'g'), '&nbsp;|&#160;|&#xA0;', ' ', 'gi')), ''),
        NULLIF(BTRIM(REGEXP_REPLACE(REGEXP_REPLACE(rss_feed_items.data->>'description', '<[^>]*>', ' ', 'g'), '&nbsp;|&#160;|&#xA0;', ' ', 'gi')), ''),
        NULLIF(BTRIM(REGEXP_REPLACE(REGEXP_REPLACE(rss_feed_items.data->>'media:description', '<[^>]*>', ' ', 'g'), '&nbsp;|&#160;|&#xA0;', ' ', 'gi')), ''),
        'New RSS Feed Item'
      ) AS title,
      COALESCE(
        NULLIF(BTRIM(REGEXP_REPLACE(REGEXP_REPLACE(rss_feed_items.data->>'summary', '<[^>]*>', ' ', 'g'), '&nbsp;|&#160;|&#xA0;', ' ', 'gi')), ''),
        NULLIF(BTRIM(REGEXP_REPLACE(REGEXP_REPLACE(rss_feed_items.data->>'description', '<[^>]*>', ' ', 'g'), '&nbsp;|&#160;|&#xA0;', ' ', 'gi')), ''),
        NULLIF(BTRIM(REGEXP_REPLACE(REGEXP_REPLACE(rss_feed_items.data->>'contentSnippet', '<[^>]*>', ' ', 'g'), '&nbsp;|&#160;|&#xA0;', ' ', 'gi')), ''),
        NULLIF(BTRIM(REGEXP_REPLACE(REGEXP_REPLACE(rss_feed_items.data->>'media:description', '<[^>]*>', ' ', 'g'), '&nbsp;|&#160;|&#xA0;', ' ', 'gi')), ''),
        ''
      ) AS description,
      urls.url,
      rss_feed_items.deleted_at,
      (rss_feed_items.deleted_at IS NULL AND `
  query.append(itemHasDiscoverableSourceSql('rss_feed_items.id'))
    .append(sql`) AS is_content_eligible
    FROM rss_feed_items
    JOIN rss_feed_item_sources ON rss_feed_item_sources.rss_feed_item_id = rss_feed_items.id
    JOIN rss_feeds ON rss_feeds.id = rss_feed_item_sources.rss_feed_id
    JOIN urls ON urls.id = rss_feed_items.url_id
    WHERE rss_feed_items.id = ${rssFeedItemId}
    ORDER BY rss_feed_item_sources.created_at ASC
    LIMIT 1
  `)
  const { rows } = await write(query)
  return (rows[0] as RssFeedItemSnapshot | undefined) ?? null
}
