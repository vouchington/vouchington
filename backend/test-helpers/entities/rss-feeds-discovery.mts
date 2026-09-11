import { read, write } from '@data-stores/psql'
import sql, { type SQLStatement } from 'sql-template-strings'

function itemHasDiscoverableSourceSql(itemColumnSql: string): SQLStatement {
  const stmt = sql`EXISTS (
    SELECT 1
    FROM rss_feed_item_sources rfis
    JOIN rss_feeds rf ON rf.id = rfis.rss_feed_id
    JOIN view_rss_feed_current_states current_state
      ON current_state.rss_feed_id = rf.id
    WHERE rfis.rss_feed_item_id = `
  stmt.append(itemColumnSql)
  stmt.append(sql`
      AND rf.deleted_at IS NULL
      AND current_state.is_enabled = TRUE
      AND current_state.is_discoverable = TRUE
  )`)
  return stmt
}

export async function checkItemUnsuppressedGlobal(itemId: string): Promise<boolean> {
  const predicate = itemHasDiscoverableSourceSql('rfi.id')
  const query = sql`SELECT (`
  query.append(predicate)
  query.append(sql`) AS result FROM rss_feed_items rfi WHERE rfi.id = ${itemId}`)
  const { rows } = await read(query)
  return rows[0]?.result === true
}

export async function checkItemClusterEligible(itemId: string): Promise<boolean> {
  const predicate = itemHasDiscoverableSourceSql('rfi.id')
  const query = sql`SELECT (`
  query.append(predicate)
  query.append(sql`) AS result FROM rss_feed_items rfi WHERE rfi.id = ${itemId}`)
  const { rows } = await read(query)
  return rows[0]?.result === true
}

export async function setTestRssFeedDiscoverable(
  rssFeedId: string,
  enabled: boolean,
): Promise<void> {
  await write(sql`/* setTestRssFeedDiscoverable */
    INSERT INTO rss_feed_discoverability_changes (rss_feed_id, enabled, reason)
    VALUES (${rssFeedId}, ${enabled}, 'test helper state')
  `)
}

export async function getRssFeedCrawlById(crawlId: string): Promise<{
  response_code: number
  feed_data: unknown
  feed_data_sha256: Buffer
} | null> {
  const { rows } = await read(
    `
    SELECT response_code, feed_data, feed_data_sha256
    FROM rss_feed_crawls
    WHERE id = $1
  `,
    [crawlId],
  )

  return rows[0] ?? null
}
