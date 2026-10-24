import { randomUUID } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import { valkeyEvents } from 'valkyries'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUser } from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'
import { cacheValkeyClient } from '@data-stores/valkey/clients'
import { ValkeyCache } from '@data-stores/valkey/cache'
import { TRENDING_COMMUNITIES_ANON_CACHE } from '@services/entity-cache/anonymous-search-prefixes'
import { stableSerialize } from '@services/entity-cache/search-cache'
import { encodeCursor } from '@modules/pagination'
import { HTTP_CACHE_SHORT_MAX_AGE_SECONDS } from '@voucha/config'

type CacheOptions = { limit: number; after: string }

const trendingCache = new ValkeyCache<CacheOptions>({
  prefix: TRENDING_COMMUNITIES_ANON_CACHE,
  ttlSeconds: HTTP_CACHE_SHORT_MAX_AGE_SECONDS,
  keySerializer: stableSerialize,
})

describe('GET /api/v1/trending-communities', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
  })

  it('returns communities list for anonymous users', async () => {
    const options = ownedOptions(10)
    const cached = watchCacheSet(options)
    try {
      const response = await createRequest()
        .get('/api/v1/trending-communities')
        .query(options)
        .expect(200)
      await cached.done
      expect(Array.isArray(response.body.communities)).toBe(true)
      expect(response.body).toHaveProperty('page_info')
      expect(response.headers['cache-control']).toMatch(/public/)
    } finally {
      cached.stop()
      await trendingCache.delete(options)
    }
  })

  it('stores anonymous results in the search cache', async () => {
    const options = ownedOptions(19)
    const cached = watchCacheSet(options)

    try {
      await createRequest().get('/api/v1/trending-communities').query(options).expect(200)
      await cached.done

      expect(await cacheValkeyClient.get(trendingCache.getKey(options))).not.toBeNull()
    } finally {
      cached.stop()
      await trendingCache.delete(options)
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
    const authOptions = ownedOptions(47)
    const siblingOptions = ownedOptions(19)
    const siblingCached = watchCacheSet(siblingOptions)
    const authSerializedKey = stableSerialize(authOptions)
    let authWriteSeen = false
    const onSet = (event: { cacheName: string; keys: string[] }) => {
      if (
        event.cacheName === TRENDING_COMMUNITIES_ANON_CACHE &&
        event.keys.includes(authSerializedKey)
      ) {
        authWriteSeen = true
      }
    }
    valkeyEvents.on('cache:set', onSet)

    try {
      const request = createRequest()
      await request.authenticateAs(user)
      await request.get('/api/v1/trending-communities').query(authOptions).expect(200)
      await createRequest().get('/api/v1/trending-communities').query(siblingOptions).expect(200)
      await siblingCached.done

      expect(authWriteSeen).toBe(false)
      expect(await cacheValkeyClient.get(trendingCache.getKey(authOptions))).toBeNull()
    } finally {
      valkeyEvents.off('cache:set', onSet)
      siblingCached.stop()
      await Promise.all([trendingCache.delete(authOptions), trendingCache.delete(siblingOptions)])
    }
  })

  it('respects limit param', async () => {
    const options = ownedOptions(1)
    const cached = watchCacheSet(options)
    try {
      const response = await createRequest()
        .get('/api/v1/trending-communities')
        .query(options)
        .expect(200)
      await cached.done
      expect(response.body.communities.length).toBeLessThanOrEqual(1)
    } finally {
      cached.stop()
      await trendingCache.delete(options)
    }
  })
})

function ownedOptions(limit: number): CacheOptions {
  return { limit, after: encodeCursor({ score: Number.MAX_SAFE_INTEGER, id: randomUUID() }) }
}

function watchCacheSet(options: CacheOptions): { done: Promise<void>; stop: () => void } {
  const serializedKey = stableSerialize(options)
  let stop = () => {}
  const done = new Promise<void>(resolve => {
    const onSet = (event: { cacheName: string; keys: string[] }) => {
      if (
        event.cacheName !== TRENDING_COMMUNITIES_ANON_CACHE ||
        !event.keys.includes(serializedKey)
      ) {
        return
      }
      stop()
      resolve()
    }
    stop = () => {
      valkeyEvents.off('cache:set', onSet)
    }
    valkeyEvents.on('cache:set', onSet)
  })
  return { done, stop }
}
