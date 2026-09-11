import { describe, it, expect } from 'vitest'
import { createRequest } from '@voucha/api/test-helpers/server'
import {
  followUser,
  followRssFeed,
  createTestUser,
  createTestTopic,
  createTestRssFeedWithTiming,
  createTestRssFeedItemWithUrl,
  setRssFeedItemMediaType,
  insertTestStory,
  setTestItemStoryId,
} from '@voucha/test-helpers'
import { shareRssFeedItemWithFollowers } from '@services/feeds'
import { processFollowerDistributionChunk } from '@services/follower-distributions'
describe('GET /api/v1/feeds/rss_feed_items/:feed_type', () => {
  it('should return 401 for unauthenticated users', async () => {
    const request = createRequest()
    await request.get('/api/v1/feeds/rss_feed_items/any').expect(401)
  })

  it('should return 404 for invalid feed_type', async () => {
    const user = await createTestUser()
    const request = createRequest()
    await request.authenticateAs(user)

    await request.get('/api/v1/feeds/rss_feed_items/invalid_type').expect(404)
  })

  it('should return empty results when user has no follows', async () => {
    const user = await createTestUser()
    const request = createRequest()
    await request.authenticateAs(user)

    const response = await request.get('/api/v1/feeds/rss_feed_items/any').expect(200)

    expect(response.body.rss_feed_items).toEqual({})
    expect(response.body.results).toEqual([])
    expect(response.body.page_info.has_next_page).toBe(false)
  })

  it('should return items from followed RSS feeds', async () => {
    const user = await createTestUser()
    const topic = await createTestTopic()
    const feedId = await createTestRssFeedWithTiming(topic.id)
    await followRssFeed(user, feedId)

    const rssFeedItem = await createTestRssFeedItemWithUrl(feedId)

    const request = createRequest()
    await request.authenticateAs(user)

    const response = await request.get('/api/v1/feeds/rss_feed_items/follow_rss_feeds').expect(200)

    expect(response.body.rss_feed_items).toBeDefined()
    expect(response.body.results).toBeDefined()

    const foundItem = response.body.results.find((r: { id: string }) => r.id === rssFeedItem.id)
    expect(foundItem).toBeDefined()
    expect(response.body.rss_feed_items[rssFeedItem.id]).toBeDefined()
  })

  it('ignores stale community query for followed RSS feeds', async () => {
    const user = await createTestUser()
    const topic = await createTestTopic()
    const feedId = await createTestRssFeedWithTiming(topic.id)
    await followRssFeed(user, feedId)

    const rssFeedItem = await createTestRssFeedItemWithUrl(feedId)

    const request = createRequest()
    await request.authenticateAs(user)

    const response = await request
      .get('/api/v1/feeds/rss_feed_items/follow_rss_feeds?community=missing-community')
      .expect(200)

    expect(
      response.body.results.map((result: { entity_id: string }) => result.entity_id),
    ).toContain(rssFeedItem.id)
  })

  it('ignores community query for followed-user RSS items', async () => {
    const recipient = await createTestUser()
    const sharer = await createTestUser()
    await followUser(recipient, sharer)

    const topic = await createTestTopic()
    const feedId = await createTestRssFeedWithTiming(topic.id)
    const rssFeedItem = await createTestRssFeedItemWithUrl(feedId)
    await processFollowerDistributionChunk(
      (await shareRssFeedItemWithFollowers(sharer, rssFeedItem.id)).distribution_id,
    )

    const request = createRequest()
    await request.authenticateAs(recipient)

    const response = await request
      .get('/api/v1/feeds/rss_feed_items/follow_users?community=missing-community')
      .expect(200)

    expect(
      response.body.results.map((result: { entity_id: string }) => result.entity_id),
    ).toContain(rssFeedItem.id)
  })

  it('should accept query parameters', async () => {
    const user = await createTestUser()
    const topic = await createTestTopic()
    const feedId = await createTestRssFeedWithTiming(topic.id)
    await followRssFeed(user, feedId)

    const request = createRequest()
    await request.authenticateAs(user)

    const response = await request
      .get('/api/v1/feeds/rss_feed_items/follow_rss_feeds')
      .query({ limit: '5' })
      .expect(200)

    // Streaming pattern: rss_feed_items should be an object
    expect(typeof response.body.rss_feed_items).toBe('object')
    expect(Array.isArray(response.body.rss_feed_items)).toBe(false)
  })

  it('should use streaming pattern for rss feed items', async () => {
    const user = await createTestUser()
    const topic = await createTestTopic()
    const feedId = await createTestRssFeedWithTiming(topic.id)
    await followRssFeed(user, feedId)

    // Create multiple items
    for (let i = 0; i < 3; i++) {
      await createTestRssFeedItemWithUrl(feedId)
    }

    const request = createRequest()
    await request.authenticateAs(user)

    const response = await request.get('/api/v1/feeds/rss_feed_items/follow_rss_feeds').expect(200)

    // Verify streaming pattern structure
    expect(typeof response.body.rss_feed_items).toBe('object')
    expect(Array.isArray(response.body.rss_feed_items)).toBe(false)
    expect(Array.isArray(response.body.results)).toBe(true)

    // Verify each result has corresponding item
    expect(response.body.results.length).toBeGreaterThan(0)
    response.body.results.forEach((result: { id: string }) => {
      expect(response.body.rss_feed_items[result.id]).toBeDefined()
    })
  })

  it('should return rss_feed_item_elections as an object in rss feed items feed', async () => {
    const user = await createTestUser()
    const topic = await createTestTopic()
    const feedId = await createTestRssFeedWithTiming(topic.id)
    await followRssFeed(user, feedId)

    const rssFeedItem = await createTestRssFeedItemWithUrl(feedId)

    const request = createRequest()
    await request.authenticateAs(user)

    const response = await request.get('/api/v1/feeds/rss_feed_items/follow_rss_feeds').expect(200)

    expect(typeof response.body.rss_feed_item_elections).toBe('object')
    expect(Array.isArray(response.body.rss_feed_item_elections)).toBe(false)

    // If our item appears in the results, verify its election entry has vote fields
    const foundResult = response.body.results.find((r: { id: string }) => r.id === rssFeedItem.id)
    expect(foundResult).toBeDefined()
    expect(response.body.rss_feed_item_elections[rssFeedItem.id]).toHaveProperty('votes_score_net')
  })

  it('should include non-primary story members in rss_feed_items and story_member_ids sidecars', async () => {
    const user = await createTestUser()
    const topic = await createTestTopic()
    const feedId = await createTestRssFeedWithTiming(topic.id)
    await followRssFeed(user, feedId)

    // The route's story-member expansion adds items sharing a story that were NOT independently
    // delivered by the feed query. Put the second item on a feed the user never follows, so it
    // cannot appear in `results` on its own — only via `story_member_ids`/`rss_feed_items`. There
    // is no `similar_rss_feed_item_ids` field on results; asserting through it (the prior version
    // of this test) always passed trivially, since every primary result ID satisfies the check
    // regardless of whether story-member expansion ran at all.
    const { id: primaryItemId } = await createTestRssFeedItemWithUrl(feedId)
    const unfollowedTopic = await createTestTopic()
    const unfollowedFeedId = await createTestRssFeedWithTiming(unfollowedTopic.id)
    const { id: memberItemId } = await createTestRssFeedItemWithUrl(unfollowedFeedId)
    const story = await insertTestStory()
    await setTestItemStoryId(primaryItemId, story.id)
    await setTestItemStoryId(memberItemId, story.id)

    const request = createRequest()
    await request.authenticateAs(user)

    const response = await request.get('/api/v1/feeds/rss_feed_items/follow_rss_feeds').expect(200)

    const resultIds = response.body.results.map((result: { id: string }) => result.id)
    expect(resultIds).toContain(primaryItemId)
    expect(resultIds).not.toContain(memberItemId)

    expect(response.body.story_member_ids[story.id]).toEqual(
      expect.arrayContaining([primaryItemId, memberItemId]),
    )
    expect(response.body.rss_feed_items[memberItemId]).toBeDefined()
  })

  it('filters by media_type', async () => {
    const user = await createTestUser()
    const topic = await createTestTopic()
    const feedId = await createTestRssFeedWithTiming(topic.id)
    await followRssFeed(user, feedId)

    const audioItem = await createTestRssFeedItemWithUrl(feedId)
    await setRssFeedItemMediaType(audioItem.id, 'audio')
    const videoItem = await createTestRssFeedItemWithUrl(feedId)
    await setRssFeedItemMediaType(videoItem.id, 'video')
    const articleItem = await createTestRssFeedItemWithUrl(feedId)
    await setRssFeedItemMediaType(articleItem.id, 'article')

    const request = createRequest()
    await request.authenticateAs(user)

    // audio filter returns only audio items
    const audioResponse = await request
      .get('/api/v1/feeds/rss_feed_items/follow_rss_feeds?media_type=audio')
      .expect(200)
    const audioIds = audioResponse.body.results.map((r: { entity_id: string }) => r.entity_id)
    expect(audioIds).toContain(audioItem.id)
    expect(audioIds).not.toContain(videoItem.id)
    expect(audioIds).not.toContain(articleItem.id)

    // video filter returns only video items
    const videoResponse = await request
      .get('/api/v1/feeds/rss_feed_items/follow_rss_feeds?media_type=video')
      .expect(200)
    const videoIds = videoResponse.body.results.map((r: { entity_id: string }) => r.entity_id)
    expect(videoIds).toContain(videoItem.id)
    expect(videoIds).not.toContain(audioItem.id)
    expect(videoIds).not.toContain(articleItem.id)
  })

  it('includes rss_feed_item_thumbnail_url sidecar in response', async () => {
    const user = await createTestUser()
    const topic = await createTestTopic()
    const feedId = await createTestRssFeedWithTiming(topic.id)
    await followRssFeed(user, feedId)
    await createTestRssFeedItemWithUrl(feedId)

    const request = createRequest()
    await request.authenticateAs(user)

    const response = await request.get('/api/v1/feeds/rss_feed_items/follow_rss_feeds').expect(200)
    expect(response.body.rss_feed_item_thumbnail_url).toBeDefined()
    expect(response.body.rss_feed_item_embeds).toBeDefined()
  })
})
