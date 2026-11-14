import { describe, expect, it } from 'vitest'
import {
  advanceAnonymousCacheGeneration,
  getAnonymousCacheGeneration,
} from '@services/entity-cache/anonymous-cache-generation'
import { searchCommunitiesCached } from './search-caches.mts'
import { createRandomString, createTestUser, insertTestCommunity } from '@voucha/test-helpers'

describe('anonymous community search cache', () => {
  it('reuses a search result until the legal namespace changes', async () => {
    const owner = await createTestUser()
    const suffix = createRandomString(8)
    const options = { search: suffix, limit: 10 }
    const firstCommunity = await insertTestCommunity({
      createdById: owner.id,
      name: `Cached Community ${suffix} One`,
      slug: `cached-community-${suffix}-one`,
    })
    const generation = await getAnonymousCacheGeneration()
    const first = await searchCommunitiesCached(options)
    expect(first.results.map(community => community.id)).toContain(firstCommunity.id)

    const secondCommunity = await insertTestCommunity({
      createdById: owner.id,
      name: `Cached Community ${suffix} Two`,
      slug: `cached-community-${suffix}-two`,
    })
    const cached = await searchCommunitiesCached(options)
    const stableGeneration = generation === (await getAnonymousCacheGeneration())
    const cachedIds = cached.results.map(community => community.id)
    expect(cachedIds).toContain(firstCommunity.id)
    expect(stableGeneration ? cachedIds : []).not.toContain(secondCommunity.id)

    await advanceAnonymousCacheGeneration()
    const refreshed = await searchCommunitiesCached(options)
    expect(refreshed.results.map(community => community.id)).toContain(secondCommunity.id)
  })
})
