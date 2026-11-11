import type { AuthenticatedAgent } from './api/server.mts'
import { createTestTopic } from './entities/create-test-entities.mts'
import {
  createTestRssFeedItemWithUrl,
  createTestRssFeedWithTiming,
} from './entities/test-entities.mts'
import { createTestUser } from './entities/users.mts'
import { setHackerNewsReferenceFlagsForTest } from './hacker-news-references.mts'

/** An owned feed with one referenced item and one plain item. */
export async function createHackerNewsFeedFilterFixture() {
  const [user, topic] = await Promise.all([createTestUser(), createTestTopic()])
  const feedId = await createTestRssFeedWithTiming(topic.id)
  const [seen, plain] = await Promise.all([
    createTestRssFeedItemWithUrl(feedId),
    createTestRssFeedItemWithUrl(feedId),
  ])
  await setHackerNewsReferenceFlagsForTest([], [seen.id])
  return { user, feedId, seen, plain }
}

/** Read each accepted boolean spelling in stable order through the actual API. */
export function readHackerNewsFilteredItemIds(
  request: AuthenticatedAgent,
  feedType: 'follow_rss_feeds' | 'follow_users',
): Promise<string[][]> {
  return Promise.all(
    ['true', 'TRUE', '1', 'false', 'FALSE', '0'].map(async value => {
      const response = await request
        .get(`/api/v1/feeds/rss_feed_items/${feedType}`)
        .query({ has_hacker_news_references: value, time_range: 'all' })
        .expect(200)
      return response.body.results.map((row: { entity_id: string }) => row.entity_id)
    }),
  )
}
