/**
 * RSS feed crawl entity helpers
 */

import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'

async function insertRssFeedCrawl(params: {
  rss_feed_id: string
  response_code: number
  feed_data?: Record<string, unknown> | null
  feed_data_sha256?: Buffer | null
  redirect_url_id?: string | null
}): Promise<string> {
  const feedData = params.feed_data === undefined ? null : params.feed_data
  const feedDataSha256 = params.feed_data_sha256 === undefined ? null : params.feed_data_sha256
  const redirectUrlId = params.redirect_url_id === undefined ? null : params.redirect_url_id
  const { rows } = await write(sql`/* insertRssFeedCrawl */
    INSERT INTO rss_feed_crawls (rss_feed_id, response_code, feed_data, feed_data_sha256, redirect_url_id)
    VALUES (${params.rss_feed_id}, ${params.response_code}, ${feedData}, ${feedDataSha256}, ${redirectUrlId})
    RETURNING id
  `)
  return rows[0]!.id
}

/**
 * Insert a test RSS feed crawl record and return its id.
 */
export async function insertTestRssFeedCrawl(params: {
  rssFeedId: string
  responseCode?: number
}): Promise<string> {
  return insertRssFeedCrawl({
    rss_feed_id: params.rssFeedId,
    response_code: params.responseCode ?? 200,
  })
}
