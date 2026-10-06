import { read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'

/**
 * Returns the deleted_at timestamp for a given RSS feed, or null if not soft-deleted.
 * Reads directly from the raw table to bypass the view (which does not expose deleted_at).
 */
export async function getRssFeedDeletedAt(feedId: string): Promise<Date | null> {
  const { rows } = await read(
    sql`/* getRssFeedDeletedAt */ SELECT deleted_at FROM rss_feeds WHERE id = ${feedId} LIMIT 1`,
  )
  return (rows[0]?.deleted_at as Date | undefined) ?? null
}

/**
 * Delete RSS feeds by IDs
 */
export async function deleteRssFeedsByIds(feedIds: string[]): Promise<void> {
  if (feedIds.length === 0) return
  await write(sql`/* deleteRssFeedsByIds */ DELETE FROM rss_feeds WHERE id = ANY(${feedIds})`)
}

export async function ensureTestRssFeedEnabled(feedId: string): Promise<void> {
  await write(sql`/* ensureTestRssFeedEnabled */
    INSERT INTO rss_feed_setting_changes (change_type, rss_feed_id, is_enabled, reason)
    VALUES ('enablement', ${feedId}, TRUE, 'qa seed recovery')
  `)
  await write(sql`/* ensureTestRssFeedEnabled */
    INSERT INTO rss_feed_setting_changes (change_type, rss_feed_id, is_enabled, reason)
    VALUES ('discoverability', ${feedId}, TRUE, 'qa seed recovery')
  `)
}

/**
 * Update RSS feed enabled and last fetched timestamps
 */
export async function updateRssFeedTiming(feedId: string, lastFetchedAt: Date): Promise<void> {
  await write(sql`/* updateRssFeedTiming */
    UPDATE rss_feeds
    SET last_fetched_at = ${lastFetchedAt}
    WHERE id = ${feedId}
  `)
  await write(sql`/* updateRssFeedTiming */
    INSERT INTO rss_feed_setting_changes (change_type, rss_feed_id, is_enabled, reason)
    VALUES ('enablement', ${feedId}, TRUE, 'test helper timing update')
  `)
}
