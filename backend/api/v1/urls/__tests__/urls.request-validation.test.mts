import { randomUUID } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUser } from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'

const malformedId = 'not-a-uuid'

describe('URL routes - request contract validation', () => {
  let admin: PrivateUser
  let freeUser: PrivateUser

  beforeAll(async () => {
    admin = await createTestUser({ administrator: true })
    freeUser = await createTestUser()
  }, 60_000)

  it('returns 422 for a malformed hostname UUID before URL search', async () => {
    const request = createRequest()
    await request.authenticateAs(admin)
    const response = await request.get('/api/v1/urls?hostnameId=not-a-uuid').expect(422)
    expect(response.body).toHaveProperty('message')
  })

  describe('anonymous callers', () => {
    it.each([
      `/api/v1/urls/${randomUUID()}`,
      `/api/v1/urls/${randomUUID()}/crawls?limit=abc&extra=1`,
      `/api/v1/urls/${randomUUID()}/crawls/${malformedId}`,
    ])('GET %s returns 401 without a validation diagnostic', async path => {
      const response = await createRequest().get(path).expect(401)
      expect(response.body.message).toBe('Unauthorized')
    })
  })

  describe('callers without crawl history access', () => {
    it.each([
      `/api/v1/urls/${randomUUID()}/crawls?limit=abc`,
      `/api/v1/urls/${randomUUID()}/crawls/${malformedId}`,
    ])('GET %s returns 403 before any input diagnostic', async path => {
      const request = createRequest()
      await request.authenticateAs(freeUser)
      const response = await request.get(path).expect(403)
      expect(response.body.message).toBe('Premium membership required')
    })
  })

  describe('crawl history', () => {
    it('keeps the parser 400 for a malformed limit before looking up the URL', async () => {
      const request = createRequest()
      await request.authenticateAs(admin)
      await request.get(`/api/v1/urls/${randomUUID()}/crawls?limit=abc`).expect(400)
    })

    it('returns 422 for a malformed crawl id before looking up the URL', async () => {
      const request = createRequest()
      await request.authenticateAs(admin)
      await request.get(`/api/v1/urls/${randomUUID()}/crawls/${malformedId}`).expect(422)
    })

    it('still answers 404 for an unknown URL with valid input', async () => {
      const request = createRequest()
      await request.authenticateAs(admin)
      await request.get(`/api/v1/urls/${randomUUID()}/crawls?limit=5`).expect(404)
      await request.get(`/api/v1/urls/${randomUUID()}/crawls/${randomUUID()}`).expect(404)
    })
  })
})
