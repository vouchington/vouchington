import { v4 as uuid } from 'uuid'
import { createTopicAliases } from '../../../services/topics/aliases.mts'
import { upsertRssFeedItems } from '../../../services/rss-feed-items/upsert.mts'
import { createTestTopic } from '../../entities/create-test-entities.mts'
import { insertTestRssFeedDirect } from '../../entities/rss-feeds.mts'

export type RssFeedItemCategoryTestFixture = {
  testTopicId: string
  testRssFeedId: string
  testRssFeedItemId: string
  testAliases: string[]
  testCategories: string[]
}

export async function createRssFeedItemCategoryTestFixture(): Promise<RssFeedItemCategoryTestFixture> {
  const random = Math.random().toString(36).slice(2, 15)
  const topic = await createTestTopic({
    name: `Test Topic ${random}`,
    slug: `test-topic-${random}`,
    hostname: `categories-${random}.example.com`,
  })
  const testAliases = [`technology-${random}`, `tech-${random}`, `computers-${random}`]
  await createTopicAliases(topic.id, testAliases)
  const testCategories = [`science-${random}`, `politics-${random}`]
  const feed = await insertTestRssFeedDirect({
    rssFeedUrl: `https://categories-${random}.example.com/feed-${random}.xml`,
    topicId: topic.id,
    title: `Test Feed ${random}`,
  })
  const items = await upsertRssFeedItems(feed.id, [
    {
      link: `https://test-${uuid()}.example.com/item1`,
      guid: `test-item-${uuid()}`,
      title: 'Test Item',
      categories: [testAliases[0], ...testCategories],
    },
  ])
  return {
    testTopicId: topic.id,
    testRssFeedId: feed.id,
    testRssFeedItemId: items[0].id,
    testAliases,
    testCategories,
  }
}
