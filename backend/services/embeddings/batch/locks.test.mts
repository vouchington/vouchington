import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  createTestBatch,
  createTestUrlWithHostname,
  createTestUserDirect,
  insertTestPost,
  insertTestRssFeed,
  insertTestRssFeedItem,
  insertTestTopic,
} from '@voucha/test-helpers'
import { isEntityLockedForBatch } from './locks.mts'

describe('isEntityLockedForBatch', () => {
  it('checks typed lock columns for single embedding entity types', async () => {
    const user = await createTestUserDirect()
    const suffix = randomUUID().slice(0, 8)
    const topicId = await insertTestTopic({
      name: `Single Lock ${suffix}`,
      slug: `single-lock-${suffix}`,
      createdById: user.id,
    })
    const postId = await insertTestPost({
      title: `Single Lock Post ${suffix}`,
      slug: `single-lock-post-${suffix}`,
      markdown: 'Post body',
      createdById: user.id,
    })
    const feedId = await insertTestRssFeed({ topicId, title: `Single Lock Feed ${suffix}` })
    const urlId = await createTestUrlWithHostname()
    const rssFeedItemId = await insertTestRssFeedItem({
      rssFeedId: feedId,
      urlId,
      guid: `single-lock-${suffix}`,
      itemData: { title: 'RSS item' },
      contentSha256: Buffer.from('4'.repeat(64), 'hex'),
    })

    await createTestBatch({ entityIds: [topicId], jobType: 'topics' })
    await createTestBatch({ entityIds: [postId], jobType: 'posts' })
    await createTestBatch({ entityIds: [rssFeedItemId], jobType: 'rss_feed_items' })

    await expect(isEntityLockedForBatch('topic', topicId)).resolves.toBe(true)
    await expect(isEntityLockedForBatch('post', postId)).resolves.toBe(true)
    await expect(isEntityLockedForBatch('rss_feed_item', rssFeedItemId)).resolves.toBe(true)
  })
})
