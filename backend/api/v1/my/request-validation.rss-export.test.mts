import { beforeAll, describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  createTestUser,
  insertEntityRelation,
  insertTestRssFeed,
  insertTestTopic,
} from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'

// The RSS export is the one `/my` query carrier whose schema can reject a request. These tests
// follow a feed of two different types so an empty `feed_type` (no filter) and a real filter are
// told apart, which an empty export cannot do.
describe('GET /api/v1/my/export/rss-feeds feed_type filter', () => {
  let user: PrivateUser
  let articleTitle: string
  let podcastTitle: string

  const exportTitles = async (query: string): Promise<string[]> => {
    const request = createRequest()
    await request.authenticateAs(user)
    const response = await request
      .get(`/api/v1/my/export/rss-feeds?format=json&${query}`)
      .expect(200)
    return response.body.results.map((feed: { title: string }) => feed.title)
  }

  beforeAll(async () => {
    user = await createTestUser()
    const suffix = Math.random().toString(36).slice(2)
    articleTitle = `Article Export Feed ${suffix}`
    podcastTitle = `Podcast Export Feed ${suffix}`
    // An RSS feed is unique per topic, so each feed gets its own.
    for (const [title, feedType] of [
      [articleTitle, 'article'],
      [podcastTitle, 'podcast'],
    ] as const) {
      const topicId = await insertTestTopic({
        name: `Export ${feedType} Topic ${suffix}`,
        slug: `export-${feedType}-topic-${suffix}`,
        createdById: user.id,
      })
      const feedId = await insertTestRssFeed({
        topicId,
        title,
        feedType,
        rssFeedUrl: `https://${feedType}-${suffix}.example.com/feed.xml`,
      })
      await insertEntityRelation('relation__user__follow__rss_feed', user.id, feedId)
    }
  })

  it('exports every followed feed for an empty feed_type or none', async () => {
    for (const query of ['feed_type=', 'foo=bar']) {
      const titles = await exportTitles(query)
      expect(titles).toContain(articleTitle)
      expect(titles).toContain(podcastTitle)
    }
  })

  it('exports only the requested feed type', async () => {
    const articles = await exportTitles('feed_type=article')
    expect(articles).toContain(articleTitle)
    expect(articles).not.toContain(podcastTitle)
    const podcasts = await exportTitles('feed_type=podcast')
    expect(podcasts).toContain(podcastTitle)
    expect(podcasts).not.toContain(articleTitle)
    expect(await exportTitles('feed_type=video')).toEqual([])
  })
})
