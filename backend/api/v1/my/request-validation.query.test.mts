import { beforeAll, describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUser } from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'

type Route = readonly [path: string, resultsKey: string]

// Pagination-parser routes: `createPaginationParser` owns the clamping (a `limit` above 100 becomes
// 100) and every 400. The generated schema only validates the values the parser settled on.
const parserRoutes: readonly Route[] = [
  ['/api/v1/my/email-addresses', 'results'],
  ['/api/v1/my/rewards-program-point-valuations', 'results'],
  ['/api/v1/my/rewards-program-statuses', 'results'],
  ['/api/v1/my/spending-categories', 'results'],
  ['/api/v1/my/notifications/push-subscriptions', 'results'],
  ['/api/v1/my/communities', 'results'],
  ['/api/v1/my/friend-recommendations', 'results'],
  ['/api/v1/my/warnings', 'warnings'],
  ['/api/v1/my/referral-clicks', 'results'],
]

// Hand-parsed routes: a `limit` that is not a positive integer falls back to 25, a larger one is
// clamped to 100, and a repeated or empty `after` is ignored. Only a malformed cursor is a 400.
const lenientRoutes: readonly Route[] = [
  ['/api/v1/my/bans', 'bans'],
  ['/api/v1/my/removed-posts', 'removed_posts'],
]

const anonymousPaths = [
  ...[...parserRoutes, ...lenientRoutes].map(([path]) => `${path}?limit=abc&after=x`),
  '/api/v1/my/contribution-status?action=nope',
  '/api/v1/my/export/rss-feeds?feed_type=xyz',
  '/api/v1/my/export/topics?download=yes&preflight=x',
]

// Plan #285: an anonymous caller gets a bare 401 with no schema diagnostic, and an authenticated
// caller's malformed query is rejected before the service reads or the export streams.
describe('protected my query carrier validation', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
  })

  const signedIn = async () => {
    const request = createRequest()
    await request.authenticateAs(user)
    return request
  }

  it.each(anonymousPaths)('returns 401 without a diagnostic for anonymous %s', async path => {
    const response = await createRequest().get(path).expect(401)
    expect(response.text).not.toMatch(/invalid/i)
  })

  describe.each(parserRoutes)('GET %s', (path, resultsKey) => {
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

    it.each(['limit=500', 'limit=1', 'limit=100&foo=bar', 'foo=bar'])(
      'still serves %s, clamping limit and ignoring unknown parameters',
      async query => {
        const request = await signedIn()
        const response = await request.get(`${path}?${query}`).expect(200)
        expect(Array.isArray(response.body[resultsKey])).toBe(true)
        expect(response.body[resultsKey].length).toBeLessThanOrEqual(100)
        expect(response.body.page_info).toBeDefined()
      },
    )
  })

  describe.each(lenientRoutes)('GET %s', (path, resultsKey) => {
    it.each([
      ['a non-numeric limit', 'limit=abc'],
      ['a zero limit', 'limit=0'],
      ['an over-large limit', 'limit=500'],
      ['a repeated limit', 'limit=5&limit=6'],
      ['an empty cursor', 'after='],
      ['a repeated cursor', 'after=a&after=b'],
      ['an unknown parameter', 'foo=bar'],
    ])('stays lenient for %s', async (_label, query) => {
      const request = await signedIn()
      const response = await request.get(`${path}?${query}`).expect(200)
      expect(response.body[resultsKey]).toEqual([])
      expect(response.body.page_info.has_next_page).toBe(false)
    })

    it('keeps the 400 for a malformed cursor', async () => {
      const request = await signedIn()
      const response = await request.get(`${path}?after=garbage`).expect(400)
      expect(response.text).toContain('Invalid cursor format')
    })
  })

  describe('GET /api/v1/my/removed-posts', () => {
    it('accepts include_platform whether or not it is the literal true', async () => {
      const request = await signedIn()
      for (const value of ['true', 'yes', '1', 'false']) {
        await request.get(`/api/v1/my/removed-posts?include_platform=${value}`).expect(200)
      }
    })
  })

  describe('GET /api/v1/my/contribution-status', () => {
    it('keeps the 400 for an unknown or repeated action, before any plan lookup', async () => {
      const request = await signedIn()
      for (const query of ['action=nope', 'action=review&action=comment', 'action=']) {
        const response = await request.get(`/api/v1/my/contribution-status?${query}`).expect(400)
        expect(response.text).toContain('Invalid action')
      }
    })

    it('still returns the status, with or without a known action or extra parameters', async () => {
      const request = await signedIn()
      for (const query of ['', 'action=review', 'action=rss_feed&foo=bar']) {
        const response = await request.get(`/api/v1/my/contribution-status?${query}`).expect(200)
        expect(response.body.contribution_status).toBeDefined()
      }
    })
  })

  describe('GET /api/v1/my/export/rss-feeds', () => {
    it.each(['article', 'podcast', 'video', 'mixed', ''])(
      'exports for feed_type=%j (an empty value is no filter)',
      async feedType => {
        const request = await signedIn()
        await request.get(`/api/v1/my/export/rss-feeds?feed_type=${feedType}`).expect(200)
      },
    )

    it('keeps the format fallback: json, csv, and OPML for anything else', async () => {
      const request = await signedIn()
      const json = await request.get('/api/v1/my/export/rss-feeds?format=json').expect(200)
      expect(json.headers['content-type']).toContain('application/json')
      expect(json.body).toEqual({ results: [] })
      const csv = await request.get('/api/v1/my/export/rss-feeds?format=csv').expect(200)
      expect(csv.headers['content-type']).toContain('text/csv')
      for (const query of ['', 'format=xml', 'format=json&format=csv']) {
        const opml = await request.get(`/api/v1/my/export/rss-feeds?${query}`).expect(200)
        expect(opml.headers['content-disposition']).toContain('rss-feeds.opml')
      }
    })

    it('answers 204 only to the literal preflight=1', async () => {
      const request = await signedIn()
      await request.get('/api/v1/my/export/rss-feeds?preflight=1').expect(204)
      const response = await request.get('/api/v1/my/export/rss-feeds?preflight=true').expect(200)
      expect(response.headers['content-disposition']).toContain('rss-feeds.opml')
    })
  })

  describe('GET /api/v1/my/export/topics', () => {
    it('keeps the lenient download and preflight switches', async () => {
      const request = await signedIn()
      const bare = await request.get('/api/v1/my/export/topics?download=1').expect(200)
      expect(bare.body).toEqual([])
      for (const query of ['', 'download=yes', 'download=1&download=2', 'preflight=x']) {
        const response = await request.get(`/api/v1/my/export/topics?${query}`).expect(200)
        expect(response.body).toEqual({ results: [] })
      }
      await request.get('/api/v1/my/export/topics?preflight=1').expect(204)
    })
  })
})
