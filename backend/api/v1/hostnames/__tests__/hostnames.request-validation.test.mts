import { beforeAll, describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUser, insertTestUrlHostname } from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'

function randomHostname(prefix: string): string {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}.example.com`
}

describe('hostname routes - request contract validation', () => {
  let admin: PrivateUser
  let user: PrivateUser

  beforeAll(async () => {
    admin = await createTestUser({ administrator: true })
    user = await createTestUser()
  }, 60_000)

  describe('POST /api/v1/hostnames', () => {
    it('returns 401 without a diagnostic for an anonymous malformed body', async () => {
      const response = await createRequest().post('/api/v1/hostnames').send({ hostname: 5 })
      expect(response.status).toBe(401)
      expect(response.body.message).toBe('Unauthorized')
    })

    it('returns 403 without a diagnostic for a non-admin malformed body', async () => {
      const request = createRequest()
      await request.authenticateAs(user)
      const response = await request.post('/api/v1/hostnames').send({ hostname: 5 })
      expect(response.status).toBe(403)
      expect(response.body.message).toBe('Forbidden')
    })

    it.each([
      ['a non-string hostname', { hostname: 5 }],
      ['a non-boolean blocked flag', { hostname: 'ok.example.com', is_blocked: 'yes' }],
      ['an unknown field', { hostname: 'ok.example.com', extra: true }],
    ])('returns 422 for %s without upserting anything', async (_name, body) => {
      const request = createRequest()
      await request.authenticateAs(admin)
      await request.post('/api/v1/hostnames').send(body).expect(422)
    })

    it('does not create the hostname when the body carries an unknown field', async () => {
      const hostname = randomHostname('unknown-field')
      const request = createRequest()
      await request.authenticateAs(admin)
      await request.post('/api/v1/hostnames').send({ hostname, extra: true }).expect(422)
      const search = await request.get('/api/v1/hostnames').query({ hostname }).expect(200)
      expect(search.body.results).toEqual([])
    })
  })

  describe('PATCH /api/v1/hostnames/:id', () => {
    it('returns 401 without a diagnostic for an anonymous malformed id', async () => {
      const response = await createRequest().patch('/api/v1/hostnames/not-a-uuid').send({})
      expect(response.status).toBe(401)
      expect(response.body.message).toBe('Unauthorized')
    })

    it('returns 403 without a diagnostic for a non-admin malformed id', async () => {
      const request = createRequest()
      await request.authenticateAs(user)
      const response = await request.patch('/api/v1/hostnames/not-a-uuid').send({})
      expect(response.status).toBe(403)
      expect(response.body.message).toBe('Forbidden')
    })

    it('returns 422 for a malformed id', async () => {
      const request = createRequest()
      await request.authenticateAs(admin)
      await request.patch('/api/v1/hostnames/not-a-uuid').send({ is_crawlable: false }).expect(422)
    })

    it.each([
      ['a non-boolean flag', { is_crawlable: 'no' }],
      ['an unknown field', { is_crawlable: false, extra: 1 }],
      ['a non-array status code list', { unreliable_status_codes: 'x' }],
    ])('returns 422 for %s and leaves the hostname unchanged', async (_name, body) => {
      const hostnameId = await insertTestUrlHostname({ hostname: randomHostname('patch-invalid') })
      const request = createRequest()
      await request.authenticateAs(admin)
      await request.patch(`/api/v1/hostnames/${hostnameId}`).send(body).expect(422)
      const detail = await request.get(`/api/v1/hostnames/${hostnameId}`).expect(200)
      expect(detail.body.hostname.is_crawlable).not.toBe(false)
    })

    it('reports a missing hostname only after the body validates', async () => {
      const request = createRequest()
      await request.authenticateAs(admin)
      const missing = '00000000-0000-4000-8000-000000000000'
      await request.patch(`/api/v1/hostnames/${missing}`).send({ is_crawlable: 'no' }).expect(422)
      await request.patch(`/api/v1/hostnames/${missing}`).send({ is_crawlable: false }).expect(404)
    })
  })

  describe('GET /api/v1/hostnames', () => {
    it.each([
      ['an unknown topic_match', 'topic_match=sometimes'],
      ['a non-boolean include_descendants', 'include_descendants=maybe'],
      ['a non-boolean crawlable', 'is_crawlable=maybe'],
    ])('returns 422 for %s', async (_name, query) => {
      await createRequest().get(`/api/v1/hostnames?${query}`).expect(422)
    })

    it('keeps the pagination parser 400 for a malformed limit', async () => {
      await createRequest().get('/api/v1/hostnames?limit=abc').expect(400)
    })
  })
})
