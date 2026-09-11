import { describe, expect, it } from 'vitest'
import { encodeCursor } from '@modules/pagination'
import { createRequest } from '@voucha/api/test-helpers/server'
import {
  createTestUser,
  createUserProfileFixture,
  insertEntityRelation,
  insertTestRssFeed,
  insertTestTopic,
  safeUsername,
  updateRssFeedFollowCreatedAt,
} from '@voucha/test-helpers'

describe('GET /api/v1/users/:idOrSlug/rss-feeds — pagination and feed_type filter', () => {
  it('returns page_info with cursor pagination fields on rss-feeds/following', async () => {
    const fixture = await createUserProfileFixture()
    const ownerRequest = createRequest()
    await ownerRequest.authenticateAs(fixture.owner)
    const response = await ownerRequest
      .get(`/api/v1/users/${fixture.owner.username}/rss-feeds/following`)
      .expect(200)
    expect(response.body.page_info).toBeDefined()
    expect(typeof response.body.page_info.has_next_page).toBe('boolean')
    expect('end_cursor' in response.body.page_info).toBe(true)
    expect('start_cursor' in response.body.page_info).toBe(true)
  })

  it('filters rss-feeds/following by feed_type', async () => {
    const suffix = safeUsername('ft-filter')
    const owner = await createTestUser({ username: suffix })
    if (!owner) throw new Error('Failed to create owner')
    const ownerRequest = createRequest()
    await ownerRequest.authenticateAs(owner)

    const topic1 = await insertTestTopic({
      name: `FT Article Topic ${suffix}`,
      slug: `ft-article-topic-${suffix}`,
      createdById: owner.id,
    })
    const topic2 = await insertTestTopic({
      name: `FT Podcast Topic ${suffix}`,
      slug: `ft-podcast-topic-${suffix}`,
      createdById: owner.id,
    })
    const articleFeedId = await insertTestRssFeed({
      topicId: topic1,
      title: `Article Feed ${suffix}`,
      feedType: 'article',
    })
    const podcastFeedId = await insertTestRssFeed({
      topicId: topic2,
      title: `Podcast Feed ${suffix}`,
      feedType: 'podcast',
    })
    await insertEntityRelation('relation__user__follow__rss_feed', owner.id, articleFeedId)
    await insertEntityRelation('relation__user__follow__rss_feed', owner.id, podcastFeedId)

    const articleResponse = await ownerRequest
      .get(`/api/v1/users/${owner.username}/rss-feeds/following?feed_type=article`)
      .expect(200)
    const articleIds = articleResponse.body.results.map((f: { id: string }) => f.id)
    expect(articleIds).toContain(articleFeedId)
    expect(articleIds).not.toContain(podcastFeedId)

    const podcastResponse = await ownerRequest
      .get(`/api/v1/users/${owner.username}/rss-feeds/following?feed_type=podcast`)
      .expect(200)
    const podcastIds = podcastResponse.body.results.map((f: { id: string }) => f.id)
    expect(podcastIds).toContain(podcastFeedId)
    expect(podcastIds).not.toContain(articleFeedId)
  })

  it('paginates rss-feeds/following with after cursor across two pages', async () => {
    const suffix = safeUsername('ft-pages')
    const owner = await createTestUser({ username: suffix })
    if (!owner) throw new Error('Failed to create owner')
    const ownerRequest = createRequest()
    await ownerRequest.authenticateAs(owner)

    // Create 3 feeds; stagger follow created_at so ordering is deterministic
    const feedIds = await Promise.all(
      [1, 2, 3].map(async n => {
        const topic = await insertTestTopic({
          name: `Page Feed Topic ${n} ${suffix}`,
          slug: `page-feed-topic-${n}-${suffix}`,
          createdById: owner.id,
        })
        const feedId = await insertTestRssFeed({
          topicId: topic,
          title: `Page Feed ${n} ${suffix}`,
        })
        await insertEntityRelation('relation__user__follow__rss_feed', owner.id, feedId)
        // Stagger follow created_at so ORDER BY (created_at DESC, object_id DESC) is deterministic
        await updateRssFeedFollowCreatedAt(owner.id, feedId, new Date(Date.now() - n * 10_000))
        return feedId
      }),
    )

    const page1 = await ownerRequest
      .get(`/api/v1/users/${owner.username}/rss-feeds/following?limit=2`)
      .expect(200)
    expect(page1.body.results).toHaveLength(2)
    expect(page1.body.page_info.has_next_page).toBe(true)
    expect(typeof page1.body.page_info.end_cursor).toBe('string')

    const page2 = await ownerRequest
      .get(
        `/api/v1/users/${owner.username}/rss-feeds/following?limit=2&after=${page1.body.page_info.end_cursor}`,
      )
      .expect(200)
    expect(page2.body.results).toHaveLength(1)
    expect(page2.body.page_info.has_next_page).toBe(false)
    expect(page2.body.page_info.end_cursor).toBeNull()

    // Both pages together cover all three feeds with no duplicates or gaps
    const allIds = [
      ...page1.body.results.map((f: { id: string }) => f.id),
      ...page2.body.results.map((f: { id: string }) => f.id),
    ]
    expect(allIds.sort()).toEqual(feedIds.sort())
  })

  it('returns 400 for invalid after cursor on rss-feeds/following', async () => {
    const owner = await createTestUser({ username: safeUsername('rss-bad-cursor') })
    if (!owner) throw new Error('Failed to create owner')
    const ownerRequest = createRequest()
    await ownerRequest.authenticateAs(owner)
    await ownerRequest
      .get(`/api/v1/users/${owner.username}/rss-feeds/following?after=!!!invalid!!!`)
      .expect(400)
  })

  it('returns 400 for a timestamp after cursor with a non-UUID id on rss-feeds/following', async () => {
    const owner = await createTestUser({ username: safeUsername('rss-non-uuid-cursor') })
    if (!owner) throw new Error('Failed to create owner')
    const ownerRequest = createRequest()
    await ownerRequest.authenticateAs(owner)
    const cursor = encodeCursor({ timestamp: Date.now() * 1000, id: 'not-a-uuid' })

    await ownerRequest
      .get(
        `/api/v1/users/${owner.username}/rss-feeds/following?after=${encodeURIComponent(cursor)}`,
      )
      .expect(400)
  })

  it('returns 400 for invalid feed_type on rss-feeds/following', async () => {
    const owner = await createTestUser({ username: safeUsername('rss-bad-ft') })
    if (!owner) throw new Error('Failed to create owner')
    const ownerRequest = createRequest()
    await ownerRequest.authenticateAs(owner)
    await ownerRequest
      .get(`/api/v1/users/${owner.username}/rss-feeds/following?feed_type=invalid`)
      .expect(400)
  })
})
