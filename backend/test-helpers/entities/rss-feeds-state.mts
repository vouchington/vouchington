import { read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'

type TestRssFeedStateChange = {
  id: string
  rss_feed_id: string
  is_enabled: boolean
  changed_by_id: string | null
  reason: string | null
  created_at: Date
}

export async function getLatestTestRssFeedStateChange(
  kind: 'discoverability' | 'enablement',
  rssFeedId: string,
): Promise<TestRssFeedStateChange | null> {
  const { rows } = await read<TestRssFeedStateChange>(
    `/* getLatestTestRssFeedStateChange */
      SELECT id, rss_feed_id, is_enabled, changed_by_id, reason, created_at
      FROM rss_feed_setting_changes
      WHERE rss_feed_id = $1 AND change_type = $2
      ORDER BY id DESC
      LIMIT 1`,
    [rssFeedId, kind],
  )
  return rows[0] ?? null
}

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

export async function disableTestRssFeed(feedId: string): Promise<void> {
  await write(sql`/* disableTestRssFeed */
    INSERT INTO rss_feed_setting_changes (change_type, rss_feed_id, is_enabled, reason)
    VALUES ('enablement', ${feedId}, FALSE, 'list visibility test')
  `)
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
 * Update RSS feed enabled and last successful fetch timestamps (healthy state).
 */
export async function updateRssFeedTiming(
  feedId: string,
  lastFetchSucceededAt: Date,
): Promise<void> {
  await write(sql`/* updateRssFeedTiming */
    INSERT INTO rss_feed_setting_changes (change_type, rss_feed_id, is_enabled, reason)
    VALUES ('enablement', ${feedId}, TRUE, 'test helper timing update')
  `)
  await write(sql`/* updateRssFeedTiming */
    UPDATE rss_feed_fetch_states
    SET last_fetch_succeeded_at = ${lastFetchSucceededAt},
        last_fetch_failed_at = NULL
    WHERE rss_feed_id = ${feedId}
  `)
}

/**
 * Update RSS feed enabled and last failed fetch timestamps (failing state).
 */
export async function updateRssFeedFailedTiming(
  feedId: string,
  lastFetchFailedAt: Date,
  options: { lastFetchSucceededAt?: Date | null } = {},
): Promise<void> {
  const lastFetchSucceededAt =
    options.lastFetchSucceededAt === undefined ? null : options.lastFetchSucceededAt
  await write(sql`/* updateRssFeedFailedTiming */
    INSERT INTO rss_feed_setting_changes (change_type, rss_feed_id, is_enabled, reason)
    VALUES ('enablement', ${feedId}, TRUE, 'test helper failed timing update')
  `)
  await write(sql`/* updateRssFeedFailedTiming */
    UPDATE rss_feed_fetch_states
    SET last_fetch_failed_at = ${lastFetchFailedAt},
        last_fetch_succeeded_at = ${lastFetchSucceededAt}
    WHERE rss_feed_id = ${feedId}
  `)
}

export async function getTestRssFeedFetchTimestamps(
  feedId: string,
): Promise<{ last_fetch_succeeded_at: Date | null; last_fetch_failed_at: Date | null } | null> {
  const { rows } = await read<{
    last_fetch_succeeded_at: Date | null
    last_fetch_failed_at: Date | null
  }>(sql`/* getTestRssFeedFetchTimestamps */
    SELECT last_fetch_succeeded_at, last_fetch_failed_at
    FROM rss_feed_fetch_states
    WHERE rss_feed_id = ${feedId}
    LIMIT 1
  `)
  return rows[0] ?? null
}
