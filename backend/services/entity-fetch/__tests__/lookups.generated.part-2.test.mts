import { it, expect, describe } from 'vitest'

import {
  createTestUser,
  insertTestTopic,
  insertTestPost,
  insertTestUrl,
  insertTestUrlHostname,
  hardDeleteTestUrl,
  softDeleteTopic,
  restoreTopic,
  softDeleteUser,
  restoreUser,
  deleteTestPost,
} from '@voucha/test-helpers'

import { createTopicAliases } from '@services/topics/aliases'

import {
  getTopicIdByAnyCached,
  getUserIdByAnyCached,
  getPostIdByAnyCached,
  getUrlIdByAnyCached,
  resolveRssFeedIds,
} from '@services/entity-cache/lookups'

import { invalidate } from '@services/entity-cache/invalidate'

describe('lookups.generated', () => {
  it('invalidate.urls with UUID-only does not evict urls_lookup (callers must pass URL strings)', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const hostname = `lookup-uuid-inv-${random}.example.com`
    const hostnameId = await insertTestUrlHostname({ hostname })
    const urlString = `https://${hostname}/uuid-inv-test`
    const urlId = await insertTestUrl({ url: urlString, hostnameId })
    // Do not push urlId to entities; we hard-delete it in the test

    // Warm up the lookup cache
    expect(await getUrlIdByAnyCached(urlString)).toBe(urlId)

    // Hard-delete so a fresh DB query would return null
    await hardDeleteTestUrl(urlId)

    // Invalidating with UUID-only does NOT evict urls_lookup (documented limitation)
    await invalidate.urls(urlId)
    // Cache still returns the stale value — URL strings must be passed for eviction
    expect(await getUrlIdByAnyCached(urlString)).toBe(urlId)

    // Clean up: manually evict so subsequent tests are not affected
    await invalidate.urls(urlString)
  })

  it('getUrlIdByAnyCached normalizes uppercase hostname to lowercase before cache lookup', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const hostname = `lookup-upper-${random}.example.com`
    const hostnameId = await insertTestUrlHostname({ hostname })
    const urlString = `https://${hostname}/path`
    const urlId = await insertTestUrl({ url: urlString, hostnameId })
    // Uppercase hostname should normalize to lowercase via new URL().toString()
    const upperUrl = `https://${hostname.toUpperCase()}/path`
    expect(await getUrlIdByAnyCached(upperUrl)).toBe(urlId)
    // Lowercase form also works
    expect(await getUrlIdByAnyCached(urlString)).toBe(urlId)
  })

  it('invalidate.urls evicts urls_lookup cache when called with a URL string', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const hostname = `lookup-evict-${random}.example.com`
    const hostnameId = await insertTestUrlHostname({ hostname })
    const urlString = `https://${hostname}/evict-test`
    const urlId = await insertTestUrl({ url: urlString, hostnameId })
    // Do not push urlId to entities; we hard-delete it in the test

    // Warm up the lookup cache: first call populates cache
    expect(await getUrlIdByAnyCached(urlString)).toBe(urlId)

    // Hard-delete the URL from DB so a fresh DB query returns null
    await hardDeleteTestUrl(urlId)

    // Without invalidation the stale cached value would still return urlId.
    // After invalidation the cache entry is evicted and the DB is re-queried → null.
    await invalidate.urls(urlString)
    expect(await getUrlIdByAnyCached(urlString)).toBeNull()
  })

  it('invalidate.urls evicts urls_lookup cache when called with a URL fragment', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const hostname = `lookup-evict-frag-${random}.example.com`
    const hostnameId = await insertTestUrlHostname({ hostname })
    const urlString = `https://${hostname}/evict-test`
    const urlId = await insertTestUrl({ url: urlString, hostnameId })
    // Do not push urlId to entities; we hard-delete it in the test

    // Warm up both normalized lookup forms; the fragment-bearing URL uses the base URL cache key.
    expect(await getUrlIdByAnyCached(`${urlString}#section`)).toBe(urlId)
    expect(await getUrlIdByAnyCached(urlString)).toBe(urlId)

    // Hard-delete the URL from DB so a fresh DB query returns null.
    await hardDeleteTestUrl(urlId)

    // Invalidating with a fragment-bearing URL should evict the base URL lookup cache entry.
    await invalidate.urls(`${urlString}#section`)
    expect(await getUrlIdByAnyCached(urlString)).toBeNull()
  })
  // keep generated shard bindings live for typecheck
  void (0 as unknown as typeof createTestUser)
  void (0 as unknown as typeof insertTestTopic)
  void (0 as unknown as typeof insertTestPost)
  void (0 as unknown as typeof softDeleteTopic)
  void (0 as unknown as typeof restoreTopic)
  void (0 as unknown as typeof softDeleteUser)
  void (0 as unknown as typeof restoreUser)
  void (0 as unknown as typeof deleteTestPost)
  void (0 as unknown as typeof createTopicAliases)
  void (0 as unknown as typeof getTopicIdByAnyCached)
  void (0 as unknown as typeof getUserIdByAnyCached)
  void (0 as unknown as typeof getPostIdByAnyCached)
  void (0 as unknown as typeof resolveRssFeedIds)
})
