import { write } from '@data-stores/psql'
import type { FetchTimestampColumn } from '@services/crawls/fetch-outcome'
import sql from 'sql-template-strings'

/** Stamps last_fetch_failed_at on rss_feed_fetch_states without touching rss_feeds. */
export async function stampRssFeedFetchFailedAt(rssFeedId: string): Promise<void> {
  await write(sql`/* stampRssFeedFetchFailedAt */
    UPDATE rss_feed_fetch_states
    SET last_fetch_failed_at = CURRENT_TIMESTAMP
    WHERE rss_feed_id = ${rssFeedId}
  `)
}

/** Inserts an rss_feed_crawls row and updates rss_feed_fetch_states in a single statement. */
export async function insertRssFeedCrawlAndStampState(params: {
  rss_feed_id: string
  response_code: number
  feed_data?: Record<string, unknown> | null
  feed_data_sha256?: Buffer | null
  redirect_url_id?: string | null
  timestampColumn: FetchTimestampColumn | null
}): Promise<string> {
  if (params.timestampColumn === 'last_fetch_succeeded_at') {
    const { rows } = await write<{ id: string }>(sql`/* insertRssFeedCrawlAndStampSucceeded */
      WITH inserted_crawl AS (
        INSERT INTO rss_feed_crawls (rss_feed_id, response_code, feed_data, feed_data_sha256, redirect_url_id)
        VALUES (${params.rss_feed_id}, ${params.response_code}, ${params.feed_data ?? null}, ${params.feed_data_sha256 ?? null}, ${params.redirect_url_id ?? null})
        RETURNING id
      ),
      updated_state AS (
        UPDATE rss_feed_fetch_states
        SET last_fetch_succeeded_at = CASE
          WHEN last_fetch_failed_at = CURRENT_TIMESTAMP
            THEN CURRENT_TIMESTAMP + INTERVAL '1 microsecond'
          ELSE CURRENT_TIMESTAMP
        END
        WHERE rss_feed_id = ${params.rss_feed_id}
      )
      SELECT id FROM inserted_crawl
    `)
    return rows[0]!.id
  }
  if (params.timestampColumn === 'last_fetch_failed_at') {
    const { rows } = await write<{ id: string }>(sql`/* insertRssFeedCrawlAndStampFailed */
      WITH inserted_crawl AS (
        INSERT INTO rss_feed_crawls (rss_feed_id, response_code, feed_data, feed_data_sha256, redirect_url_id)
        VALUES (${params.rss_feed_id}, ${params.response_code}, ${params.feed_data ?? null}, ${params.feed_data_sha256 ?? null}, ${params.redirect_url_id ?? null})
        RETURNING id
      ),
      updated_state AS (
        UPDATE rss_feed_fetch_states
        SET last_fetch_failed_at = CURRENT_TIMESTAMP
        WHERE rss_feed_id = ${params.rss_feed_id}
      )
      SELECT id FROM inserted_crawl
    `)
    return rows[0]!.id
  }
  const { rows } = await write<{ id: string }>(sql`/* insertRssFeedCrawl */
    INSERT INTO rss_feed_crawls (rss_feed_id, response_code, feed_data, feed_data_sha256, redirect_url_id)
    VALUES (${params.rss_feed_id}, ${params.response_code}, ${params.feed_data ?? null}, ${params.feed_data_sha256 ?? null}, ${params.redirect_url_id ?? null})
    RETURNING id
  `)
  return rows[0]!.id
}
