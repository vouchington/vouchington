import { randomBytes } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { cacheValkeyClient } from '@data-stores/valkey/clients'
import { invalidateAnonymousSearchCaches, searchCommunitiesCached } from './search-caches.mts'
import { createRandomString, createTestUser, insertTestCommunity } from '@voucha/test-helpers'

describe('invalidateAnonymousSearchCaches', () => {
  it('clears anonymous search cache prefixes without clearing unrelated caches', async () => {
    const suffix = randomBytes(4).toString('hex')
    const searchKey = `cache:trending_topics_anon:test-${suffix}`
    const unrelatedKey = `cache:test_unrelated:test-${suffix}`

    try {
      await Promise.all([
        cacheValkeyClient.set(searchKey, 'stale'),
        cacheValkeyClient.set(unrelatedKey, 'keep'),
      ])

      await invalidateAnonymousSearchCaches()

      expect(await cacheValkeyClient.get(searchKey)).toBeNull()
      expect(await cacheValkeyClient.get(unrelatedKey)).toBe('keep')
    } finally {
      await cacheValkeyClient.unlink([searchKey, unrelatedKey])
    }
  })

  it('caches anonymous community search results until anonymous search caches are invalidated', async () => {
    await invalidateAnonymousSearchCaches()

    const owner = await createTestUser()
    const suffix = createRandomString(8)
    const firstCommunity = await insertTestCommunity({
      createdById: owner.id,
      name: `Cached Community ${suffix} One`,
      slug: `cached-community-${suffix}-one`,
    })

    const first = await searchCommunitiesCached({ search: suffix, limit: 10 })
    expect(first.results.map(community => community.id)).toContain(firstCommunity.id)

    const secondCommunity = await insertTestCommunity({
      createdById: owner.id,
      name: `Cached Community ${suffix} Two`,
      slug: `cached-community-${suffix}-two`,
    })

    const cached = await searchCommunitiesCached({ search: suffix, limit: 10 })
    const cachedIds = cached.results.map(community => community.id)
    expect(cachedIds).toContain(firstCommunity.id)
    expect(cachedIds).not.toContain(secondCommunity.id)

    await invalidateAnonymousSearchCaches()

    const refreshed = await searchCommunitiesCached({ search: suffix, limit: 10 })
    expect(refreshed.results.map(community => community.id)).toContain(secondCommunity.id)
  })
})
