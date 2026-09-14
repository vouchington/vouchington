import { describe, expect, it } from 'vitest'

import { createRequest } from '@voucha/test-helpers/api/server'
import {
  createTestPost,
  createTestUser,
  createUserProfileFixture,
  pollUntilNotNull,
  safeUsername,
} from '@voucha/test-helpers'

import { HTTP_CACHE_LONG_MAX_AGE_SECONDS } from '@voucha/config'

import { caches } from '@services/entity-cache/caches'

import {
  createDataRequest,
  markDataRequestProcessing,
  markDataRequestReady,
} from '@services/account-data-requests'

describe('Users API Routes', () => {
  describe('GET /api/v1/users/:idOrSlug', () => {
    it('should return private data for authenticated self request by ID', async () => {
      const username = safeUsername('users-private')
      const user = await createTestUser({ username })
      const request = createRequest()
      await request.authenticateAs(user!)

      const response = await request.get(`/api/v1/users/${user!.id}`).expect(200)

      expect(response.body.user.id).toBe(user!.id)
      expect(response.body.user.email_address).toBeDefined()
      expect(response.headers['cache-control'] || '').not.toContain('public')
    })

    it('should return private data for authenticated self request by username', async () => {
      const username = safeUsername('users-private-username')
      const user = await createTestUser({ username })
      const request = createRequest()
      await request.authenticateAs(user!)

      const response = await request.get(`/api/v1/users/${username}`).expect(200)

      expect(response.body.user.id).toBe(user!.id)
      expect(response.body.user.email_address).toBeDefined()
      expect(response.headers['cache-control'] || '').not.toContain('public')
    })

    it('should return public data for authenticated non-self request', async () => {
      const requester = await createTestUser({ username: safeUsername('users-requester') })
      const target = await createTestUser({ username: safeUsername('users-target') })
      const request = createRequest()
      await request.authenticateAs(requester!)

      const response = await request.get(`/api/v1/users/${target!.username}`).expect(200)

      expect(response.body.user.id).toBe(target!.id)
      expect(response.body.user.email_address).toBeUndefined()
    })

    it('should include public, viewer, and private metrics for self requests', async () => {
      const fixture = await createUserProfileFixture()
      const request = createRequest()
      await request.authenticateAs(fixture.owner)

      const response = await request.get(`/api/v1/users/${fixture.owner.username}`).expect(200)

      expect(response.body.user_metrics).toMatchObject({
        id: fixture.owner.id,
        count: {
          reviews: 1,
          discussions: 1,
          comments: 1,
          users_following: 1,
          users_followers: 1,
          topics_following: 1,
          rss_feeds_following: 1,
        },
        viewer_count: {
          reviews: 1,
          discussions: 1,
          comments: 1,
        },
        private_count: {
          topics_blocked: 1,
          topics_muted: 1,
          topics_viewed: 1,
          users_blocked: 1,
          users_muted: 1,
          rss_feed_items_saved: 1,
          rss_feed_items_viewed: 1,
        },
      })
    })

    it('should omit private counts for non-owner requests', async () => {
      const fixture = await createUserProfileFixture()
      const requester = await createTestUser({ username: safeUsername('users-requester') })
      const request = createRequest()
      await request.authenticateAs(requester!)

      const response = await request.get(`/api/v1/users/${fixture.owner.username}`).expect(200)

      expect(response.body.user_metrics.count.users_followers).toBe(1)
      expect(response.body.user_metrics.private_count).toBeUndefined()
    })

    it('should include private counts for administrators viewing another user', async () => {
      const fixture = await createUserProfileFixture()
      const request = createRequest()
      await request.authenticateAs(fixture.admin)

      const response = await request.get(`/api/v1/users/${fixture.owner.username}`).expect(200)

      expect(response.body.user_metrics.private_count).toMatchObject({
        topics_blocked: 1,
        users_blocked: 1,
        rss_feed_items_saved: 1,
      })
    })

    it('should populate the public user metrics cache for anonymous requests', async () => {
      const user = await createTestUser({ username: safeUsername('users-cache') })
      const request = createRequest()

      const response = await request.get(`/api/v1/users/${user!.username!}`).expect(200)

      const byId = (await pollUntilNotNull(() => caches.user_metrics.get(user!.id))) as Record<
        string,
        unknown
      >

      expect(byId.id).toBe(user!.id)
      expect(byId.viewer_count).toBeUndefined()
      expect(byId.private_count).toBeUndefined()
      expect(response.headers['cache-control']).toContain('public')
      expect(response.headers['cache-control']).toContain(
        `max-age=${HTTP_CACHE_LONG_MAX_AGE_SECONDS}`,
      )
      expect(response.headers['vary']).toContain('Cookie')
      expect(response.headers['vary']).toContain('Authorization')
    })

    it('should include profile_links array in the response', async () => {
      const user = await createTestUser({ username: safeUsername('users-profile-links') })
      const request = createRequest()

      const response = await request.get(`/api/v1/users/${user!.username!}`).expect(200)

      expect(Array.isArray(response.body.profile_links)).toBe(true)
    })

    it('should include the user_vouch_election sidecar for admin viewers', async () => {
      const fixture = await createUserProfileFixture()
      const request = createRequest()
      await request.authenticateAs(fixture.admin)

      const response = await request.get(`/api/v1/users/${fixture.owner.username}`).expect(200)

      expect(response.body).toHaveProperty('user_vouch_election')
    })

    it('should omit the user_vouch_election sidecar for non-admin viewers', async () => {
      const fixture = await createUserProfileFixture()
      const requester = await createTestUser({
        username: safeUsername('users-non-admin'),
      })
      const request = createRequest()
      await request.authenticateAs(requester!)

      const response = await request.get(`/api/v1/users/${fixture.owner.username}`).expect(200)

      expect(response.body.user_vouch_election).toBeUndefined()
    })
  })
  // keep generated shard bindings live for typecheck
  void (0 as unknown as typeof createTestPost)
  void (0 as unknown as typeof HTTP_CACHE_LONG_MAX_AGE_SECONDS)
  // keep generated shard import bindings live for typecheck
  void (0 as unknown as typeof createDataRequest)
  void (0 as unknown as typeof markDataRequestProcessing)
  void (0 as unknown as typeof markDataRequestReady)
})
