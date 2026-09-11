import { describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/api/test-helpers/server'
import {
  createTestRssFeedItemWithUrl,
  createTestRssFeedWithTiming,
  createTestTopic,
  createTestUser,
  insertRecentlyViewedRssFeedItem,
  insertUserSavedRssFeedItem,
  safeUsername,
  updateTestEntityRelationCreatedAt,
} from '@voucha/test-helpers'

async function saveTestRssFeedItem(feedId: string, userId: string): Promise<string> {
  const item = await createTestRssFeedItemWithUrl(feedId)
  await insertUserSavedRssFeedItem(userId, item.id)
  return item.id
}

describe('GET /api/v1/users/:idOrSlug/rss-feed-items/:listType pagination', () => {
  it('returns an empty page when the user has no saved rss feed items', async () => {
    const owner = await createTestUser({ username: safeUsername('rss-page-empty') })
    if (!owner) throw new Error('Failed to create owner')

    const request = createRequest()
    await request.authenticateAs(owner)
    const response = await request.get(`/api/v1/users/${owner.id}/rss-feed-items/saved`).expect(200)
    expect(response.body).toMatchObject({
      results: [],
      page_info: { has_next_page: false, end_cursor: null },
    })
  })

  it('paginates saved rss feed items at the exact limit across pages without duplicates', async () => {
    const owner = await createTestUser({ username: safeUsername('rss-page-exact') })
    if (!owner) throw new Error('Failed to create owner')
    const topic = await createTestTopic({
      name: `RSS page exact ${owner.id}`,
      slug: `rss-page-exact-${owner.id}`,
    })
    const feedId = await createTestRssFeedWithTiming(topic.id)

    const itemIds: string[] = []
    for (let index = 0; index < 3; index++) {
      const itemId = await saveTestRssFeedItem(feedId, owner.id)
      itemIds.push(itemId)
      await updateTestEntityRelationCreatedAt(
        'relation__user__save__rss_feed_item',
        owner.id,
        itemId,
        new Date(Date.now() - index * 10_000),
      )
    }

    const request = createRequest()
    await request.authenticateAs(owner)
    const page1 = await request
      .get(`/api/v1/users/${owner.id}/rss-feed-items/saved?limit=2`)
      .expect(200)
    const page2 = await request
      .get(
        `/api/v1/users/${owner.id}/rss-feed-items/saved?limit=2&after=${encodeURIComponent(page1.body.page_info.end_cursor)}`,
      )
      .expect(200)

    expect(page1.body.results).toHaveLength(2)
    expect(page1.body.page_info.has_next_page).toBe(true)
    expect(page2.body.results).toHaveLength(1)
    expect(page2.body.page_info).toMatchObject({ has_next_page: false, end_cursor: null })
    const resultIds = [...page1.body.results, ...page2.body.results].map(
      (item: { id: string }) => item.id,
    )
    expect(resultIds).toEqual(itemIds)
    expect(new Set(resultIds).size).toBe(3)
  })

  it('breaks ties deterministically when two saved rss feed items share a created_at timestamp', async () => {
    const owner = await createTestUser({ username: safeUsername('rss-page-tie') })
    if (!owner) throw new Error('Failed to create owner')
    const topic = await createTestTopic({
      name: `RSS page tie ${owner.id}`,
      slug: `rss-page-tie-${owner.id}`,
    })
    const feedId = await createTestRssFeedWithTiming(topic.id)

    const tieDate = new Date(Date.now() - 60_000)
    const itemA = await saveTestRssFeedItem(feedId, owner.id)
    const itemB = await saveTestRssFeedItem(feedId, owner.id)
    await updateTestEntityRelationCreatedAt(
      'relation__user__save__rss_feed_item',
      owner.id,
      itemA,
      tieDate,
    )
    await updateTestEntityRelationCreatedAt(
      'relation__user__save__rss_feed_item',
      owner.id,
      itemB,
      tieDate,
    )
    const expectedOrder = [itemA, itemB].sort().reverse()

    const request = createRequest()
    await request.authenticateAs(owner)
    const page1 = await request
      .get(`/api/v1/users/${owner.id}/rss-feed-items/saved?limit=1`)
      .expect(200)
    const page2 = await request
      .get(
        `/api/v1/users/${owner.id}/rss-feed-items/saved?limit=1&after=${encodeURIComponent(page1.body.page_info.end_cursor)}`,
      )
      .expect(200)

    expect(page1.body.results).toHaveLength(1)
    expect(page2.body.results).toHaveLength(1)
    expect([page1.body.results[0].id, page2.body.results[0].id]).toEqual(expectedOrder)
  })

  it('rejects a malformed cursor', async () => {
    const owner = await createTestUser({ username: safeUsername('rss-page-bad-cursor') })
    if (!owner) throw new Error('Failed to create owner')

    const request = createRequest()
    await request.authenticateAs(owner)
    await request.get(`/api/v1/users/${owner.id}/rss-feed-items/saved?after=invalid`).expect(400)
  })

  it('rejects a cursor scoped to another user', async () => {
    const owner = await createTestUser({ username: safeUsername('rss-page-scope-a') })
    const other = await createTestUser({ username: safeUsername('rss-page-scope-b') })
    if (!owner || !other) throw new Error('Failed to create users')
    const topic = await createTestTopic({
      name: `RSS page scope ${owner.id}`,
      slug: `rss-page-scope-${owner.id}`,
    })
    const feedId = await createTestRssFeedWithTiming(topic.id)

    await saveTestRssFeedItem(feedId, other.id)
    await saveTestRssFeedItem(feedId, other.id)

    const otherRequest = createRequest()
    await otherRequest.authenticateAs(other)
    const otherPage = await otherRequest
      .get(`/api/v1/users/${other.id}/rss-feed-items/saved?limit=1`)
      .expect(200)
    expect(otherPage.body.page_info.end_cursor).not.toBeNull()

    const ownerRequest = createRequest()
    await ownerRequest.authenticateAs(owner)
    await ownerRequest
      .get(
        `/api/v1/users/${owner.id}/rss-feed-items/saved?limit=1&after=${encodeURIComponent(otherPage.body.page_info.end_cursor)}`,
      )
      .expect(400)
  })

  it('rejects a saved-list cursor replayed against the hidden list', async () => {
    const owner = await createTestUser({ username: safeUsername('rss-page-scope-list-type') })
    if (!owner) throw new Error('Failed to create owner')
    const topic = await createTestTopic({
      name: `RSS page scope list type ${owner.id}`,
      slug: `rss-page-scope-list-type-${owner.id}`,
    })
    const feedId = await createTestRssFeedWithTiming(topic.id)

    await saveTestRssFeedItem(feedId, owner.id)
    await saveTestRssFeedItem(feedId, owner.id)

    const request = createRequest()
    await request.authenticateAs(owner)
    const savedPage = await request
      .get(`/api/v1/users/${owner.id}/rss-feed-items/saved?limit=1`)
      .expect(200)
    expect(savedPage.body.page_info.end_cursor).not.toBeNull()

    await request
      .get(
        `/api/v1/users/${owner.id}/rss-feed-items/hidden?limit=1&after=${encodeURIComponent(savedPage.body.page_info.end_cursor)}`,
      )
      .expect(400)
  })

  it('rejects a saved-list (uuid) cursor replayed against the viewed (score) list', async () => {
    const owner = await createTestUser({ username: safeUsername('rss-page-scope-viewed') })
    if (!owner) throw new Error('Failed to create owner')
    const topic = await createTestTopic({
      name: `RSS page scope viewed ${owner.id}`,
      slug: `rss-page-scope-viewed-${owner.id}`,
    })
    const feedId = await createTestRssFeedWithTiming(topic.id)
    await saveTestRssFeedItem(feedId, owner.id)
    await saveTestRssFeedItem(feedId, owner.id)

    const request = createRequest()
    await request.authenticateAs(owner)
    const savedPage = await request
      .get(`/api/v1/users/${owner.id}/rss-feed-items/saved?limit=1`)
      .expect(200)
    expect(savedPage.body.page_info.end_cursor).not.toBeNull()

    await request
      .get(
        `/api/v1/users/${owner.id}/rss-feed-items/viewed?limit=1&after=${encodeURIComponent(savedPage.body.page_info.end_cursor)}`,
      )
      .expect(400)
  })

  it('paginates recently viewed rss feed items with score cursors', async () => {
    const owner = await createTestUser({ username: safeUsername('rss-viewed-page') })
    if (!owner) throw new Error('Failed to create owner')
    const topic = await createTestTopic({
      name: `RSS viewed page ${owner.id}`,
      slug: `rss-viewed-page-${owner.id}`,
    })
    const feedId = await createTestRssFeedWithTiming(topic.id)
    const items = await Promise.all([
      createTestRssFeedItemWithUrl(feedId),
      createTestRssFeedItemWithUrl(feedId),
      createTestRssFeedItemWithUrl(feedId),
    ])
    await Promise.all(items.map(item => insertRecentlyViewedRssFeedItem(owner.id, item.id)))

    const request = createRequest()
    await request.authenticateAs(owner)
    const page1 = await request
      .get(`/api/v1/users/${owner.id}/rss-feed-items/viewed?limit=2`)
      .expect(200)
    const page2 = await request
      .get(
        `/api/v1/users/${owner.id}/rss-feed-items/viewed?limit=2&after=${encodeURIComponent(page1.body.page_info.end_cursor)}`,
      )
      .expect(200)

    expect(page1.body.results).toHaveLength(2)
    expect(page2.body.results).toHaveLength(1)
    expect(
      new Set(
        [...page1.body.results, ...page2.body.results].map((item: { id: string }) => item.id),
      ),
    ).toEqual(new Set(items.map(item => item.id)))
  })
})
