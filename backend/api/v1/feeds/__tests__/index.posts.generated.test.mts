import { describe, it, expect } from 'vitest'

import { createRequest } from '@voucha/api/test-helpers/server'
import {
  followUser,
  followTopic,
  createTestUser,
  createTestPost,
  createTestTopic,
  relatePostToTopic,
  waitForFollowTopicsFeedPost,
} from '@voucha/test-helpers'

import { sharePostWithFollowers } from '@services/feeds'
import { getPostFeedIds } from '@services/feeds/posts/get-ids'

import { processFollowerDistributionChunk } from '@services/follower-distributions'

import { insertTestLinkPostWithCrawl } from '@voucha/test-helpers/entities/link-posts'

describe('GET /api/v1/feeds/posts/:feed_type', () => {
  it('should return 401 for unauthenticated users', async () => {
    const request = createRequest()
    await request.get('/api/v1/feeds/posts/any').expect(401)
  })

  it('should return 404 for invalid feed_type', async () => {
    const user = await createTestUser()
    const request = createRequest()
    await request.authenticateAs(user)

    await request.get('/api/v1/feeds/posts/invalid_type').expect(404)
  })

  it('should return empty results when user has no follows', async () => {
    const user = await createTestUser()
    const request = createRequest()
    await request.authenticateAs(user)

    const response = await request.get('/api/v1/feeds/posts/any').expect(200)

    // Streaming pattern: posts, posts_metrics are objects, not arrays
    expect(response.body.posts).toEqual({})
    expect(response.body.posts_metrics).toEqual({})
    expect(response.body.results).toEqual([])
    expect(response.body.page_info.has_next_page).toBe(false)
  })

  it('should return posts from followed users', async () => {
    const user = await createTestUser()
    const followedUser = await createTestUser()
    await followUser(user, followedUser)

    const post = await createTestPost({ user: followedUser })

    const request = createRequest()
    await request.authenticateAs(user)

    const response = await request.get('/api/v1/feeds/posts/follow_users').expect(200)

    // Streaming pattern: posts, posts_metrics are objects
    expect(typeof response.body.posts).toBe('object')
    expect(typeof response.body.posts_metrics).toBe('object')
    expect(Array.isArray(response.body.results)).toBe(true)

    // Find post in the results array, then check the posts object
    const foundResult = response.body.results.find((r: { id: string }) => r.id === post.id)
    expect(foundResult).toBeDefined()
    expect(response.body.posts[post.id]).toBeDefined()
    expect(response.body.posts_metrics[post.id]).toBeDefined()
  })

  it('ignores community query for followed-user posts', async () => {
    const user = await createTestUser()
    const followedUser = await createTestUser()
    await followUser(user, followedUser)

    const post = await createTestPost({ user: followedUser })

    const request = createRequest()
    await request.authenticateAs(user)

    const response = await request
      .get('/api/v1/feeds/posts/follow_users?community=missing-community')
      .expect(200)

    expect(
      response.body.results.map((result: { entity_id: string }) => result.entity_id),
    ).toContain(post.id)
  })

  it('should include sharer attribution and entity ids for shared posts', async () => {
    const recipient = await createTestUser()
    const sharer = await createTestUser()
    const creator = await createTestUser()
    await followUser(recipient, sharer)

    const post = await createTestPost({ user: creator, privacy: 'public' })
    await processFollowerDistributionChunk(
      (await sharePostWithFollowers(sharer, post.id)).distribution_id,
    )

    const request = createRequest()
    await request.authenticateAs(recipient)

    const response = await request.get('/api/v1/feeds/posts/follow_users').expect(200)
    const sharedResult = response.body.results.find(
      (result: { entity_id?: string; delivery_type?: string }) =>
        result.entity_id === post.id && result.delivery_type === 'share',
    )

    expect(sharedResult).toBeDefined()
    expect(response.body.posts[post.id]).toBeDefined()
    expect(response.body.users[sharer.id]?.id).toBe(sharer.id)
  })

  it('should return posts with followed topics', async () => {
    const user = await createTestUser()
    const postCreator = await createTestUser()
    const topic = await createTestTopic({ user: postCreator })
    await followTopic(user, topic)

    const post = await createTestPost({ user: postCreator })

    // Relate post to topic
    await relatePostToTopic(postCreator, post, topic)
    await waitForFollowTopicsFeedPost(user, post.id, getPostFeedIds)

    const request = createRequest()
    await request.authenticateAs(user)

    const response = await request.get('/api/v1/feeds/posts/follow_topics').expect(200)

    const foundResult = response.body.results.find(
      (r: { entity_id: string }) => r.entity_id === post.id,
    )
    expect(foundResult).toBeDefined()
    expect(response.body.posts[post.id]).toBeDefined()
  })

  it('ignores stale community query for followed-topic posts', async () => {
    const user = await createTestUser()
    const postCreator = await createTestUser()
    const topic = await createTestTopic({ user: postCreator })
    await followTopic(user, topic)

    const post = await createTestPost({ user: postCreator })
    await relatePostToTopic(postCreator, post, topic)
    await waitForFollowTopicsFeedPost(user, post.id, getPostFeedIds)

    const request = createRequest()
    await request.authenticateAs(user)

    const response = await request
      .get('/api/v1/feeds/posts/follow_topics?community=missing-community')
      .expect(200)

    expect(
      response.body.results.map((result: { entity_id: string }) => result.entity_id),
    ).toContain(post.id)
  })

  it('should accept query parameters', async () => {
    const user = await createTestUser()
    const followedUser = await createTestUser()
    await followUser(user, followedUser)
    await createTestPost({ user: followedUser })

    const request = createRequest()
    await request.authenticateAs(user)

    const response = await request
      .get('/api/v1/feeds/posts/follow_users')
      .query({ limit: '5', post_types: 'discussion' })
      .expect(200)

    // Streaming pattern: posts should be an object
    expect(typeof response.body.posts).toBe('object')
    expect(Array.isArray(response.body.posts)).toBe(false)
  })

  it('should use streaming pattern for posts feed', async () => {
    const user = await createTestUser()
    const followedUser = await createTestUser()
    await followUser(user, followedUser)

    // Create multiple posts
    const posts = []
    for (let i = 0; i < 3; i++) {
      const post = await createTestPost({ user: followedUser })
      posts.push(post)
    }

    const request = createRequest()
    await request.authenticateAs(user)

    const response = await request.get('/api/v1/feeds/posts/follow_users').expect(200)

    // Verify streaming pattern structure
    expect(typeof response.body.posts).toBe('object')
    expect(typeof response.body.posts_metrics).toBe('object')
    expect(Array.isArray(response.body.posts)).toBe(false)
    expect(Array.isArray(response.body.posts_metrics)).toBe(false)
    expect(Array.isArray(response.body.results)).toBe(true)

    // Verify each result has corresponding entities
    expect(response.body.results.length).toBeGreaterThan(0)
    response.body.results.forEach((result: { id: string }) => {
      expect(response.body.posts[result.id]).toBeDefined()
      expect(response.body.posts_metrics[result.id]).toBeDefined()
    })
  })

  it('should mask anonymous post author in feed response', async () => {
    const user = await createTestUser()
    const followedUser = await createTestUser()
    await followUser(user, followedUser)

    const post = await createTestPost({ user: followedUser, is_anonymous: true })

    const request = createRequest()
    await request.authenticateAs(user)

    const response = await request.get('/api/v1/feeds/posts/follow_users').expect(200)

    const foundResult = response.body.results.find(
      (r: { entity_id: string }) => r.entity_id === post.id,
    )
    expect(foundResult).toBeDefined()

    const feedPost = response.body.posts[post.id]
    expect(feedPost).toBeDefined()
    expect(feedPost.is_anonymous).toBe(true)
    expect(feedPost.created_by_id).toBeNull()
    expect(feedPost.created_by).toBeNull()
  })

  it('should include bookmarks and election_votes in posts feed', async () => {
    const user = await createTestUser()
    const followedUser = await createTestUser()
    await followUser(user, followedUser)
    await createTestPost({ user: followedUser })

    const request = createRequest()
    await request.authenticateAs(user)

    const response = await request.get('/api/v1/feeds/posts/follow_users').expect(200)

    // bookmarks and election_votes are optional but should be objects if present
    expect(
      response.body.bookmarks === undefined || typeof response.body.bookmarks === 'object',
    ).toBe(true)
    expect(
      response.body.election_votes === undefined ||
        typeof response.body.election_votes === 'object',
    ).toBe(true)
  })

  it('should return post_elections as an object in posts feed', async () => {
    const user = await createTestUser()
    const followedUser = await createTestUser()
    await followUser(user, followedUser)
    const post = await createTestPost({ user: followedUser })

    const request = createRequest()
    await request.authenticateAs(user)

    const response = await request.get('/api/v1/feeds/posts/follow_users').expect(200)

    expect(typeof response.body.post_elections).toBe('object')
    expect(Array.isArray(response.body.post_elections)).toBe(false)

    // If our post appears in the results, verify its election entry has vote fields
    const foundResult = response.body.results.find((r: { id: string }) => r.id === post.id)
    expect(foundResult).toBeDefined()
    expect(response.body.post_elections[post.id]).toHaveProperty('votes_score_net')
  })

  it('includes post_link_embeds keyed by post id for link posts in feed', async () => {
    const user = await createTestUser()
    const postCreator = await createTestUser()
    await followUser(user, postCreator)
    const { postId } = await insertTestLinkPostWithCrawl({
      createdById: postCreator.id,
      crawlTitle: 'Feed Link Post Embed Test',
    })
    const request = createRequest()
    await request.authenticateAs(user)
    const response = await request.get('/api/v1/feeds/posts/follow_users').expect(200)
    expect(response.body.post_link_embeds).toBeDefined()
    expect(response.body.post_link_embeds[postId]).toBeDefined()
  })
})
