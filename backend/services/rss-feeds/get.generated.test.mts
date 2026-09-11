import { it, expect, describe } from 'vitest'
import { createRssFeed } from './create.mts'
import { getRssFeedById } from './get.mts'
import { createTestTopic } from '@voucha/test-helpers'
import { v7 } from 'uuid'

describe('get.generated', () => {
  it('getRssFeedById retrieves feed by id', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const topic = await createTestTopic({ hostname: `get-${random}.example.com` })

    const feed = await createRssFeed({
      skipRemoteValidation: true,
      rss_feed_url: `https://example.com/feed-${random}.xml`,
      topic_id: topic.id,
      title: `Test Feed ${random}`,
    })
    const retrieved = await getRssFeedById(feed.id)
    expect(retrieved).toBeDefined()
    expect(retrieved!.id).toBe(feed.id)
    expect(retrieved!.title).toBe(`Test Feed ${random}`)
  })

  it('getRssFeedById returns null for non-existent id', async () => {
    const nonExistentId = v7()

    const feed = await getRssFeedById(nonExistentId)
    expect(feed).toBeNull()
  })
})
