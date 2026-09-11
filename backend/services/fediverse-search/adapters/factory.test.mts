import type { FediverseProviderAdapter, FediverseSearchBucket } from '../types.mts'
import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { pollUntilNotNull } from '@voucha/test-helpers'
import { ValkeyCache } from '@data-stores/valkey/cache'
import { cacheValkeyClient } from '@data-stores/valkey/clients'
import { stableSerialize } from '@services/entity-cache'
import { cacheAdapter, createFediverseAdapters } from './factory.mts'

function fakeAdapter(bucket: (call: number) => FediverseSearchBucket): {
  adapter: FediverseProviderAdapter
  calls: () => number
} {
  let calls = 0
  return {
    adapter: {
      provider: 'mastodon',
      search() {
        calls++
        return Promise.resolve(bucket(calls))
      },
    },
    calls: () => calls,
  }
}

describe('cacheAdapter', () => {
  it('caches an `ok` bucket and serves it on a subsequent identical search', async () => {
    const { adapter, calls } = fakeAdapter(() => ({
      provider: 'mastodon',
      status: 'ok',
      items: [],
    }))
    const wrapped = cacheAdapter(adapter)
    const options = { q: randomUUID() }

    const first = await wrapped.search(options)
    const probe = new ValkeyCache<string>({ prefix: 'fediverse-search:mastodon', ttlSeconds: 60 })
    await expect(pollUntilNotNull(() => probe.get(stableSerialize(options)))).resolves.toEqual(
      first,
    )
    const second = await wrapped.search(options)

    expect(first).toEqual(second)
    expect(calls()).toBe(1)
  })

  it('does not cache `partial` or `error` buckets, so every call re-fetches', async () => {
    const { adapter, calls } = fakeAdapter(() => ({
      provider: 'mastodon',
      status: 'error',
      items: [],
      error_code: 'provider_error',
    }))
    const wrapped = cacheAdapter(adapter)
    const options = { q: randomUUID() }

    await wrapped.search(options)
    await wrapped.search(options)

    expect(calls()).toBe(2)
  })

  it('keys the cache by search options, so different queries do not collide', async () => {
    const { adapter, calls } = fakeAdapter(() => ({
      provider: 'mastodon',
      status: 'ok',
      items: [],
    }))
    const wrapped = cacheAdapter(adapter)

    await wrapped.search({ q: randomUUID() })
    await wrapped.search({ q: randomUUID() })

    expect(calls()).toBe(2)
  })

  it('falls through to a live fetch when a cached entry fails to decode, instead of throwing', async () => {
    const { adapter, calls } = fakeAdapter(() => ({
      provider: 'mastodon',
      status: 'ok',
      items: [],
    }))
    const wrapped = cacheAdapter(adapter)
    const options = { q: randomUUID() }

    // Write malformed JSON directly at the physical key `cacheAdapter` will read,
    // bypassing its serializer, to force a real decode failure — no mocking.
    const probe = new ValkeyCache<string>({ prefix: 'fediverse-search:mastodon', ttlSeconds: 60 })
    await cacheValkeyClient.set(probe.getKey(stableSerialize(options)), 'not-json{')

    const bucket = await wrapped.search(options)

    expect(bucket).toEqual({ provider: 'mastodon', status: 'ok', items: [] })
    expect(calls()).toBe(1)
  })
})

describe('createFediverseAdapters', () => {
  it('returns an adapter for every Fediverse search provider, keyed to its own provider', () => {
    const adapters = createFediverseAdapters()

    expect(Object.keys(adapters).sort()).toEqual(['bluesky', 'lemmy', 'mastodon', 'peertube'])
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
