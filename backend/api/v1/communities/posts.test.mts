import { describe, it, expect } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  createTestUser,
  insertTestCommunity,
  insertTestCommunityMember,
  insertTestPost,
  createRandomString,
  createTestMembership,
} from '@voucha/test-helpers'
import { isUUIDv7 } from '@ts-shared/session-jwt'
import { bookmarkEntity } from '@services/bookmarks/upsert'
import { createCommunityPostFixture } from '@services/posts/test-support'

describe('Community Posts Routes', () => {
  describe('POST /api/v1/communities/:slug/posts', () => {
    it('returns a complete fake post when honeypot field is filled', async () => {
      const user = await createTestUser()
      const random = createRandomString(8)
      const community = await insertTestCommunity({
        createdById: user.id,
        slug: `posts-honeypot-${random}`,
        visibility: 'public',
      })
      await insertTestCommunityMember({ communityId: community.id, userId: user.id })
      await createTestMembership({ user_id: user.id, plan: 'plus' })

      const request = createRequest()
      await request.authenticateAs(user)

      const response = await request
        .post(`/api/v1/communities/${community.slug}/posts`)
        .send({
          post_type: 'discussion',
          title: 'Spam community post',
          markdown: 'Spam content',
          hp_website: 'http://spam.example',
        })
        .expect(201)

      expect(response.body.post).toMatchObject({
        post_type: 'discussion',
        title: 'Spam community post',
        markdown: 'Spam content',
        community_id: community.id,
        clearance_status: 'pending',
        archived_at: null,
        archived_by_id: null,
      })
      expect(isUUIDv7(response.body.post.id)).toBe(true)
    })
  })

  describe('GET /api/v1/communities/:slug/posts', () => {
    it('returns results and page_info', async () => {
      const user = await createTestUser()
      const random = createRandomString(8)
      const community = await insertTestCommunity({
        createdById: user.id,
        slug: `posts-get-${random}`,
        visibility: 'public',
      })

      const request = createRequest()
      const response = await request.get(`/api/v1/communities/${community.slug}/posts`).expect(200)

      expect(Array.isArray(response.body.results)).toBe(true)
      expect(response.body).toHaveProperty('page_info')
    })

    it('includes post bookmarks for authenticated users', async () => {
      const user = await createTestUser()
      const random = createRandomString(8)
      const community = await insertTestCommunity({
        createdById: user.id,
        slug: `posts-bookmarks-${random}`,
        visibility: 'public',
      })
      await insertTestCommunityMember({ communityId: community.id, userId: user.id })
      const { id: postId } = await createCommunityPostFixture(user, community.id, {
        title: `Bookmarked Community Post ${random}`,
        markdown: 'bookmarked content',
      })
      await bookmarkEntity(user, 'post', { id: postId }, 'save')

      const request = createRequest()
      await request.authenticateAs(user)
      const response = await request.get(`/api/v1/communities/${community.slug}/posts`).expect(200)

      expect(response.body.bookmarks?.[postId]?.save).toBe(true)
    })
  })

  describe('GET /api/v1/communities/:slug/posts/pending', () => {
    it('returns 401 without auth', async () => {
      const user = await createTestUser()
      const random = createRandomString(8)
      const community = await insertTestCommunity({
        createdById: user.id,
        slug: `posts-pending-401-${random}`,
      })

      const request = createRequest()
      await request.get(`/api/v1/communities/${community.slug}/posts/pending`).expect(401)
    })

    it('returns 403 as non-mod', async () => {
      const [owner, regular] = await Promise.all([createTestUser(), createTestUser()])
      const random = createRandomString(8)
      const community = await insertTestCommunity({
        createdById: owner!.id,
        slug: `posts-pending-403-${random}`,
      })
      await insertTestCommunityMember({
        communityId: community.id,
        userId: regular!.id,
        role: 'member',
      })

      const request = createRequest()
      await request.authenticateAs(regular!)

      await request.get(`/api/v1/communities/${community.slug}/posts/pending`).expect(403)
    })

    it('returns 200 with results as mod', async () => {
      const user = await createTestUser()
      const random = createRandomString(8)
      const community = await insertTestCommunity({
        createdById: user.id,
        slug: `posts-pending-ok-${random}`,
        post_approval_required_at: new Date(),
      })
      await insertTestCommunityMember({
        communityId: community.id,
        userId: user.id,
        role: 'owner',
      })

      await createCommunityPostFixture(user, community.id, {
        title: `Pending Post ${random}`,
        markdown: 'pending content',
      })

      const request = createRequest()
      await request.authenticateAs(user)

      const response = await request
        .get(`/api/v1/communities/${community.slug}/posts/pending`)
        .expect(200)

      expect(Array.isArray(response.body.results)).toBe(true)
      expect(response.body).toHaveProperty('page_info')
    })

    it('allows a site moderator without community membership', async () => {
      const [owner, siteModerator] = await Promise.all([
        createTestUser(),
        createTestUser({ extraRoles: ['moderator'] }),
      ])
      const random = createRandomString(8)
      const community = await insertTestCommunity({
        createdById: owner.id,
        slug: `posts-pending-staff-${random}`,
      })

      const request = createRequest()
      await request.authenticateAs(siteModerator)

      await request.get(`/api/v1/communities/${community.slug}/posts/pending`).expect(200)
    })
  })

  describe('PATCH /api/v1/communities/:slug/posts/:postId', () => {
    it('returns 401 without auth', async () => {
      const user = await createTestUser()
      const random = createRandomString(8)
      const community = await insertTestCommunity({
        createdById: user.id,
        slug: `posts-patch-401-${random}`,
      })
      const postId = await insertTestPost({
        title: `Test Post ${random}`,
        slug: `test-post-patch-401-${random}`,
        createdById: user.id,
        markdown: 'content',
      })

      const request = createRequest()
      await request
        .patch(`/api/v1/communities/${community.slug}/posts/${postId}`)
        .set('Content-Type', 'application/json')
        .send({ status: 'approved' })
        .expect(401)
    })

    it('approves post and returns 204 as mod', async () => {
      const user = await createTestUser()
      const random = createRandomString(8)
      const community = await insertTestCommunity({
        createdById: user.id,
        slug: `posts-patch-ok-${random}`,
        post_approval_required_at: new Date(),
      })
      await insertTestCommunityMember({
        communityId: community.id,
        userId: user.id,
        role: 'owner',
      })

      const { id: postId } = await createCommunityPostFixture(user, community.id, {
        title: `Post To Approve ${random}`,
        markdown: 'some content',
      })

      const request = createRequest()
      await request.authenticateAs(user)

      await request
        .patch(`/api/v1/communities/${community.slug}/posts/${postId}`)
        .set('Content-Type', 'application/json')
        .send({ status: 'approved' })
        .expect(204)
    })

    it('records a site-moderator override with its required public reason code', async () => {
      const [owner, siteModerator] = await Promise.all([
        createTestUser(),
        createTestUser({ extraRoles: ['moderator'] }),
      ])
      const random = createRandomString(8)
      const community = await insertTestCommunity({
        createdById: owner.id,
        slug: `posts-patch-staff-${random}`,
        post_approval_required_at: new Date(),
      })
      await insertTestCommunityMember({
        communityId: community.id,
        userId: owner.id,
        role: 'owner',
      })
      const { id: postId } = await createCommunityPostFixture(owner, community.id, {
        title: `Post Staff Override ${random}`,
        markdown: 'some content',
      })

      const request = createRequest()
      await request.authenticateAs(siteModerator)

      await request
        .patch(`/api/v1/communities/${community.slug}/posts/${postId}`)
        .set('Content-Type', 'application/json')
        .send({
          status: 'approved',
          reason_code: 'staff_reviewed',
          private_note: 'Platform policy review complete',
        })
        .expect(204)
    })
  })
})
