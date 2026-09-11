import { beforeAll, describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/api/test-helpers/server'
import { createTestUser } from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'
import { cacheValkeyClient } from '@data-stores/valkey/clients'
import { invalidateAnonymousSearchCaches } from '@services/entity-fetch/search-caches'

const TRENDING_COMMUNITIES_CACHE_PREFIX = 'trending_communities_anon'
const TRENDING_COMMUNITIES_CACHE_PATTERN = `cache:${TRENDING_COMMUNITIES_CACHE_PREFIX}:*`

describe('GET /api/v1/trending-communities', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
  })

  it('returns communities list for anonymous users', async () => {
    const request = createRequest()
    const response = await request.get('/api/v1/trending-communities').expect(200)
    expect(Array.isArray(response.body.communities)).toBe(true)
    expect(response.body).toHaveProperty('page_info')
    expect(response.headers['cache-control']).toMatch(/public/)
  })

  it('stores anonymous results in the search cache', async () => {
    await invalidateAnonymousSearchCaches()

    try {
      const request = createRequest()
      await request.get('/api/v1/trending-communities?limit=19').expect(200)

      await expect.poll(() => hasTrendingCommunitiesCacheKey()).toBe(true)
    } finally {
      await invalidateAnonymousSearchCaches()
    }
  })

  it('returns communities list for authenticated users without public cache header', async () => {
    const request = createRequest()
    await request.authenticateAs(user)
    const response = await request.get('/api/v1/trending-communities').expect(200)
    expect(Array.isArray(response.body.communities)).toBe(true)
    const cacheControl = response.headers['cache-control'] as string | undefined
    expect(cacheControl == null || !cacheControl.includes('public')).toBe(true)
  })

  it('does not store authenticated results in the anonymous search cache', async () => {
    await invalidateAnonymousSearchCaches()

    try {
      const request = createRequest()
      await request.authenticateAs(user)
      await request.get('/api/v1/trending-communities?limit=47').expect(200)

      expect(await hasTrendingCommunitiesCacheKey()).toBe(false)
    } finally {
      await invalidateAnonymousSearchCaches()
    }
  })

  it('respects limit param', async () => {
    const request = createRequest()
    const response = await request.get('/api/v1/trending-communities?limit=1').expect(200)
    expect(response.body.communities.length).toBeLessThanOrEqual(1)
  })
})

async function hasTrendingCommunitiesCacheKey(): Promise<boolean> {
  let cursor = '0'

  do {
    const [nextCursor, keys] = await cacheValkeyClient.scan(cursor, {
      match: TRENDING_COMMUNITIES_CACHE_PATTERN,
      count: 10,
    })
    cursor = nextCursor.toString()
    if (keys.length > 0) return true
  } while (cursor !== '0')

  return false
}
