import { randomUUID } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUser } from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'

const malformedId = 'not-a-uuid'

describe('household routes - request contract validation', () => {
  let owner: PrivateUser

  beforeAll(async () => {
    owner = await createTestUser()
  }, 60_000)

  describe('anonymous callers', () => {
    it.each([
      ['get', `/api/v1/households?access=other`, undefined],
      ['post', '/api/v1/households', { extra: true }],
      ['get', `/api/v1/households/${malformedId}`, undefined],
      ['patch', `/api/v1/households/${malformedId}`, { extra: true }],
      ['delete', `/api/v1/households/${malformedId}`, undefined],
      ['get', `/api/v1/households/${malformedId}/memberships?limit=abc`, undefined],
      ['post', `/api/v1/households/${malformedId}/memberships`, { individual_id: 5 }],
      ['delete', `/api/v1/households/${malformedId}/memberships/${malformedId}`, undefined],
    ] as const)('%s %s returns 401 without a validation diagnostic', async (method, path, body) => {
      const response = await createRequest()[method](path).send(body).expect(401)
      expect(response.body.message).toBe('Unauthorized')
    })
  })

  describe('authenticated callers', () => {
    it.each([
      ['get', `/api/v1/households/${malformedId}`],
      ['patch', `/api/v1/households/${malformedId}`],
      ['delete', `/api/v1/households/${malformedId}`],
      ['get', `/api/v1/households/${malformedId}/memberships`],
      ['post', `/api/v1/households/${malformedId}/memberships`],
      ['delete', `/api/v1/households/${malformedId}/memberships/${randomUUID()}`],
      ['delete', `/api/v1/households/${randomUUID()}/memberships/${malformedId}`],
    ] as const)('%s %s returns 422 for a malformed id', async (method, path) => {
      const request = createRequest()
      await request.authenticateAs(owner)
      await request[method](path).send({}).expect(422)
    })

    it('returns 422 for an unknown access filter and keeps the pagination 400', async () => {
      const request = createRequest()
      await request.authenticateAs(owner)
      await request.get('/api/v1/households').query({ access: 'everyone' }).expect(422)
      await request.get('/api/v1/households').query({ limit: 'abc' }).expect(400)
    })

    it.each([
      ['an array body', []],
      ['an unknown field', { extra: true }],
    ])('rejects %s on household create and update without side effects', async (_name, body) => {
      const request = createRequest()
      await request.authenticateAs(owner)
      const created = await request.post('/api/v1/households').send({}).expect(201)
      const householdId = created.body.household.id as string
      const before = await request.get('/api/v1/households').query({ access: 'owned' }).expect(200)

      await request.post('/api/v1/households').send(body).expect(422)
      await request.patch(`/api/v1/households/${householdId}`).send(body).expect(422)

      const after = await request.get('/api/v1/households').query({ access: 'owned' }).expect(200)
      expect(after.body.results).toHaveLength(before.body.results.length)
    })

    it.each([
      ['a missing individual_id', {}],
      ['a malformed individual_id', { individual_id: malformedId }],
      ['a non-string relationship', { individual_id: randomUUID(), relationship: 5 }],
      ['an unknown field', { individual_id: randomUUID(), extra: true }],
    ])('returns 422 for %s on membership create', async (_name, body) => {
      const request = createRequest()
      await request.authenticateAs(owner)
      const created = await request.post('/api/v1/households').send({}).expect(201)
      await request
        .post(`/api/v1/households/${created.body.household.id}/memberships`)
        .send(body)
        .expect(422)
    })
  })
})
