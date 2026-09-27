/* oxlint-disable vitest/consistent-test-it, jest/consistent-test-it -- registrars live outside *.test.* because jest/no-export forbids exporting them from test files, and oxfmt rewrites it() to test() there */
import { beforeAll, expect, test } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUser } from '@voucha/test-helpers'
import { createApiKey } from '../services/api-keys/index.mts'
import type { PrivateUser } from '../services/users/types.mts'

/** Shared RSS feed route cases. Call from a literal `describe` after the route module import. */
export function registerRssFeedRouteTests(
  path: '/rss/news' | '/rss/posts',
  keyLabel: string,
): { freshKey: () => Promise<string> } {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
  }, 30_000)

  async function freshKey() {
    const result = await createApiKey(
      user.id,
      'rss',
      `${keyLabel} ${Math.random().toString(36).slice(2, 8)}`,
      ['rss:read'],
    )
    return result.rawKey
  }

  test('returns 200 with RSS XML for unauthenticated access (no apikey)', async () => {
    const request = createRequest()
    const response = await request.get(path).expect(200)
    expect(response.headers['content-type']).toContain('application/rss+xml')
    expect(response.text).toContain('<?xml')
    expect(response.text).toContain('<rss')
    expect(response.text).toContain('</rss>')
  })

  test('returns 403 for invalid apikey', async () => {
    const request = createRequest()
    await request.get(`${path}?apikey=voucha_rss_invalid_key_invalid`).expect(403)
  })

  test('returns 200 with RSS XML for valid apikey', async () => {
    const rawKey = await freshKey()
    const request = createRequest()
    const response = await request.get(`${path}?apikey=${rawKey}`).expect(200)
    expect(response.headers['content-type']).toContain('application/rss+xml')
    expect(response.text).toContain('<?xml')
    expect(response.text).toContain('<rss')
    expect(response.text).toContain('</rss>')
  })

  test('returns 200 with topics filter', async () => {
    const rawKey = await freshKey()
    const request = createRequest()
    const response = await request.get(`${path}?apikey=${rawKey}&topics=nonexistent`).expect(200)
    expect(response.text).toContain('<rss')
  })

  test('sets private cache and referrer headers when an API key is present', async () => {
    const rawKey = await freshKey()
    const request = createRequest()
    const response = await request.get(`${path}?apikey=${rawKey}`).expect(200)
    expect(response.headers['cache-control']).toBe('private, max-age=300')
    expect(response.headers['referrer-policy']).toBe('no-referrer')
  })

  test('sets public cache headers for anonymous access', async () => {
    const request = createRequest()
    const response = await request.get(path).expect(200)
    expect(response.headers['cache-control']).toBe('public, max-age=300')
    expect(response.headers['referrer-policy']).toBeUndefined()
  })

  test('returns ETag header', async () => {
    const rawKey = await freshKey()
    const request = createRequest()
    const response = await request.get(`${path}?apikey=${rawKey}`).expect(200)
    expect(response.headers['etag']).toMatch(/^"[A-Za-z0-9_-]+"$/)
  })

  return { freshKey }
}
