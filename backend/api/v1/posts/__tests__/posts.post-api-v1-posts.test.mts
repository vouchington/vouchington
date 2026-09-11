import { randomUUID } from 'node:crypto'
import { describe, it, expect, beforeAll } from 'vitest'
import { createRequest } from '@voucha/api/test-helpers/server'
import {
  insertTestPost,
  createTestUser,
  createTestUserWithAge,
  createTestAgent,
  insertTestAgentPrompt,
  insertTestAgentModeration,
  CONTRIBUTING_USER_AGE_MS,
} from '@voucha/test-helpers'

import type { PrivateUser } from '@services/users/types'

describe('posts', () => {
  describe('Posts Collection Routes', () => {
    let user: PrivateUser

    let admin: PrivateUser

    beforeAll(async () => {
      user = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
      admin = await createTestUser({ administrator: true })
    })

    describe('POST /api/v1/posts', () => {
      it('should create a new post when authenticated', async () => {
        const request = createRequest()
        await request.authenticateAs(user!)

        const response = await request
          .post('/api/v1/posts')
          .send({
            post_type: 'discussion',
            title: 'New Post',
            markdown: 'New post content',
          })
          .expect(201)

        expect(response.body.post).toHaveProperty('id')
        expect(response.body.post.title).toBe('New Post')
        expect(response.body.post.clearance_status).toBe('pending')
      })

      it('should return 401 when not authenticated', async () => {
        const request = createRequest()
        await request
          .post('/api/v1/posts')
          .send({
            post_type: 'discussion',
            title: 'New Post',
            markdown: 'New post content',
          })
          .expect(401)
      })

      it('should return 415 for non-JSON content type', async () => {
        const request = createRequest()
        await request.authenticateAs(user!)

        await request.post('/api/v1/posts').send('not json').expect(415)
      })

      it('should reject recommendation workflows in the generic posts API', async () => {
        const request = createRequest()
        await request.authenticateAs(user!)

        await request
          .post('/api/v1/posts')
          .send({
            post_type: 'topic_recommendation',
            title: 'Should Fail',
            markdown: 'Use the dedicated workflow',
          })
          .expect(422)
      })

      it('should return 403 IDENTITY_REQUIRED when user has no username and no OAuth account', async () => {
        const noIdentityUser = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS, {
          noUsername: true,
        })
        const request = createRequest()
        await request.authenticateAs(noIdentityUser)

        const response = await request
          .post('/api/v1/posts')
          .send({
            post_type: 'discussion',
            title: 'Should Fail',
            markdown: 'No identity user content',
          })
          .expect(403)

        expect(response.body.code).toBe('IDENTITY_REQUIRED')
        expect(response.body.message).toBe('An identity is required to create posts')
      })

      it('should return fake 201 when honeypot field is filled', async () => {
        const request = createRequest()
        await request.authenticateAs(user!)

        const response = await request
          .post('/api/v1/posts')
          .send({
            post_type: 'discussion',
            title: 'Spam Post',
            markdown: 'Spam content',
            hp_website: 'http://spam.com',
          })
          .expect(201)

        // Returns a plausible stub but does NOT create a real post
        expect(response.body.post).toHaveProperty('id')
        expect(response.body.post).toHaveProperty('post_type')
        // Verify the returned ID is NOT a real post in the DB by checking it's not in the feed
        const fakeId = response.body.post.id
        const listResponse = await request.get(`/api/v1/posts?creator=${user!.id}`).expect(200)
        const ids = listResponse.body.results.map((r: { id: string }) => r.id)
        expect(ids).not.toContain(fakeId)
      })
    })

    describe('GET /api/v1/posts — admin post_moderations', () => {
      it('should include post_moderations for admin users', async () => {
        const moderatorSlug = `politics-averse-admin-${randomUUID().slice(0, 8)}`
        const agent = await createTestAgent({
          agentType: 'moderator',
          activated: true,
          slug: moderatorSlug,
        })
        const postId = await insertTestPost({
          title: `Admin moderation test ${Date.now()}`,
          slug: `admin-mod-test-${Date.now()}`,
          createdById: admin.id,
          markdown: 'Test post for moderation',
        })
        const promptId = await insertTestAgentPrompt({ agentId: agent.id, activated: true })
        await insertTestAgentModeration({
          postId,
          promptId,
          agentId: agent.id,
          results: { flagged: false, reason: 'Looks clean' },
          flagged: false,
        })

        const request = createRequest()
        await request.authenticateAs(admin)
        const response = await request.get(`/api/v1/posts?creator=${admin.id}`).expect(200)

        expect(response.body).toHaveProperty('post_moderations')
        expect(typeof response.body.post_moderations).toBe('object')
        const moderations = response.body.post_moderations[postId]
        expect(Array.isArray(moderations)).toBe(true)
        expect(moderations.length).toBeGreaterThan(0)
        expect(moderations[0].post_id).toBe(postId)
        expect(typeof moderations[0].id).toBe('string')
        expect(moderations[0].moderator_slug).toBe(moderatorSlug)
        expect(response.body.agent_moderation_elections).toHaveProperty(moderations[0].id)
        expect(response.body.agent_moderation_elections[moderations[0].id]).toMatchObject({
          id: moderations[0].id,
          __entity_type: 'agent_moderation_election',
        })
      })

      it('should not include post_moderations for non-admin users', async () => {
        const request = createRequest()
        await request.authenticateAs(user)
        const response = await request.get('/api/v1/posts').expect(200)

        expect(response.body).not.toHaveProperty('post_moderations')
        expect(response.body).not.toHaveProperty('agent_moderation_elections')
      })

      it('should not include post_moderations for unauthenticated requests', async () => {
        const request = createRequest()
        const response = await request.get('/api/v1/posts').expect(200)

        expect(response.body).not.toHaveProperty('post_moderations')
        expect(response.body).not.toHaveProperty('agent_moderation_elections')
      })
    })

    describe('url filter', () => {
      it('should return empty results for an unknown URL string', async () => {
        const random = Math.random().toString(36).slice(2, 10)
        const unknownUrl = `https://unknown-${random}.example.com/path`
        const request = createRequest()
        const response = await request
          .get(`/api/v1/posts?url=${encodeURIComponent(unknownUrl)}`)
          .expect(200)

        expect(response.body.results).toEqual([])
      })
    })

    describe('anon limit clamping', () => {
      let anonCreator: PrivateUser

      beforeAll(async () => {
        anonCreator = await createTestUser()
        const random = Math.random().toString(36).slice(2, 8)
        for (let i = 0; i < 30; i++) {
          await insertTestPost({
            title: `Anon Limit Post ${random} ${i}`,
            slug: `anon-limit-post-${random}-${i}`,
            createdById: anonCreator.id,
            markdown: `Content ${i}`,
          })
        }
      })

      it('unauthenticated request with limit=100 returns at most 25 results', async () => {
        const request = createRequest()
        const response = await request
          .get(`/api/v1/posts?creator=${anonCreator.id}&limit=100`)
          .expect(200)
        expect(response.body.results.length).toBeLessThanOrEqual(25)
      })

      it('authenticated request with limit=100 can return up to 100 results', async () => {
        const request = createRequest()
        await request.authenticateAs(anonCreator)
        const response = await request
          .get(`/api/v1/posts?creator=${anonCreator.id}&limit=100`)
          .expect(200)
        // All 30 posts returned for authenticated users — not clamped
        expect(response.body.results.length).toBeGreaterThan(25)
        expect(response.body.results.length).toBeLessThanOrEqual(100)
      })
    })

    describe('archived post filtering', () => {
      // Use a dedicated user per test to avoid Valkey search cache collisions from earlier tests
      // that also query ?creator=${user.id} (unauthenticated path uses getPostIdsCached)
      it('excludes archived posts when filtering by creator', async () => {
        const archiveUser = await createTestUser()
        const postId = await insertTestPost({
          title: `Archived Creator Profile ${Date.now()}`,
          slug: `arch-creator-${Date.now()}`,
          createdById: archiveUser.id,
          markdown: 'archived content',
        })

        const request = createRequest()
        const beforeArchive = await request
          .get(`/api/v1/posts?creator=${archiveUser.id}`)
          .expect(200)
        expect(beforeArchive.body.results.map((r: { id: string }) => r.id)).toContain(postId)

        const archiveRequest = createRequest()
        await archiveRequest.authenticateAs(archiveUser)
        await archiveRequest.patch(`/api/v1/posts/${postId}`).send({ archive: true }).expect(200)

        const response = await request.get(`/api/v1/posts?creator=${archiveUser.id}`).expect(200)
        const resultIds = response.body.results.map((r: { id: string }) => r.id)
        expect(resultIds).not.toContain(postId)
        expect(response.body.posts).not.toHaveProperty(postId)
      })

      it('ignores the removed include_archived query parameter', async () => {
        const archiveUser = await createTestUser()
        const postId = await insertTestPost({
          title: `Archived Include Toggle ${Date.now()}`,
          slug: `arch-toggle-${Date.now()}`,
          createdById: archiveUser.id,
          markdown: 'archived content',
        })

        const archiveRequest = createRequest()
        await archiveRequest.authenticateAs(archiveUser)
        await archiveRequest.patch(`/api/v1/posts/${postId}`).send({ archive: true }).expect(200)

        const request = createRequest()
        const response = await request
          .get(`/api/v1/posts?creator=${archiveUser.id}&include_archived=true`)
          .expect(200)
        const resultIds = response.body.results.map((r: { id: string }) => r.id)
        expect(resultIds).not.toContain(postId)
      })
    })
  })
})
