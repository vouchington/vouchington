import { describe, expect, it } from 'vitest'
import { valkeyEvents } from 'valkyries'
import { ValkeyCache } from '@data-stores/valkey/cache'
import { runDetachedBackgroundWork } from '@modules/utils/detached-background-work'
import { COMMUNITIES_ANON_CACHE } from '@services/entity-cache/anonymous-search-prefixes'
import { stableSerialize } from '@services/entity-cache/search-cache'
import { searchCommunitiesCached } from './search-caches.mts'
import { createRandomString, createTestUser, insertTestCommunity } from '@voucha/test-helpers'
import { HTTP_CACHE_SHORT_MAX_AGE_SECONDS } from '@voucha/config'

describe('anonymous community search cache', () => {
  it('returns a cached result until its owned key is deleted', async () => {
    const owner = await createTestUser()
    const suffix = createRandomString(8)
    const options = { search: suffix, limit: 10 }
    const cache = new ValkeyCache<typeof options>({
      prefix: COMMUNITIES_ANON_CACHE,
      ttlSeconds: HTTP_CACHE_SHORT_MAX_AGE_SECONDS,
      keySerializer: stableSerialize,
      runBackgroundRefresh: runDetachedBackgroundWork,
    })
    let stored = Promise.withResolvers<void>()
    const onSet = (event: { cacheName: string; keys: string[] }) => {
      if (
        event.cacheName === COMMUNITIES_ANON_CACHE &&
        event.keys.includes(stableSerialize(options))
      ) {
        stored.resolve()
      }
    }
    valkeyEvents.on('cache:set', onSet)

    try {
      const firstCommunity = await insertTestCommunity({
        createdById: owner.id,
        name: `Cached Community ${suffix} One`,
        slug: `cached-community-${suffix}-one`,
      })

      const first = await searchCommunitiesCached(options)
      expect(first.results.map(community => community.id)).toContain(firstCommunity.id)
      await stored.promise

      const secondCommunity = await insertTestCommunity({
        createdById: owner.id,
        name: `Cached Community ${suffix} Two`,
        slug: `cached-community-${suffix}-two`,
      })

      const cached = await searchCommunitiesCached(options)
      const cachedIds = cached.results.map(community => community.id)
      expect(cachedIds).toContain(firstCommunity.id)
      expect(cachedIds).not.toContain(secondCommunity.id)

      stored = Promise.withResolvers<void>()
      valkeyEvents.on('cache:set-skipped', onSet)
      await cache.delete(options)

      const refreshed = await searchCommunitiesCached(options)
      await stored.promise
      expect(refreshed.results.map(community => community.id)).toContain(secondCommunity.id)
    } finally {
      valkeyEvents.off('cache:set', onSet)
      valkeyEvents.off('cache:set-skipped', onSet)
      await cache.delete(options)
    }
  })
})
