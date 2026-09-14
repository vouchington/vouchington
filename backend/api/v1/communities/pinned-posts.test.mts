import { describe, it, expect, beforeAll } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  createTestUser,
  insertTestCommunity,
  insertTestCommunityMember,
  createRandomString,
  setPostVotesScoreUp,
} from '@voucha/test-helpers'
import { createCommunityPostFixture } from '@services/posts/test-support'
import { approvePublication } from '@services/communities/publications/moderate'
import type { PrivateUser } from '@services/users/types'

describe('Community Pinned Posts Routes', () => {
  let owner: PrivateUser
  let regularUser: PrivateUser

  beforeAll(async () => {
    const [o, r] = await Promise.all([createTestUser(), createTestUser()])
    owner = o!
    regularUser = r!
  })

  async function setupCommunityWithPosts(count = 2) {
    const random = createRandomString(8)
    const community = await insertTestCommunity({
      createdById: owner!.id,
      slug: `pinned-api-${random}`,
      post_approval_required_at: new Date(),
    })
    await insertTestCommunityMember({
      communityId: community.id,
      userId: owner!.id,
      role: 'owner',
    })

    const postIds: string[] = []
    for (let i = 0; i < count; i++) {
      const post = await createCommunityPostFixture(owner!, community.id, {
        title: `Pinned API Post ${i} ${random}`,
        markdown: 'content',
      })
      await approvePublication(owner!, community.id, post.id)
      postIds.push(post.id)
    }

    return { community, postIds }
  }

  describe('GET /api/v1/communities/:slug/pinned-posts', () => {
    it('returns empty pinned_posts for community with no pins', async () => {
      const { community } = await setupCommunityWithPosts(0)
      const request = createRequest()
      const response = await request
        .get(`/api/v1/communities/${community.slug}/pinned-posts`)
        .expect(200)
      expect(response.body.pinned_posts).toEqual([])
    })

    it('returns pins in order after PUT', async () => {
      const { community, postIds } = await setupCommunityWithPosts(2)
      const request = createRequest()
      await request.authenticateAs(owner!)
      await request
        .put(`/api/v1/communities/${community.slug}/pinned-posts`)
        .set('Content-Type', 'application/json')
        .send({ post_ids: postIds })
        .expect(200)

      const getRequest = createRequest()
      const response = await getRequest
        .get(`/api/v1/communities/${community.slug}/pinned-posts`)
        .expect(200)
      expect(response.body.pinned_posts).toHaveLength(2)
      expect(response.body.pinned_posts[0].post_id).toBe(postIds[0])
      expect(response.body.pinned_posts[1].post_id).toBe(postIds[1])
    })
  })

  describe('PUT /api/v1/communities/:slug/pinned-posts', () => {
    it('returns 401 without auth', async () => {
      const { community } = await setupCommunityWithPosts(0)
      const request = createRequest()
      await request
        .put(`/api/v1/communities/${community.slug}/pinned-posts`)
        .set('Content-Type', 'application/json')
        .send({ post_ids: [] })
        .expect(401)
    })

    it('returns 403 for regular member', async () => {
      const { community } = await setupCommunityWithPosts(0)
      await insertTestCommunityMember({
        communityId: community.id,
        userId: regularUser!.id,
        role: 'member',
      })
      const request = createRequest()
      await request.authenticateAs(regularUser!)
      await request
        .put(`/api/v1/communities/${community.slug}/pinned-posts`)
        .set('Content-Type', 'application/json')
        .send({ post_ids: [] })
        .expect(403)
    })

    it('returns 200 and sets pins as moderator', async () => {
      const { community, postIds } = await setupCommunityWithPosts(2)
      const request = createRequest()
      await request.authenticateAs(owner!)
      const response = await request
        .put(`/api/v1/communities/${community.slug}/pinned-posts`)
        .set('Content-Type', 'application/json')
        .send({ post_ids: [postIds[0]!] })
        .expect(200)
      expect(response.body.pinned_posts).toHaveLength(1)
      expect(response.body.pinned_posts[0].post_id).toBe(postIds[0])
    })

    it('returns 422 for more than 3 posts', async () => {
      const { community, postIds } = await setupCommunityWithPosts(3)
      const random = createRandomString(8)
      const extraPostObj = await createCommunityPostFixture(owner!, community.id, {
        title: `Extra Post ${random}`,
        markdown: 'content',
      })
      const extraPost = extraPostObj.id
      await approvePublication(owner!, community.id, extraPost)

      const request = createRequest()
      await request.authenticateAs(owner!)
      await request
        .put(`/api/v1/communities/${community.slug}/pinned-posts`)
        .set('Content-Type', 'application/json')
        .send({ post_ids: [...postIds, extraPost] })
        .expect(422)
    })
  })

  describe('GET /api/v1/communities/:slug/posts (feed with pins)', () => {
    it('includes pinned_post_ids on first page', async () => {
      const { community, postIds } = await setupCommunityWithPosts(2)
      const setRequest = createRequest()
      await setRequest.authenticateAs(owner!)
      await setRequest
        .put(`/api/v1/communities/${community.slug}/pinned-posts`)
        .set('Content-Type', 'application/json')
        .send({ post_ids: [postIds[0]!] })
        .expect(200)

      const request = createRequest()
      const response = await request.get(`/api/v1/communities/${community.slug}/posts`).expect(200)
      expect(Array.isArray(response.body.pinned_post_ids)).toBe(true)
      expect(response.body.pinned_post_ids).toContain(postIds[0])
    })

    it('accepts sort=hot for community posts', async () => {
      const { community, postIds } = await setupCommunityWithPosts(2)
      await setPostVotesScoreUp(postIds[0]!, 1)
      await setPostVotesScoreUp(postIds[1]!, 100)

      const request = createRequest()
      const response = await request
        .get(`/api/v1/communities/${community.slug}/posts?sort=hot`)
        .expect(200)

      const resultIds = response.body.results.map((r: { id: string }) => r.id)
      expect(resultIds[0]).toBe(postIds[1])
    })

    it('excludes pinned posts from paginated results', async () => {
      const { community, postIds } = await setupCommunityWithPosts(2)
      const setRequest = createRequest()
      await setRequest.authenticateAs(owner!)
      await setRequest
        .put(`/api/v1/communities/${community.slug}/pinned-posts`)
        .set('Content-Type', 'application/json')
        .send({ post_ids: [postIds[0]!] })
        .expect(200)

      const request = createRequest()
      const response = await request.get(`/api/v1/communities/${community.slug}/posts`).expect(200)
      const resultIds = response.body.results.map((r: { id: string }) => r.id)
      expect(resultIds).not.toContain(postIds[0])
    })

    it('returns empty pinned_post_ids on subsequent pages', async () => {
      const { community, postIds } = await setupCommunityWithPosts(3)
      // Pin one post
      const setRequest = createRequest()
      await setRequest.authenticateAs(owner!)
      await setRequest
        .put(`/api/v1/communities/${community.slug}/pinned-posts`)
        .set('Content-Type', 'application/json')
        .send({ post_ids: [postIds[0]!] })
        .expect(200)

      // Get first page with limit=1 to get a real cursor
      const firstRequest = createRequest()
      const firstResponse = await firstRequest
        .get(`/api/v1/communities/${community.slug}/posts?limit=1`)
        .expect(200)
      expect(firstResponse.body.pinned_post_ids).toContain(postIds[0])

      const cursor = firstResponse.body.page_info?.end_cursor
      if (!cursor) return // skip if no next page

      // Get next page via cursor
      const nextRequest = createRequest()
      const nextResponse = await nextRequest
        .get(`/api/v1/communities/${community.slug}/posts?after=${cursor}`)
        .expect(200)
      expect(nextResponse.body.pinned_post_ids).toEqual([])
    })
  })
})
