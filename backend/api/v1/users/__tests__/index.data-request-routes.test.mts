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
  describe('Data Request Routes', () => {
    it('POST /api/v1/users/:idOrSlug/data-request returns 401 when not authenticated', async () => {
      const user = await createTestUser({ username: safeUsername('users-data-request-auth') })
      const request = createRequest()
      await request.post(`/api/v1/users/${user!.id}/data-request`).expect(401)
    })

    it('POST /api/v1/users/:idOrSlug/data-request returns 403 for non-owner', async () => {
      const owner = await createTestUser({ username: safeUsername('users-data-request-owner') })
      const otherUser = await createTestUser({
        username: safeUsername('users-data-request-other'),
      })
      const request = createRequest()
      await request.authenticateAs(otherUser!)
      await request.post(`/api/v1/users/${owner!.id}/data-request`).expect(403)
    })

    it('POST /api/v1/users/:idOrSlug/data-request returns 409 for pending request', async () => {
      const user = await createTestUser({
        username: safeUsername('users-data-request-pending'),
      })
      const pending = await createDataRequest(user!.id)

      const request = createRequest()
      await request.authenticateAs(user!)
      const response = await request.post(`/api/v1/users/${user!.id}/data-request`).expect(409)

      expect(response.body.error).toBe('A data export is already in progress')
      expect(response.body.id).toBe(pending.id)
      expect(response.body.status).toBe('pending')
    })

    it('POST /api/v1/users/:idOrSlug/data-request returns 201 for owner with request payload', async () => {
      const user = await createTestUser({
        username: safeUsername('users-data-request-create'),
      })
      await createTestPost({ user: user! })

      const request = createRequest()
      await request.authenticateAs(user!)
      const response = await request.post(`/api/v1/users/${user!.id}/data-request`).expect(201)

      expect(typeof response.body.id).toBe('string')
      expect(response.body.status).toBe('pending')
      expect(typeof response.body.created_at).toBe('string')
      expect(response.body.expires_at).toBeNull()
    })

    it('GET /api/v1/users/:idOrSlug/data-request returns 401 when not authenticated', async () => {
      const user = await createTestUser({
        username: safeUsername('users-data-request-auth-get'),
      })
      const request = createRequest()
      await request.get(`/api/v1/users/${user!.id}/data-request`).expect(401)
    })

    it('GET /api/v1/users/:idOrSlug/data-request returns 404 when no data request exists', async () => {
      const user = await createTestUser({
        username: safeUsername('users-data-request-none'),
      })
      const request = createRequest()
      await request.authenticateAs(user!)
      await request.get(`/api/v1/users/${user!.id}/data-request`).expect(404)
    })

    it('GET /api/v1/users/:idOrSlug/data-request returns 403 for non-owner', async () => {
      const owner = await createTestUser({
        username: safeUsername('users-data-request-owner-get'),
      })
      const otherUser = await createTestUser({
        username: safeUsername('users-data-request-other-get'),
      })
      await createDataRequest(owner!.id)

      const request = createRequest()
      await request.authenticateAs(otherUser!)
      await request.get(`/api/v1/users/${owner!.id}/data-request`).expect(403)
    })

    it('GET /api/v1/users/:idOrSlug/data-request returns latest request for owner', async () => {
      const user = await createTestUser({
        username: safeUsername('users-data-request-get'),
      })
      const dataRequest = await createDataRequest(user!.id)

      const request = createRequest()
      await request.authenticateAs(user!)
      const response = await request.get(`/api/v1/users/${user!.id}/data-request`).expect(200)

      expect(response.body.id).toBe(dataRequest.id)
      expect(response.body.status).toBe('pending')
      expect(typeof response.body.created_at).toBe('string')
      expect(response.body.expires_at).toBeNull()
      expect(response.body.download_url).toBeNull()
    })

    it('GET /api/v1/users/:idOrSlug/data-request returns download_url when ready', async () => {
      const user = await createTestUser({
        username: safeUsername('users-data-request-ready-url'),
      })
      const dataRequest = await createDataRequest(user!.id)
      const started = await markDataRequestProcessing(dataRequest.id)
      expect(started).toBe(true)

      const fakeS3Key = `${dataRequest.id}.zip`
      const saved = await markDataRequestReady(
        dataRequest.id,
        fakeS3Key,
        new Date(Date.now() + 60_000),
      )
      expect(saved).toBe(true)

      const request = createRequest()
      await request.authenticateAs(user!)
      const response = await request.get(`/api/v1/users/${user!.id}/data-request`).expect(200)

      expect(response.body.status).toBe('ready')
      expect(typeof response.body.download_url).toBe('string')
      expect(response.body.download_url).toContain('X-Amz-Signature')
    })
  })

  describe('GET /api/v1/users', () => {
    it('should return 422 when username query is missing', async () => {
      const request = createRequest()
      await request.get('/api/v1/users').expect(422)
    })

    it('should return public user data and cache headers for logged-out requests', async () => {
      const username = safeUsername('users-public')
      const user = await createTestUser({ username })
      const request = createRequest()
      const response = await request.get(`/api/v1/users?username=${username}`).expect(200)

      expect(response.body.user).toBeDefined()
      expect(response.body.user.id).toBe(user!.id)
      expect(response.body.user.email_address).toBeUndefined()
      expect(response.headers['cache-control']).toContain('public')
      expect(response.headers['cache-control']).toContain(
        `max-age=${HTTP_CACHE_LONG_MAX_AGE_SECONDS}`,
      )
    })

    it('should return private data for authenticated self requests', async () => {
      const username = safeUsername('users-self')
      const user = await createTestUser({ username })
      const request = createRequest()
      await request.authenticateAs(user!)

      const response = await request.get(`/api/v1/users?username=${username}`).expect(200)

      expect(response.body.user.id).toBe(user!.id)
      expect(response.body.user.email_address).toBeDefined()
    })

    it('should return public data for authenticated non-self requests', async () => {
      const requester = await createTestUser({ username: safeUsername('users-requester') })
      const target = await createTestUser({ username: safeUsername('users-target') })
      const request = createRequest()
      await request.authenticateAs(requester!)

      const response = await request.get(`/api/v1/users?username=${target!.username}`).expect(200)

      expect(response.body.user.id).toBe(target!.id)
      expect(response.body.user.email_address).toBeUndefined()
    })
  })
  // keep generated shard bindings live for typecheck
  void (0 as unknown as typeof createUserProfileFixture)
  void (0 as unknown as typeof pollUntilNotNull)
  void (0 as unknown as typeof caches)
})
