import { beforeAll, describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUser } from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'

const path = '/api/v1/hostnames/blocked'

describe('GET /api/v1/hostnames/blocked request validation', () => {
  let admin: PrivateUser
  let member: PrivateUser

  beforeAll(async () => {
    ;[admin, member] = await Promise.all([
      createTestUser({ administrator: true }),
      createTestUser(),
    ])
  })

  it('answers authorization before a malformed cursor', async () => {
    const anonymous = await createRequest().get(`${path}?after=not-a-cursor`).expect(401)
    expect(anonymous.text).not.toMatch(/cursor|invalid request query/i)

    const request = createRequest()
    await request.authenticateAs(member)
    const forbidden = await request.get(`${path}?after=not-a-cursor`).expect(403)
    expect(forbidden.text).not.toMatch(/cursor|invalid request query/i)
  })

  it('keeps the service cursor parser 400 for an administrator', async () => {
    const request = createRequest()
    await request.authenticateAs(admin)
    await request.get(`${path}?after=not-a-cursor`).expect(400)
  })

  it.each([
    ['non-numeric', 'limit=bad', 25],
    ['zero', 'limit=0', 1],
    ['over-large', 'limit=500', 100],
  ])('normalizes a %s limit before querying', async (_label, query, maxResults) => {
    const request = createRequest()
    await request.authenticateAs(admin)

    const response = await request.get(`${path}?${query}`).expect(200)
    expect(Array.isArray(response.body.results)).toBe(true)
    expect(response.body.results.length).toBeLessThanOrEqual(maxResults)
    expect(response.body.page_info).toBeDefined()
  })
})
