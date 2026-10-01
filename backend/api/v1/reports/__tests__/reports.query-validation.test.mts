import { beforeAll, describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUser } from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'

// `status` and `sort` settle to defaults instead of failing and the pagination parsers keep their
// own answers, so the generated query contract only adds the closed `cluster` mode.
describe('GET /api/v1/reports query contract', () => {
  let staff: PrivateUser
  let member: PrivateUser

  beforeAll(async () => {
    ;[staff, member] = await Promise.all([
      createTestUser({ administrator: true }),
      createTestUser(),
    ])
  })

  it('answers 401 before reading the query', async () => {
    const response = await createRequest().get('/api/v1/reports?cluster=nope&limit=abc')

    expect(response.status).toBe(401)
    expect(response.text).not.toMatch(/schema|must be|invalid/i)
  })

  it.each(['cluster=nope', 'cluster=entity&cluster=entity', 'cluster='])(
    'answers 422 for an unknown or repeated cluster mode (%s)',
    async query => {
      for (const user of [staff, member]) {
        const request = createRequest()
        await request.authenticateAs(user)
        await request.get(`/api/v1/reports?${query}`).expect(422)
      }
    },
  )

  it('keeps the staff-only 403 for the entity cluster mode', async () => {
    const request = createRequest()
    await request.authenticateAs(member)

    await request.get('/api/v1/reports?cluster=entity').expect(403)
  })

  it.each([
    'status=nope',
    'status=pending&status=resolved',
    'sort=nope',
    'sort=severity&sort=most_reported',
    'sort=most_reported',
    'unknown=1',
    'limit=1000',
  ])('keeps the lenient fallback for %s', async query => {
    for (const user of [staff, member]) {
      const request = createRequest()
      await request.authenticateAs(user)

      const response = await request.get(`/api/v1/reports?${query}`).expect(200)
      expect(response.body.results.length).toBeLessThanOrEqual(100)
    }
  })

  it('keeps the parser answers for an unreadable limit and an unusable cursor pair', async () => {
    const request = createRequest()
    await request.authenticateAs(staff)

    await request.get('/api/v1/reports?limit=abc').expect(400)
    await request.get('/api/v1/reports?after=a&before=b').expect(422)
    await request.get('/api/v1/reports?after=not-a-cursor').expect(422)
  })
})
