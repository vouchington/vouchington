import { randomBytes } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { cacheValkeyClient } from '@data-stores/valkey/clients'
import { ANONYMOUS_SEARCH_CACHE_PREFIXES } from '@services/entity-cache/anonymous-search-prefixes'
import { invalidateAnonymousSearchCaches, searchCommunitiesCached } from './search-caches.mts'
import { createRandomString, createTestUser, insertTestCommunity } from '@voucha/test-helpers'

const LIVE_ANONYMOUS_SEARCH_PREFIXES = [
  'post_ids_anon',
  'topic_ids_anon',
  'rss_feeds_anon',
  'rss_feed_items_anon',
  'communities_anon',
  'trending_topics_anon',
  'url_hostnames_anon_v2',
  'top_hostnames_anon',
  'trending_rss_feeds_anon',
  'trending_posts_anon',
  'trending_communities_anon',
  'platform_stats_anon',
] as const

const RETIRED_ANONYMOUS_SEARCH_PREFIXES = ['urls_anon', 'url_hostnames_anon'] as const

describe('invalidateAnonymousSearchCaches', () => {
  it('clears every live anonymous search prefix and leaves retired prefixes', async () => {
    const suffix = randomBytes(4).toString('hex')
    const liveKeys = LIVE_ANONYMOUS_SEARCH_PREFIXES.map(prefix => `cache:${prefix}:sweep-${suffix}`)
    const retiredKeys = RETIRED_ANONYMOUS_SEARCH_PREFIXES.map(
      prefix => `cache:${prefix}:sweep-${suffix}`,
    )
    const unrelatedKey = `cache:test_unrelated:sweep-${suffix}`

    try {
      await Promise.all([
        ...liveKeys.map(key => cacheValkeyClient.set(key, 'stale')),
        ...retiredKeys.map(key => cacheValkeyClient.set(key, 'keep')),
        cacheValkeyClient.set(unrelatedKey, 'keep'),
      ])

      await invalidateAnonymousSearchCaches()

      expect([...ANONYMOUS_SEARCH_CACHE_PREFIXES]).toEqual([...LIVE_ANONYMOUS_SEARCH_PREFIXES])
      for (const key of liveKeys) {
        expect(await cacheValkeyClient.get(key)).toBeNull()
      }
      for (const key of retiredKeys) {
        expect(await cacheValkeyClient.get(key)).toBe('keep')
      }
      expect(await cacheValkeyClient.get(unrelatedKey)).toBe('keep')
    } finally {
      await cacheValkeyClient.unlink([...liveKeys, ...retiredKeys, unrelatedKey])
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
