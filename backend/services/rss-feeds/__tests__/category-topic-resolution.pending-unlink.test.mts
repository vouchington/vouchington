import {
  createTestRssFeedItemWithUrl,
  createTestTopic,
  createTestUser,
  createTopHashtagRssSourceForTest,
  insertTestRssFeedDirect,
} from '@voucha/test-helpers'
import { describe, expect, it } from 'vitest'
import {
  createUnlinkedTopicAlias,
  linkTopicAlias,
  unlinkTopicAlias,
} from '@services/topics/aliases'
import { resolveRssFeedCategoryTopics } from '../category-topic-resolution.mts'

describe('RSS feed category resolution with a pending alias unlink', () => {
  it('resolves a pending hashtag alias to no topic', async () => {
    const user = await createTestUser({ administrator: true })
    const topic = await createTestTopic({ user, name: `Pending owner ${crypto.randomUUID()}` })
    const alias = await createUnlinkedTopicAlias(`#pending-${crypto.randomUUID()}`)
    await linkTopicAlias(topic.id, alias.id)
    const feed = await insertTestRssFeedDirect({ topicId: topic.id })
    const item = await createTestRssFeedItemWithUrl(feed.id)
    await unlinkTopicAlias(alias.id, { expectedTopicId: topic.id })
    await createTopHashtagRssSourceForTest({
      rssFeedItemId: item.id,
      topicAliasId: alias.id,
      authoredToken: alias.alias,
    })

    await expect(resolveRssFeedCategoryTopics(feed.id, [alias.alias])).resolves.toEqual([
      expect.objectContaining({ topic_id: null }),
    ])
  })
})
