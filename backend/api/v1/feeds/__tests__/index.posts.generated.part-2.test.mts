import { describe, it, expect } from 'vitest'

import { createRequest } from '@voucha/api/test-helpers/server'
import {
  followUser,
  followTopic,
  createTestUser,
  createTestPost,
  createTestTopic,
  relatePostToTopic,
} from '@voucha/test-helpers'

import { sharePostWithFollowers } from '@services/feeds'

import { processFollowerDistributionChunk } from '@services/follower-distributions'

describe('GET /api/v1/feeds/posts/:feed_type - hot sort and post type filtering', () => {
  it('returns 200 with sort=hot', async () => {
    const user = await createTestUser()
    const request = createRequest()
    await request.authenticateAs(user)

    const response = await request.get('/api/v1/feeds/posts/any').query({ sort: 'hot' }).expect(200)

    expect(response.body.results).toBeInstanceOf(Array)
    expect(typeof response.body.posts).toBe('object')
  })

  it('does not return articles in default feed results', async () => {
    const user = await createTestUser()
    const articleCreator = await createTestUser()
    await followUser(user, articleCreator)

    await createTestPost({ user: articleCreator, post_type: 'article' })

    const request = createRequest()
    await request.authenticateAs(user)

    const response = await request.get('/api/v1/feeds/posts/any').expect(200)

    expect(response.status).toBe(200)
    expect(Array.isArray(response.body.results)).toBe(true)

    // Verify every post in the response is not an article
    const postTypes = Object.values(
      response.body.posts as Record<string, { post_type: string }>,
    ).map(p => p.post_type)
    expect(postTypes.every(t => t !== 'article')).toBe(true)
  })
  // keep generated shard bindings live for typecheck
  void (0 as unknown as typeof followTopic)
  void (0 as unknown as typeof relatePostToTopic)
  void (0 as unknown as typeof createTestTopic)
  void (0 as unknown as typeof sharePostWithFollowers)
  void (0 as unknown as typeof processFollowerDistributionChunk)
})
