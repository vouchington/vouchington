import { randomUUID } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ValkeyCache } from '@data-stores/valkey/cache'
import { cacheValkeyClient } from '@data-stores/valkey/clients'
import { stableSerialize } from '@services/entity-cache'
import { createFediverseAdapters } from './factory.mts'

const fetchSpy = vi.hoisted(() => vi.fn<VitestLooseMock>())
vi.mock<typeof import('undici')>(import('undici'), async () => {
  const actual = await vi.importActual<typeof import('undici')>('undici')
  return { ...actual, fetch: fetchSpy }
})

const ACCOUNT = {
  username: 'alice',
  display_name: 'Alice',
  url: 'https://mastodon.example/@alice',
}

function accountsResponse(): Response {
  return new Response(JSON.stringify({ accounts: [ACCOUNT] }), { status: 200 })
}

/** Wrap the real `ValkeyCache.set` so a test can await the fire-and-forget cache write. */
function trackCacheWrites(): { writes: Promise<unknown>[] } {
  const writes: Promise<unknown>[] = []
  const set = ValkeyCache.prototype.set
  vi.spyOn(ValkeyCache.prototype, 'set').mockImplementation(function (
    this: ValkeyCache,
    cacheKey,
    value,
    ttl,
  ) {
    const result = set.call(this, cacheKey, value, ttl)
    writes.push(result)
    return result
  })
  return { writes }
}

describe('createFediverseAdapters caching', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    fetchSpy.mockReset()
  })

  it('caches an `ok` bucket and serves it on a subsequent identical search', async () => {
    fetchSpy.mockResolvedValue(accountsResponse())
    const { writes } = trackCacheWrites()
    const { mastodon } = createFediverseAdapters()
    const options = { q: randomUUID(), type: 'profile' as const }

    const first = await mastodon.search(options)
    await Promise.all(writes)
    const second = await mastodon.search(options)

    expect(first.status).toBe('ok')
    expect(first.items.map(item => item.title)).toEqual(['Alice'])
    expect(second).toEqual(first)
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })

  it('does not cache `partial` or `error` buckets, so every call re-fetches', async () => {
    fetchSpy.mockResolvedValue(new Response('boom', { status: 500 }))
    const { mastodon } = createFediverseAdapters()
    const options = { q: randomUUID(), type: 'profile' as const }

    const first = await mastodon.search(options)
    const second = await mastodon.search(options)

    expect(first).toEqual({
      provider: 'mastodon',
      status: 'error',
      items: [],
      error_code: 'provider_error',
    })
    expect(second.status).toBe('error')
    expect(fetchSpy).toHaveBeenCalledTimes(2)
  })

  it('keys the cache by search options, so different queries do not collide', async () => {
    fetchSpy.mockResolvedValue(accountsResponse())
    const { writes } = trackCacheWrites()
    const { mastodon } = createFediverseAdapters()

    await mastodon.search({ q: randomUUID(), type: 'profile' })
    await mastodon.search({ q: randomUUID(), type: 'profile' })
    await Promise.all(writes)

    expect(fetchSpy).toHaveBeenCalledTimes(2)
  })

  it('falls through to a live fetch when a cached entry fails to decode, instead of throwing', async () => {
    fetchSpy.mockResolvedValue(accountsResponse())
    const { mastodon } = createFediverseAdapters()
    const options = { q: randomUUID(), type: 'profile' as const }

    // Write malformed JSON directly at the physical key the adapter will read,
    // bypassing its serializer, to force a real decode failure.
    const probe = new ValkeyCache({ prefix: 'fediverse-search:mastodon', ttlSeconds: 60 })
    await cacheValkeyClient.set(probe.getKey(stableSerialize(options)), 'not-json{')

    const bucket = await mastodon.search(options)

    expect(bucket.status).toBe('ok')
    expect(bucket.items.map(item => item.title)).toEqual(['Alice'])
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })
})

describe('createFediverseAdapters', () => {
  it('returns an adapter for every Fediverse search provider, keyed to its own provider', () => {
    const adapters = createFediverseAdapters()

    expect(Object.keys(adapters).toSorted()).toEqual(['bluesky', 'lemmy', 'mastodon', 'peertube'])
    expect(adapters.peertube.provider).toBe('peertube')
    expect(adapters.mastodon.provider).toBe('mastodon')
    expect(adapters.lemmy.provider).toBe('lemmy')
    expect(adapters.bluesky.provider).toBe('bluesky')
  })

  it('returns a fresh adapter map on each call', () => {
    const first = createFediverseAdapters()
    const second = createFediverseAdapters()

    expect(first).not.toBe(second)
    expect(first.peertube).not.toBe(second.peertube)
  })
})
