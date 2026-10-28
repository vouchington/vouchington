import {
  createTestRssFeedItemWithUrl,
  createTestTopic,
  createTestUser,
  insertTestRssFeedDirect,
} from '@voucha/test-helpers'
import { getTestRssFeedItemCategories } from '@voucha/test-helpers/entities/rss-feed-item-categories'
import { describe, expect, it } from 'vitest'
import {
  createUnlinkedTopicAlias,
  linkTopicAlias,
  unlinkTopicAlias,
} from '@services/topics/aliases'
import { upsertRssFeedItemCategories } from '../categories.mts'

describe('RSS feed item categories with a pending alias unlink', () => {
  it('does not offer a pending hashtag alias for new categorisation', async () => {
    const user = await createTestUser({ administrator: true })
    const topic = await createTestTopic({ user, name: `Pending owner ${crypto.randomUUID()}` })
    const alias = await createUnlinkedTopicAlias(`#pending-${crypto.randomUUID()}`)
    await linkTopicAlias(topic.id, alias.id)
    const feed = await insertTestRssFeedDirect({ topicId: topic.id })
    await unlinkTopicAlias(alias.id, { expectedTopicId: topic.id })
    const item = await createTestRssFeedItemWithUrl(feed.id)

    await upsertRssFeedItemCategories([
      { rss_feed_item_id: item.id, categories: [`#${alias.alias}`] },
    ])

    await expect(getTestRssFeedItemCategories(item.id)).resolves.toEqual([
      expect.objectContaining({ topic_id: null }),
    ])
  })
})
