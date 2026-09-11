import { describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/api/test-helpers/server'
import { createTestUser, insertTestRssFeedDirect, safeUsername } from '@voucha/test-helpers'
import { upsertRecentlyViewed } from '@services/recently-viewed'

async function viewFeed(
  userId: string,
  feedType: 'article' | 'podcast' | 'video' | 'mixed' = 'article',
): Promise<string> {
  const feed = await insertTestRssFeedDirect({ feedType })
  await upsertRecentlyViewed('rss_feed', feed.id, null, userId)
  return feed.id
}

describe('GET /api/v1/users/:idOrSlug/rss-feeds/viewed feed_type pagination', () => {
  it('returns the matching viewed feed on page 1 when newer rows have a different feed_type', async () => {
    const owner = await createTestUser({ username: safeUsername('rss-feeds-viewed-filtered') })
    if (!owner) throw new Error('Failed to create owner')
    const articleId = await viewFeed(owner.id, 'article')
    await viewFeed(owner.id, 'podcast')

    const request = createRequest()
    await request.authenticateAs(owner)
    const page = await request
      .get(`/api/v1/users/${owner.id}/rss-feeds/viewed?limit=1&feed_type=article`)
      .expect(200)

    expect(page.body.results.map((feed: { id: string }) => feed.id)).toEqual([articleId])
    expect(page.body.page_info).toMatchObject({ has_next_page: false, end_cursor: null })
  })

  it('returns the matching viewed article feed on page 1 at the production default limit', async () => {
    const owner = await createTestUser({ username: safeUsername('rss-feeds-viewed-sparse-25') })
    if (!owner) throw new Error('Failed to create owner')
    const articleId = await viewFeed(owner.id, 'article')
    for (let index = 0; index < 25; index++) {
      await viewFeed(owner.id, 'podcast')
    }

    const request = createRequest()
    await request.authenticateAs(owner)
    const page = await request
      .get(`/api/v1/users/${owner.id}/rss-feeds/viewed?limit=25&feed_type=article`)
      .expect(200)

    expect(page.body.results.map((feed: { id: string }) => feed.id)).toEqual([articleId])
    expect(page.body.page_info).toMatchObject({ has_next_page: false, end_cursor: null })
  })

  it('paginates leftover feed_type matches past the default limit', async () => {
    const owner = await createTestUser({ username: safeUsername('rss-feeds-viewed-leftover') })
    if (!owner) throw new Error('Failed to create owner')
    const articleIds: string[] = []
    for (let index = 0; index < 26; index++) {
      articleIds.push(await viewFeed(owner.id, 'article'))
    }

    const request = createRequest()
    await request.authenticateAs(owner)
    const page1 = await request
      .get(`/api/v1/users/${owner.id}/rss-feeds/viewed?limit=25&feed_type=article`)
      .expect(200)
    expect(page1.body.results).toHaveLength(25)
    expect(page1.body.page_info.has_next_page).toBe(true)
    expect(page1.body.page_info.end_cursor).not.toBeNull()
    expect(page1.body.results.map((feed: { id: string }) => feed.id)).toEqual(
      articleIds.slice(1).toReversed(),
    )

    const page2 = await request
      .get(
        `/api/v1/users/${owner.id}/rss-feeds/viewed?limit=25&feed_type=article&after=${encodeURIComponent(page1.body.page_info.end_cursor)}`,
      )
      .expect(200)
    expect(page2.body.results.map((feed: { id: string }) => feed.id)).toEqual([articleIds[0]])
    expect(page2.body.page_info).toMatchObject({ has_next_page: false, end_cursor: null })
  })

  it('paginates feed_type-filtered viewed feeds without duplicates or skipped matches', async () => {
    const owner = await createTestUser({ username: safeUsername('rss-feeds-viewed-dense') })
    if (!owner) throw new Error('Failed to create owner')
    const article1 = await viewFeed(owner.id, 'article')
    await viewFeed(owner.id, 'podcast')
    const article2 = await viewFeed(owner.id, 'article')
    const article3 = await viewFeed(owner.id, 'article')

    const request = createRequest()
    await request.authenticateAs(owner)
    const page1 = await request
      .get(`/api/v1/users/${owner.id}/rss-feeds/viewed?limit=1&feed_type=article`)
      .expect(200)
    expect(page1.body.results.map((feed: { id: string }) => feed.id)).toEqual([article3])
    expect(page1.body.page_info.has_next_page).toBe(true)
    expect(page1.body.page_info.end_cursor).not.toBeNull()

    const page2 = await request
      .get(
        `/api/v1/users/${owner.id}/rss-feeds/viewed?limit=1&feed_type=article&after=${encodeURIComponent(page1.body.page_info.end_cursor)}`,
      )
      .expect(200)
    expect(page2.body.results.map((feed: { id: string }) => feed.id)).toEqual([article2])
    expect(page2.body.page_info.has_next_page).toBe(true)

    const page3 = await request
      .get(
        `/api/v1/users/${owner.id}/rss-feeds/viewed?limit=1&feed_type=article&after=${encodeURIComponent(page2.body.page_info.end_cursor)}`,
      )
      .expect(200)
    expect(page3.body.results.map((feed: { id: string }) => feed.id)).toEqual([article1])
    expect(page3.body.page_info).toMatchObject({ has_next_page: false, end_cursor: null })
  })

  it('derives the filtered viewed cursor from the last match, not a skipped non-match', async () => {
    const owner = await createTestUser({ username: safeUsername('rss-feeds-viewed-cursor') })
    if (!owner) throw new Error('Failed to create owner')
    const article1 = await viewFeed(owner.id, 'article')
    await viewFeed(owner.id, 'podcast')
    const article2 = await viewFeed(owner.id, 'article')

    const request = createRequest()
    await request.authenticateAs(owner)
    const page1 = await request
      .get(`/api/v1/users/${owner.id}/rss-feeds/viewed?limit=1&feed_type=article`)
      .expect(200)
    expect(page1.body.results.map((feed: { id: string }) => feed.id)).toEqual([article2])

    const page2 = await request
      .get(
        `/api/v1/users/${owner.id}/rss-feeds/viewed?limit=1&feed_type=article&after=${encodeURIComponent(page1.body.page_info.end_cursor)}`,
      )
      .expect(200)
    expect(page2.body.results.map((feed: { id: string }) => feed.id)).toEqual([article1])
  })

  it('reports a terminal empty page when no viewed feeds match feed_type', async () => {
    const owner = await createTestUser({ username: safeUsername('rss-feeds-viewed-no-match') })
    if (!owner) throw new Error('Failed to create owner')
    await viewFeed(owner.id, 'podcast')

    const request = createRequest()
    await request.authenticateAs(owner)
    const page = await request
      .get(`/api/v1/users/${owner.id}/rss-feeds/viewed?feed_type=article`)
      .expect(200)

    expect(page.body.results).toEqual([])
    expect(page.body.page_info).toMatchObject({ has_next_page: false, end_cursor: null })
  })

  it('rejects a feed_type-filtered viewed cursor replayed against another filter', async () => {
    const owner = await createTestUser({ username: safeUsername('rss-feeds-viewed-scope') })
    if (!owner) throw new Error('Failed to create owner')
    await viewFeed(owner.id, 'article')
    await viewFeed(owner.id, 'article')

    const request = createRequest()
    await request.authenticateAs(owner)
    const articlePage = await request
      .get(`/api/v1/users/${owner.id}/rss-feeds/viewed?limit=1&feed_type=article`)
      .expect(200)
    expect(articlePage.body.page_info.end_cursor).not.toBeNull()

    await request
      .get(
        `/api/v1/users/${owner.id}/rss-feeds/viewed?limit=1&feed_type=podcast&after=${encodeURIComponent(articlePage.body.page_info.end_cursor)}`,
      )
      .expect(400)
  })
})
