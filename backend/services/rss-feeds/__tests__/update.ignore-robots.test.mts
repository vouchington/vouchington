import { it, expect, beforeAll, describe } from 'vitest'
import { createRssFeed } from '../create.mts'
import { updateRssFeedById } from '../update.mts'
import {
  createTestTopic,
  createTestUser,
  getRssFeedIgnoreRobotsTxtForTest,
} from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'

describe('update.ignore-robots', () => {
  let sharedUser: PrivateUser

  beforeAll(async () => {
    sharedUser = await createTestUser({ administrator: true })
  })

  it('updateRssFeedById sets ignore_robots_txt to true', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const topic = await createTestTopic({
      user: sharedUser,
      hostname: `ignore-robots-set-${random}.example.com`,
    })

    const feed = await createRssFeed({
      skipRemoteValidation: true,
      rss_feed_url: `https://example.com/feed-${random}.xml`,
      topic_id: topic.id,
      title: `Test Feed ${random}`,
    })
    await updateRssFeedById(feed.id, { ignore_robots_txt: true })

    expect(await getRssFeedIgnoreRobotsTxtForTest(feed.id)).toBe(true)
  })

  it('updateRssFeedById clears ignore_robots_txt to null', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const topic = await createTestTopic({
      user: sharedUser,
      hostname: `ignore-robots-null-${random}.example.com`,
    })

    const feed = await createRssFeed({
      skipRemoteValidation: true,
      rss_feed_url: `https://example.com/feed-${random}.xml`,
      topic_id: topic.id,
      title: `Test Feed ${random}`,
    })
    await updateRssFeedById(feed.id, { ignore_robots_txt: true })
    await updateRssFeedById(feed.id, { ignore_robots_txt: null })

    expect(await getRssFeedIgnoreRobotsTxtForTest(feed.id)).toBeNull()
  })
})
