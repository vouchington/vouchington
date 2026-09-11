import { write } from '@data-stores/psql'
import sql, { type SQLStatement } from 'sql-template-strings'

export type RssFeedItemSourcePublicationForTest = {
  item_published_at: Date
  item_published_at_text: string
  source_published_at: Date | null
  source_published_at_text: string | null
  uuid_published_at: Date
}

/** Execute a production source-insert statement and expose its affected-row count to tests. */
export async function executeRssFeedItemSourceInsertForTest(query: SQLStatement): Promise<number> {
  const { rowCount } = await write(query)
  return rowCount ?? 0
}

export async function getRssFeedItemSourcePublicationForTest(
  feedId: string,
  itemId: string,
): Promise<RssFeedItemSourcePublicationForTest> {
  const { rows } =
    await write<RssFeedItemSourcePublicationForTest>(sql`/* getRssFeedItemSourcePublicationForTest */
    SELECT
      item.published_at AS item_published_at,
      to_char(item.published_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS item_published_at_text,
      source.published_at AS source_published_at,
      to_char(source.published_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS source_published_at_text,
      uuid_extract_timestamp(source.rss_feed_item_id) AS uuid_published_at
    FROM rss_feed_item_sources source
    JOIN rss_feed_items item ON item.id = source.rss_feed_item_id
    WHERE source.rss_feed_id = ${feedId}
      AND source.rss_feed_item_id = ${itemId}
  `)
  if (!rows[0]) {
    throw new Error(`RSS feed item source not found: ${feedId}/${itemId}`)
  }
  return rows[0]
}

export async function clearRssFeedItemSourcePublicationsForTest(
  feedId: string,
  itemIds: string[],
): Promise<void> {
  await write(sql`/* clearRssFeedItemSourcePublicationsForTest */
    UPDATE rss_feed_item_sources
    SET published_at = NULL
    WHERE rss_feed_id = ${feedId}
      AND rss_feed_item_id = ANY(${itemIds}::uuid[])
  `)
}

export async function countRssFeedItemSourcePublicationsMissingForTest(
  feedId: string,
  itemIds: string[],
): Promise<bigint> {
  const { rows } = await write<{
    count: string
  }>(sql`/* countRssFeedItemSourcePublicationsMissingForTest */
    SELECT count(*)::bigint AS count
    FROM rss_feed_item_sources
    WHERE rss_feed_id = ${feedId}
      AND rss_feed_item_id = ANY(${itemIds}::uuid[])
      AND published_at IS NULL
  `)
  return BigInt(rows[0]?.count ?? '0')
}
