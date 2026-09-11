import { describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/api/test-helpers/server'
import {
  createTestRssFeedItemWithUrl,
  createTestRssFeedWithTiming,
  createTestTopic,
  createTestUser,
  insertRecentlyViewedRssFeedItem,
  safeUsername,
  setRssFeedItemMediaType,
} from '@voucha/test-helpers'

describe('GET /api/v1/users/:idOrSlug/rss-feed-items/viewed media_type pagination', () => {
  it('returns the matching viewed item on page 1 when newer rows have a different media_type', async () => {
    const owner = await createTestUser({ username: safeUsername('rss-viewed-filtered') })
    if (!owner) throw new Error('Failed to create owner')
    const topic = await createTestTopic({
      name: `RSS viewed filtered ${owner.id}`,
      slug: `rss-viewed-filtered-${owner.id}`,
    })
    const feedId = await createTestRssFeedWithTiming(topic.id)
    const article = await createTestRssFeedItemWithUrl(feedId)
    const audio = await createTestRssFeedItemWithUrl(feedId)
    await setRssFeedItemMediaType(article.id, 'article')
    await setRssFeedItemMediaType(audio.id, 'audio')
    // View article first, then audio, so audio is more recent. The filtered page must walk
    // past audio and return the article instead of an empty page 1.
    await insertRecentlyViewedRssFeedItem(owner.id, article.id)
    await insertRecentlyViewedRssFeedItem(owner.id, audio.id)

    const request = createRequest()
    await request.authenticateAs(owner)
    const page = await request
      .get(`/api/v1/users/${owner.id}/rss-feed-items/viewed?limit=1&media_type=article`)
      .expect(200)

    expect(page.body.results.map((item: { id: string }) => item.id)).toEqual([article.id])
    expect(page.body.page_info).toMatchObject({ has_next_page: false, end_cursor: null })
  })

  it('returns the matching viewed article on page 1 at the production default limit', async () => {
    const owner = await createTestUser({ username: safeUsername('rss-viewed-sparse-25') })
    if (!owner) throw new Error('Failed to create owner')
    const topic = await createTestTopic({
      name: `RSS viewed sparse 25 ${owner.id}`,
      slug: `rss-viewed-sparse-25-${owner.id}`,
    })
    const feedId = await createTestRssFeedWithTiming(topic.id)
    const article = await createTestRssFeedItemWithUrl(feedId)
    await setRssFeedItemMediaType(article.id, 'article')
    await insertRecentlyViewedRssFeedItem(owner.id, article.id)
    for (let index = 0; index < 25; index++) {
      const audio = await createTestRssFeedItemWithUrl(feedId)
      await setRssFeedItemMediaType(audio.id, 'audio')
      await insertRecentlyViewedRssFeedItem(owner.id, audio.id)
    }

    const request = createRequest()
    await request.authenticateAs(owner)
    const page = await request
      .get(`/api/v1/users/${owner.id}/rss-feed-items/viewed?limit=25&media_type=article`)
      .expect(200)

    expect(page.body.results.map((item: { id: string }) => item.id)).toEqual([article.id])
    expect(page.body.page_info).toMatchObject({ has_next_page: false, end_cursor: null })
  })

  it('paginates media_type-filtered viewed items without duplicates or skipped matches', async () => {
    const owner = await createTestUser({ username: safeUsername('rss-viewed-dense-page') })
    if (!owner) throw new Error('Failed to create owner')
    const topic = await createTestTopic({
      name: `RSS viewed dense page ${owner.id}`,
      slug: `rss-viewed-dense-page-${owner.id}`,
    })
    const feedId = await createTestRssFeedWithTiming(topic.id)
    const article1 = await createTestRssFeedItemWithUrl(feedId)
    const audio = await createTestRssFeedItemWithUrl(feedId)
    const article2 = await createTestRssFeedItemWithUrl(feedId)
    const article3 = await createTestRssFeedItemWithUrl(feedId)
    await setRssFeedItemMediaType(article1.id, 'article')
    await setRssFeedItemMediaType(audio.id, 'audio')
    await setRssFeedItemMediaType(article2.id, 'article')
    await setRssFeedItemMediaType(article3.id, 'article')
    await insertRecentlyViewedRssFeedItem(owner.id, article1.id)
    await insertRecentlyViewedRssFeedItem(owner.id, audio.id)
    await insertRecentlyViewedRssFeedItem(owner.id, article2.id)
    await insertRecentlyViewedRssFeedItem(owner.id, article3.id)

    const request = createRequest()
    await request.authenticateAs(owner)
    const page1 = await request
      .get(`/api/v1/users/${owner.id}/rss-feed-items/viewed?limit=1&media_type=article`)
      .expect(200)
    expect(page1.body.results.map((item: { id: string }) => item.id)).toEqual([article3.id])
    expect(page1.body.page_info.has_next_page).toBe(true)
    expect(page1.body.page_info.end_cursor).not.toBeNull()

    const page2 = await request
      .get(
        `/api/v1/users/${owner.id}/rss-feed-items/viewed?limit=1&media_type=article&after=${encodeURIComponent(page1.body.page_info.end_cursor)}`,
      )
      .expect(200)
    expect(page2.body.results.map((item: { id: string }) => item.id)).toEqual([article2.id])
    expect(page2.body.page_info.has_next_page).toBe(true)

    const page3 = await request
      .get(
        `/api/v1/users/${owner.id}/rss-feed-items/viewed?limit=1&media_type=article&after=${encodeURIComponent(page2.body.page_info.end_cursor)}`,
      )
      .expect(200)
    expect(page3.body.results.map((item: { id: string }) => item.id)).toEqual([article1.id])
    expect(page3.body.page_info).toMatchObject({ has_next_page: false, end_cursor: null })
  })

  it('derives the filtered viewed cursor from the last match, not a skipped non-match', async () => {
    const owner = await createTestUser({ username: safeUsername('rss-viewed-cursor-match') })
    if (!owner) throw new Error('Failed to create owner')
    const topic = await createTestTopic({
      name: `RSS viewed cursor match ${owner.id}`,
      slug: `rss-viewed-cursor-match-${owner.id}`,
    })
    const feedId = await createTestRssFeedWithTiming(topic.id)
    const article1 = await createTestRssFeedItemWithUrl(feedId)
    const audio = await createTestRssFeedItemWithUrl(feedId)
    const article2 = await createTestRssFeedItemWithUrl(feedId)
    await setRssFeedItemMediaType(article1.id, 'article')
    await setRssFeedItemMediaType(audio.id, 'audio')
    await setRssFeedItemMediaType(article2.id, 'article')
    await insertRecentlyViewedRssFeedItem(owner.id, article1.id)
    await insertRecentlyViewedRssFeedItem(owner.id, audio.id)
    await insertRecentlyViewedRssFeedItem(owner.id, article2.id)

    const request = createRequest()
    await request.authenticateAs(owner)
    const page1 = await request
      .get(`/api/v1/users/${owner.id}/rss-feed-items/viewed?limit=1&media_type=article`)
      .expect(200)
    expect(page1.body.results.map((item: { id: string }) => item.id)).toEqual([article2.id])

    const page2 = await request
      .get(
        `/api/v1/users/${owner.id}/rss-feed-items/viewed?limit=1&media_type=article&after=${encodeURIComponent(page1.body.page_info.end_cursor)}`,
      )
      .expect(200)
    expect(page2.body.results.map((item: { id: string }) => item.id)).toEqual([article1.id])
  })

  it('reports a terminal empty page when no viewed items match media_type', async () => {
    const owner = await createTestUser({ username: safeUsername('rss-viewed-no-match') })
    if (!owner) throw new Error('Failed to create owner')
    const topic = await createTestTopic({
      name: `RSS viewed no match ${owner.id}`,
      slug: `rss-viewed-no-match-${owner.id}`,
    })
    const feedId = await createTestRssFeedWithTiming(topic.id)
    const audio = await createTestRssFeedItemWithUrl(feedId)
    await setRssFeedItemMediaType(audio.id, 'audio')
    await insertRecentlyViewedRssFeedItem(owner.id, audio.id)

    const request = createRequest()
    await request.authenticateAs(owner)
    const page = await request
      .get(`/api/v1/users/${owner.id}/rss-feed-items/viewed?media_type=article`)
      .expect(200)

    expect(page.body.results).toEqual([])
    expect(page.body.page_info).toMatchObject({ has_next_page: false, end_cursor: null })
  })

  it('rejects a media_type-filtered viewed cursor replayed against another filter', async () => {
    const owner = await createTestUser({ username: safeUsername('rss-viewed-scope-media') })
    if (!owner) throw new Error('Failed to create owner')
    const topic = await createTestTopic({
      name: `RSS viewed scope media ${owner.id}`,
      slug: `rss-viewed-scope-media-${owner.id}`,
    })
    const feedId = await createTestRssFeedWithTiming(topic.id)
    const articleA = await createTestRssFeedItemWithUrl(feedId)
    const articleB = await createTestRssFeedItemWithUrl(feedId)
    await setRssFeedItemMediaType(articleA.id, 'article')
    await setRssFeedItemMediaType(articleB.id, 'article')
    await insertRecentlyViewedRssFeedItem(owner.id, articleA.id)
    await insertRecentlyViewedRssFeedItem(owner.id, articleB.id)

    const request = createRequest()
    await request.authenticateAs(owner)
    const articlePage = await request
      .get(`/api/v1/users/${owner.id}/rss-feed-items/viewed?limit=1&media_type=article`)
      .expect(200)
    expect(articlePage.body.page_info.end_cursor).not.toBeNull()

    await request
      .get(
        `/api/v1/users/${owner.id}/rss-feed-items/viewed?limit=1&media_type=audio&after=${encodeURIComponent(articlePage.body.page_info.end_cursor)}`,
      )
      .expect(400)
    await request
      .get(
        `/api/v1/users/${owner.id}/rss-feed-items/viewed?limit=1&after=${encodeURIComponent(articlePage.body.page_info.end_cursor)}`,
      )
      .expect(400)
  })
})
