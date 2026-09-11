import { beforeAll, describe, expect, it, vi } from 'vitest'
import type { PrivateUser } from '@services/users/types'
import { createTestUser, getRssFeedFollowExistsForTest } from '@voucha/test-helpers'
import type { FeedClassification } from '../validate.mts'
import { createSourceFromUrl } from '../create-source.mts'

let user: PrivateUser

describe('create-source.part-2', () => {
  beforeAll(async () => {
    user = await createTestUser()
  })

  it('allows multiple feeds from the same domain', async () => {
    const random = Math.random().toString(36).slice(2, 12)
    const domain = `multi-feed-${random}.example.com`
    const fetchAndClassifyFeedImpl = vi
      .fn<(rssFeedUrl: string) => Promise<FeedClassification>>()
      .mockImplementation(async rssFeedUrl => {
        if (rssFeedUrl.endsWith('/feed1.xml')) {
          return { kind: 'feed', title: `Feed A ${random}`, feedType: 'article' }
        }
        return { kind: 'feed', title: `Feed B ${random}`, feedType: 'podcast' }
      })

    const first = await createSourceFromUrl(user, `https://${domain}/feed1.xml`, {
      fetchAndClassifyFeedImpl,
    })
    const second = await createSourceFromUrl(user, `https://${domain}/feed2.xml`, {
      fetchAndClassifyFeedImpl,
    })

    expect(first.status).toBe('created')
    expect(second.status).toBe('created')
    expect(first.topic_id).not.toBe(second.topic_id)
    expect(first.rss_feed_id).not.toBe(second.rss_feed_id)
  })

  it('follows the feed on creation when follow:true', async () => {
    const random = Math.random().toString(36).slice(2, 12)
    const fetchAndClassifyFeedImpl = vi.fn<(...args: any[]) => Promise<any>>(
      async (): Promise<FeedClassification> => ({
        kind: 'feed',
        title: `Follow Feed ${random}`,
        feedType: 'article',
      }),
    )

    const result = await createSourceFromUrl(
      user,
      `https://follow-on-create-${random}.example.com/feed.xml`,
      { follow: true, fetchAndClassifyFeedImpl },
    )

    expect(result.status).toBe('created')
    expect(await getRssFeedFollowExistsForTest(user.id, result.rss_feed_id)).toBe(true)
  })

  it('follows the feed on duplicate submission when follow:true (race condition path)', async () => {
    const random = Math.random().toString(36).slice(2, 12)
    const feedUrl = `https://follow-on-dup-${random}.example.com/feed.xml`
    const fetchAndClassifyFeedImpl = vi.fn<(...args: any[]) => Promise<any>>(
      async (): Promise<FeedClassification> => ({
        kind: 'feed',
        title: `Follow Dup Feed ${random}`,
        feedType: 'article',
      }),
    )

    const first = await createSourceFromUrl(user, feedUrl, { fetchAndClassifyFeedImpl })
    expect(first.status).toBe('created')

    const second = await createSourceFromUrl(user, feedUrl, {
      follow: true,
      fetchAndClassifyFeedImpl,
    })
    expect(second.status).toBe('upvoted')
    expect(await getRssFeedFollowExistsForTest(user.id, second.rss_feed_id)).toBe(true)
  })
})
