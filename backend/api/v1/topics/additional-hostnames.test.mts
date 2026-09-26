import { describe, it, expect, beforeAll } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUser, createTestTopic } from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'

describe('additional-hostnames', () => {
  let adminUser: PrivateUser

  beforeAll(async () => {
    adminUser = await createTestUser({ administrator: true })
  })

  describe('GET /api/v1/topics/:id/additional-hostnames', () => {
    it('returns 401 for unauthenticated requests', async () => {
      const random = Math.random().toString(36).slice(2, 15)
      const topic = await createTestTopic({ hostname: `ah-auth-${random}.example.com` })
      const request = createRequest()
      await request.get(`/api/v1/topics/${topic.id}/additional-hostnames`).expect(401)
    })

    it('returns empty list when no additional hostnames', async () => {
      const random = Math.random().toString(36).slice(2, 15)
      const topic = await createTestTopic({ hostname: `ah-empty-${random}.example.com` })
      const request = createRequest()
      await request.authenticateAs(adminUser)
      const response = await request
        .get(`/api/v1/topics/${topic.id}/additional-hostnames`)
        .expect(200)
      expect(response.body.results).toEqual([])
    })
  })

  describe('POST /api/v1/topics/:id/additional-hostnames', () => {
    it('returns 401 for unauthenticated requests', async () => {
      const random = Math.random().toString(36).slice(2, 15)
      const topic = await createTestTopic({ hostname: `ah-post-auth-${random}.example.com` })
      const request = createRequest()
      await request
        .post(`/api/v1/topics/${topic.id}/additional-hostnames`)
        .send({ hostname: `extra-${random}.example.com` })
        .expect(401)
    })

    it('adds an additional hostname and returns 201', async () => {
      const random = Math.random().toString(36).slice(2, 15)
      const topic = await createTestTopic({ hostname: `ah-add-${random}.example.com` })
      const extraHostname = `ah-extra-${random}.example.com`
      const request = createRequest()
      await request.authenticateAs(adminUser)
      const response = await request
        .post(`/api/v1/topics/${topic.id}/additional-hostnames`)
        .send({ hostname: extraHostname })
        .expect(201)

      expect(response.body.additional_hostname.hostname).toBe(extraHostname)
      expect(response.body.additional_hostname.topic_id).toBe(topic.id)
    })

    it('returns 422 when hostname is missing', async () => {
      const random = Math.random().toString(36).slice(2, 15)
      const topic = await createTestTopic({ hostname: `ah-missing-${random}.example.com` })
      const request = createRequest()
      await request.authenticateAs(adminUser)
      await request.post(`/api/v1/topics/${topic.id}/additional-hostnames`).send({}).expect(422)
    })

    it('rejects malformed hostnames only after authorization', async () => {
      const random = Math.random().toString(36).slice(2, 15)
      const topic = await createTestTopic({ hostname: `ah-contract-${random}.example.com` })
      const anonymousRequest = createRequest()
      await anonymousRequest
        .post(`/api/v1/topics/${topic.id}/additional-hostnames`)
        .send({ hostname: 42 })
        .expect(401)

      const administratorRequest = createRequest()
      await administratorRequest.authenticateAs(adminUser)
      await administratorRequest
        .post(`/api/v1/topics/${topic.id}/additional-hostnames`)
        .send({ hostname: 42 })
        .expect(422)
    })

    it('normalizes a protocol-prefixed hostname to a bare hostname', async () => {
      const random = Math.random().toString(36).slice(2, 15)
      const topic = await createTestTopic({ hostname: `ah-norm-${random}.example.com` })
      const bareHostname = `ah-norm-extra-${random}.example.com`
      const request = createRequest()
      await request.authenticateAs(adminUser)
      const response = await request
        .post(`/api/v1/topics/${topic.id}/additional-hostnames`)
        .send({ hostname: `https://${bareHostname}/some/path?q=1` })
        .expect(201)
      expect(response.body.additional_hostname.hostname).toBe(bareHostname)
    })
  })

  describe('DELETE /api/v1/topics/:id/additional-hostnames/:hostnameId', () => {
    it('returns 401 for unauthenticated requests', async () => {
      const random = Math.random().toString(36).slice(2, 15)
      const topic = await createTestTopic({ hostname: `ah-del-auth-${random}.example.com` })
      const request = createRequest()
      await request
        .delete(
          `/api/v1/topics/${topic.id}/additional-hostnames/00000000-0000-0000-0000-000000000001`,
        )
        .expect(401)
    })

    it('removes an additional hostname and returns 204', async () => {
      const random = Math.random().toString(36).slice(2, 15)
      const topic = await createTestTopic({ hostname: `ah-del-${random}.example.com` })
      const extraHostname = `ah-del-extra-${random}.example.com`
      const request = createRequest()
      await request.authenticateAs(adminUser)

      const postResponse = await request
        .post(`/api/v1/topics/${topic.id}/additional-hostnames`)
        .send({ hostname: extraHostname })
        .expect(201)

      const hostnameId = postResponse.body.additional_hostname.hostname_id
      await request
        .delete(`/api/v1/topics/${topic.id}/additional-hostnames/${hostnameId}`)
        .expect(204)

      // Verify it's gone
      const listResponse = await request
        .get(`/api/v1/topics/${topic.id}/additional-hostnames`)
        .expect(200)
      expect(
        listResponse.body.results.find(
          (h: { hostname_id: string }) => h.hostname_id === hostnameId,
        ),
      ).toBeUndefined()
    })

    it('returns 404 when hostname not linked to topic', async () => {
      const random = Math.random().toString(36).slice(2, 15)
      const topic = await createTestTopic({ hostname: `ah-del-404-${random}.example.com` })
      const request = createRequest()
      await request.authenticateAs(adminUser)
      await request
        .delete(
          `/api/v1/topics/${topic.id}/additional-hostnames/00000000-0000-0000-0000-000000000002`,
        )
        .expect(404)
    })
  })
})
