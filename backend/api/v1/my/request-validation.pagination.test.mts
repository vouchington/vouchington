import { beforeAll, describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUser } from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'

// Paginated reads that parse `after` and `limit` with `createPaginationParser` and now declare the
// query with `apiQuery`. The parser owns every 400 and clamps `limit` (500 becomes 100); the
// generated schema only validates the values the parser settled on, so it never adds a status.
const routes = [
  '/api/v1/my/cards',
  '/api/v1/my/notifications',
  '/api/v1/my/messages',
  '/api/v1/my/oauth-apps',
  '/api/v1/my/oauth-grants',
  '/api/v1/my/api-keys',
] as const

// Plan #285: an anonymous caller gets a bare 401 with no schema diagnostic, and the parser keeps
// its 400 for an authenticated caller.
describe('protected my pagination query carrier validation', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
  })

  const signedIn = async () => {
    const request = createRequest()
    await request.authenticateAs(user)
    return request
  }

  it.each(routes)('returns 401 without a diagnostic for anonymous GET %s', async path => {
    const response = await createRequest().get(`${path}?limit=abc&after=x`).expect(401)
    expect(response.text).not.toMatch(/invalid/i)
  })

  describe.each(routes)('GET %s', path => {
    it.each([
      ['a non-numeric limit', 'limit=abc'],
      ['a zero limit', 'limit=0'],
      ['a repeated limit', 'limit=5&limit=6'],
      ['an empty cursor', 'after='],
      ['a repeated cursor', 'after=a&after=b'],
      ['a malformed cursor', 'after=garbage'],
    ])('keeps the parser 400 for %s', async (_label, query) => {
      const request = await signedIn()
      const response = await request.get(`${path}?${query}`).expect(400)
      expect(response.text).not.toContain('Invalid request query')
    })

    it.each(['', 'limit=500', 'limit=1', 'limit=100&foo=bar', 'foo=bar'])(
      'still serves %j, clamping limit and ignoring unknown parameters',
      async query => {
        const request = await signedIn()
        const response = await request.get(`${path}?${query}`).expect(200)
        expect(Array.isArray(response.body.results)).toBe(true)
        expect(response.body.results.length).toBeLessThanOrEqual(100)
        expect(response.body.page_info).toBeDefined()
      },
    )
  })
})
