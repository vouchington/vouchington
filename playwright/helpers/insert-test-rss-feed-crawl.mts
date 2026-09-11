import { write } from '../../backend/data-stores/psql/clients.mts'

interface TestRssFeedCrawl {
  id: string
  rssFeedId: string
  responseCode: number
}

export async function insertTestRssFeedCrawl(
  rssFeedId: string,
  options: {
    responseCode?: number
    feedData?: Record<string, unknown> | null
  } = {},
): Promise<TestRssFeedCrawl> {
  const { responseCode = 200, feedData = null } = options
  const result = await write(
    `INSERT INTO rss_feed_crawls (rss_feed_id, response_code, feed_data)
     VALUES ($1, $2, $3)
     RETURNING id`,
    [rssFeedId, responseCode, feedData ? JSON.stringify(feedData) : null],
  )
  const id = result.rows[0].id as string
  return { id, rssFeedId, responseCode }
}
