import { beforeAll, describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUser } from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'

describe('GET /api/v1/recommended-topics request validation', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
  })

  it('answers authentication before a malformed cursor', async () => {
    const response = await createRequest()
      .get('/api/v1/recommended-topics?after=not-a-cursor')
      .expect(401)

    expect(response.text).not.toMatch(/cursor|invalid request query/i)
  })

  it.each(['after=not-a-cursor', 'limit=bad', 'limit=5&limit=6'])(
    'keeps the pagination parser 400 for %s',
    async query => {
      const request = createRequest()
      await request.authenticateAs(user)

      const response = await request.get(`/api/v1/recommended-topics?${query}`).expect(400)
      expect(response.text).not.toContain('Invalid request query')
    },
  )

  it('rejects an unknown sort through the generated query contract', async () => {
    const request = createRequest()
    await request.authenticateAs(user)

    const response = await request.get('/api/v1/recommended-topics?sort=unknown').expect(422)
    expect(response.text).toContain('Invalid request query')
  })

  it('serves a normalized limit and ignores unrelated query keys', async () => {
    const request = createRequest()
    await request.authenticateAs(user)

    const response = await request.get('/api/v1/recommended-topics?limit=500&unknown=1').expect(200)

    expect(Array.isArray(response.body.results)).toBe(true)
    expect(response.body.results.length).toBeLessThanOrEqual(100)
    expect(response.body.page_info).toBeDefined()
  })
})
