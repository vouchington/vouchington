import { randomUUID } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUser } from '@voucha/test-helpers'
import { registerStaffRequestContractTests } from '../../../test-helpers/staff-request-contract-matrix.mts'
import type { PrivateUser } from '@services/users/types'

const ID = randomUUID()

// Staff GET routes: the role gate answers first, then the generated query contract answers 422.
describe('staff list query contract ordering', () => {
  registerStaffRequestContractTests([
    ['modlog malformed community_id', 'get', '/api/v1/admin/modlog?community_id=not-a-uuid'],
    ['modlog malformed actor_id', 'get', '/api/v1/admin/modlog?actor_id=not-a-uuid'],
    [
      'modlog repeated community_id',
      'get',
      `/api/v1/admin/modlog?community_id=${ID}&community_id=${ID}`,
    ],
    [
      'refundable charges malformed user_id',
      'get',
      '/api/v1/memberships/refundable-charges?user_id=x',
    ],
  ])
})

// The remaining list routes settle lenient values first, so the contract keeps their 200s and their
// parser 400s; every case below is the behavior from before the contract was added.
describe('staff list routes keep their lenient reads', () => {
  let admin: PrivateUser
  let member: PrivateUser

  beforeAll(async () => {
    ;[admin, member] = await Promise.all([
      createTestUser({ administrator: true }),
      createTestUser(),
    ])
  })

  it.each(['/api/v1/admin/ai-costs', '/api/v1/posts/review-queue', '/api/v1/rss-feed-categories'])(
    '%s clamps the limit, ignores unknown keys, and keeps the parser 400s',
    async path => {
      const request = createRequest()
      await request.authenticateAs(admin)

      await request.get(`${path}?limit=500`).expect(200)
      await request.get(`${path}?unknown=1`).expect(200)
      await request.get(`${path}?limit=abc`).expect(400)
      await request.get(`${path}?after=not-a-cursor`).expect(400)
    },
  )

  it.each(['/api/v1/admin/ai-costs', '/api/v1/posts/review-queue', '/api/v1/rss-feed-categories'])(
    '%s answers 403 for a member before the parser reads a malformed query',
    async path => {
      const request = createRequest()
      await request.authenticateAs(member)

      const response = await request.get(`${path}?limit=abc&after=x`)
      expect(response.status).toBe(403)
      expect(response.text).not.toMatch(/schema|must be|invalid/i)
    },
  )

  it('settles unknown or repeated category statuses to pending', async () => {
    const request = createRequest()
    await request.authenticateAs(admin)

    await request.get('/api/v1/rss-feed-categories?status=nope').expect(200)
    await request.get('/api/v1/rss-feed-categories?status=all&status=rejected').expect(200)
    await request.get('/api/v1/rss-feed-categories?status=rejected').expect(200)
  })

  it.each(['/api/v1/growth-metrics', '/api/v1/admin/moderation-analytics'])(
    '%s falls back to the 30d range for an unknown or repeated range',
    async path => {
      const outsider = createRequest()
      await outsider.authenticateAs(member)
      await outsider.get(`${path}?range=nope`).expect(403)

      const request = createRequest()
      await request.authenticateAs(admin)
      for (const query of ['range=nope', 'range=7d&range=90d', 'range=7d&unknown=1']) {
        await request.get(`${path}?${query}`).expect(200)
      }
    },
  )

  it('ignores an unknown modlog action_type and an empty id', async () => {
    const request = createRequest()
    await request.authenticateAs(admin)

    await request.get('/api/v1/admin/modlog?action_type=nope&community_id=').expect(200)
    await request.get('/api/v1/admin/modlog?limit=500&unknown=1').expect(200)
    await request.get('/api/v1/admin/modlog?limit=abc').expect(400)
  })

  it('keeps refundable-charges 400 for a missing or repeated user_id', async () => {
    const request = createRequest()
    await request.authenticateAs(admin)

    await request.get('/api/v1/memberships/refundable-charges').expect(400)
    await request
      .get(`/api/v1/memberships/refundable-charges?user_id=${ID}&user_id=${ID}`)
      .expect(400)
  })
})
