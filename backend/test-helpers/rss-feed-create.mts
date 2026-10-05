/**
 * Test-only fixture: create an RSS feed via the real create path.
 *
 * Import this narrow helper directly, outside the main test-helper barrel. The source-relative
 * service import avoids a workspace dependency cycle while preserving URL/UUID validation,
 * hostname attachment checks, initial state changes, and the real create path's enqueue effects.
 */

import { createTestTopic, WEB_PROVENANCE } from '@voucha/test-helpers'
import { createRandomString } from '@voucha/test-helpers/data'
import { createRssFeed } from '../services/rss-feeds/create.mts'

export async function createTestRssFeed(options: {
  topicId?: string
  topicHostname?: string
  title?: string
  rssFeedUrl?: string
}) {
  const random = createRandomString(13)
  const rssFeedUrl = options.rssFeedUrl || `https://feed-${random}.example.com/feed.xml`

  let topicId = options.topicId
  if (!topicId) {
    const topic = await createTestTopic({
      hostname: options.topicHostname || `feed-${random}.example.com`,
    })
    topicId = topic.id
  }

  const feed = await createRssFeed({
    provenance: WEB_PROVENANCE,
    skipRemoteValidation: true,
    rss_feed_url: rssFeedUrl,
    topic_id: topicId,
    title: options.title || `Test Feed ${random}`,
  })
  return feed
}
