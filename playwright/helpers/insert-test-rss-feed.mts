import { write } from '../../backend/data-stores/psql/clients.mts'
import { linkHostnameToSourceTopic } from '../../backend/services/topics/hostname-link.mts'

interface TestRssFeed {
  id: string
  topicId: string
  rssFeedUrlId: string
  homePageUrlId: string
  hostname: string
  hostnameId: string
}

/**
 * Insert a test RSS feed for a given topic.
 * Creates fresh URL rows to avoid conflicts with other tests.
 * Returns the RSS feed ID.
 */
export async function insertTestRssFeed(topicId: string, suffix: string): Promise<TestRssFeed> {
  const hostname = `${suffix}.example.com`
  const hostnameResult = await write(
    `INSERT INTO url_hostnames (hostname)
     VALUES ($1)
     RETURNING id`,
    [hostname],
  )
  const hostnameId = hostnameResult.rows[0].id as string

  // Insert URLs for the feed
  const rssFeedUrlResult = await write(
    `INSERT INTO urls (url, hostname_id, pathname, search_params)
     VALUES ($1, $2, $3, '{}'::JSONB)
     ON CONFLICT (url) DO UPDATE SET hostname_id = EXCLUDED.hostname_id
     RETURNING id`,
    [`https://${hostname}/feed.xml`, hostnameId, '/feed.xml'],
  )
  const rssFeedUrlId = rssFeedUrlResult.rows[0].id as string

  const homePageUrlResult = await write(
    `INSERT INTO urls (url, hostname_id, pathname, search_params)
     VALUES ($1, $2, $3, '{}'::JSONB)
     ON CONFLICT (url) DO UPDATE SET hostname_id = EXCLUDED.hostname_id
     RETURNING id`,
    [`https://${hostname}/`, hostnameId, '/'],
  )
  const homePageUrlId = homePageUrlResult.rows[0].id as string

  await linkHostnameToSourceTopic(topicId, hostnameId)

  const feedResult = await write(
    `INSERT INTO rss_feeds (rss_feed_url_id, topic_id, title)
     VALUES ($1, $2, $3)
     RETURNING id`,
    [rssFeedUrlId, topicId, `Test Feed ${suffix}`],
  )
  const id = feedResult.rows[0].id as string

  await write(
    `INSERT INTO rss_feed_enablement_changes (rss_feed_id, enabled, reason)
     VALUES ($1, TRUE, $2)`,
    [id, 'playwright test fixture'],
  )
  await write(
    `INSERT INTO rss_feed_discoverability_changes (rss_feed_id, enabled, reason)
     VALUES ($1, TRUE, $2)`,
    [id, 'playwright test fixture'],
  )

  return { id, topicId, rssFeedUrlId, homePageUrlId, hostname, hostnameId }
}
