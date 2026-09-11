import { afterEach, describe, expect, it, vi } from 'vitest'
import { FEDIVERSE_SEARCH_DEADLINE_MS } from '@voucha/config'
import {
  buildUnavailableFediverseSearchResponse,
  parseFediverseProviders,
  parseFediverseResultType,
  searchFediverse,
} from './search.mts'
import type { FediverseProviderAdapter } from './types.mts'

describe('searchFediverse', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('resolves with an error bucket when a provider does not settle before the search deadline', async () => {
    vi.useFakeTimers()
    const neverSettles: FediverseProviderAdapter = {
      provider: 'peertube',
      async search() {
        return new Promise(() => {})
      },
    }

    const resultPromise = searchFediverse(
      { q: 'peer tube', providers: ['peertube'] },
      { peertube: neverSettles },
    )

    await vi.advanceTimersByTimeAsync(FEDIVERSE_SEARCH_DEADLINE_MS)

    await expect(resultPromise).resolves.toEqual({
      buckets: [{ provider: 'peertube', status: 'error', items: [], error_code: 'provider_error' }],
    })
  })

  it('clears the deadline timer once a provider settles before the deadline', async () => {
    vi.useFakeTimers()
    const fastAdapter: FediverseProviderAdapter = {
      provider: 'peertube',
      async search() {
        return { provider: 'peertube', status: 'ok', items: [] }
      },
    }

    await searchFediverse({ q: 'peer tube', providers: ['peertube'] }, { peertube: fastAdapter })

    expect(vi.getTimerCount()).toBe(0)
  })

  it('returns provider buckets and trims item count per provider', async () => {
    const adapter: FediverseProviderAdapter = {
      provider: 'peertube',
      async search(options) {
        return {
          provider: 'peertube',
          status: 'ok',
          items: Array.from({ length: 3 }, (_, index) => ({
            provider: 'peertube',
            result_type: 'video',
            source_hostname: 'video.example',
            external_url: `https://video.example/watch/${index}`,
            title: `Video ${index}`,
            summary: '',
            author_name: null,
            author_url: null,
            published_at: null,
          })),
          next_cursor: options.cursor ?? null,
        }
      },
    }

    const result = await searchFediverse(
      { q: 'peer tube', providers: ['peertube'], limit: 2, cursor: 'cursor-1' },
      { peertube: adapter },
    )

    expect(result.buckets).toHaveLength(1)
    expect(result.buckets[0]).toMatchObject({
      provider: 'peertube',
      status: 'ok',
      next_cursor: 'cursor-1',
    })
    expect(result.buckets[0]!.items).toHaveLength(2)
  })

  it('isolates provider failures into error buckets', async () => {
    const failingAdapter: FediverseProviderAdapter = {
      provider: 'mastodon',
      async search() {
        throw new Error('provider offline')
      },
    }

    const result = await searchFediverse(
      { q: 'social', providers: ['peertube', 'mastodon'], limit: 5 },
      { mastodon: failingAdapter },
    )

    expect(result.buckets).toEqual([
      { provider: 'peertube', status: 'ok', items: [] },
      { provider: 'mastodon', status: 'error', items: [], error_code: 'provider_error' },
    ])
  })

  it('normalizes non-finite service limits to the default', async () => {
    const adapter: FediverseProviderAdapter = {
      provider: 'peertube',
      async search(options) {
        expect(options.limit).toBe(10)
        return {
          provider: 'peertube',
          status: 'ok',
          items: Array.from({ length: options.limit ?? 0 }, (_, index) => ({
            provider: 'peertube',
            result_type: 'video',
            source_hostname: 'video.example',
            external_url: `https://video.example/watch/${index}`,
            title: `Video ${index}`,
            summary: '',
            author_name: null,
            author_url: null,
            published_at: null,
          })),
        }
      },
    }

    const result = await searchFediverse(
      { q: 'peer tube', providers: ['peertube'], limit: Number.NaN },
      { peertube: adapter },
    )

    expect(result.buckets[0]!.items).toHaveLength(10)
  })

  it('returns no buckets for empty or one-character queries', async () => {
    await expect(searchFediverse({ q: 'x' })).resolves.toEqual({ buckets: [] })
    await expect(searchFediverse({ q: '   ' })).resolves.toEqual({ buckets: [] })
  })

  it('includes lemmy in the default provider set', async () => {
    const result = await searchFediverse({ q: 'lemmy world' })
    expect(result.buckets.map(bucket => bucket.provider)).toEqual([
      'peertube',
      'mastodon',
      'lemmy',
      'bluesky',
    ])
  })

  it('builds unavailable buckets with the same requested and default provider selection', () => {
    expect(
      buildUnavailableFediverseSearchResponse({ q: 'social', providers: ['lemmy', 'mastodon'] }),
    ).toEqual({
      buckets: [
        { provider: 'lemmy', status: 'error', items: [], error_code: 'provider_error' },
        { provider: 'mastodon', status: 'error', items: [], error_code: 'provider_error' },
      ],
    })
    expect(
      buildUnavailableFediverseSearchResponse({ q: 'social' }).buckets.map(
        bucket => bucket.provider,
      ),
    ).toEqual(['peertube', 'mastodon', 'lemmy', 'bluesky'])
  })

  it('builds no unavailable buckets for a short query', () => {
    expect(buildUnavailableFediverseSearchResponse({ q: ' x ' })).toEqual({ buckets: [] })
  })

  it('forwards the incoming cursor only when a single provider is requested', async () => {
    const receivedCursors: Record<string, string | undefined> = {}
    function cursorSpyAdapter(provider: 'peertube' | 'mastodon'): FediverseProviderAdapter {
      return {
        provider,
        async search(options) {
          receivedCursors[provider] = options.cursor
          return { provider, status: 'ok', items: [] }
        },
      }
    }

    await searchFediverse(
      { q: 'social', providers: ['peertube', 'mastodon'], cursor: 'incoming-cursor' },
      { peertube: cursorSpyAdapter('peertube'), mastodon: cursorSpyAdapter('mastodon') },
    )
    expect(receivedCursors).toEqual({ peertube: undefined, mastodon: undefined })

    await searchFediverse(
      { q: 'social', providers: ['peertube'], cursor: 'incoming-cursor' },
      { peertube: cursorSpyAdapter('peertube') },
    )
    expect(receivedCursors.peertube).toBe('incoming-cursor')
  })
})

describe('parseFediverseProviders', () => {
  it('parses comma-separated providers and dedupes them', () => {
    expect(parseFediverseProviders('peertube,mastodon,peertube')).toEqual(['peertube', 'mastodon'])
  })

  it('rejects unsupported providers', () => {
    expect(() => parseFediverseProviders('activitypub')).toThrow('Unsupported Fediverse provider')
  })
})

describe('parseFediverseResultType', () => {
  it('parses supported result types', () => {
    expect(parseFediverseResultType('video')).toBe('video')
  })

  it('rejects unsupported result types', () => {
    expect(() => parseFediverseResultType('review')).toThrow('Unsupported Fediverse result type')
  })
})
