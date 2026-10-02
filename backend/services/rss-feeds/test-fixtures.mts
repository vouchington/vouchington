/**
 * Test-only fixture: create an RSS feed via the real create path.
 *
 * This lives in @services/rss-feeds rather than @voucha/test-helpers because the real
 * createRssFeed is genuine business logic: URL/UUID validation, assertTopicHasHostname,
 * createRssFeedUrlId, a transaction-wrapped INSERT plus createInitialRssFeedStateChanges,
 * and — critically — fire-and-forget enqueueBulkFetchRssFeeds / enqueueEvaluateRssFeedDiscoverability
 * side effects whenever no caller-managed transaction is passed (always true for fixture usage).
 * @voucha/test-helpers must never depend on this service (this service already devDeps
 * @voucha/test-helpers for its own tests), so consumers that need this fixture import it
 * from here directly instead of through the @voucha/test-helpers barrel.
 */

import { createTestTopic, WEB_PROVENANCE } from '@voucha/test-helpers'
import { createRandomString } from '@voucha/test-helpers/data'
import { createRssFeed } from './create.mts'

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
