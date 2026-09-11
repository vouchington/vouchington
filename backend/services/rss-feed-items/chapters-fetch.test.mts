import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { UnsafeUrlError } from 'ssrf-guard/node'
import { TEST_SIDELOAD_SIGNING_KEY } from '@ts-shared/url-signing/test-key'
import { getPodcastEpisodeChaptersById, type ChaptersSafeFetch } from './chapters.mts'
import type { ReadResponseBodyOptions } from '@modules/utils/http'
import type { ViewRssFeedItem } from './types.mts'

describe('getPodcastEpisodeChaptersById', () => {
  beforeAll(() => {
    vi.stubEnv('IMAGE_ORIGIN', 'https://images.example.com/')
    vi.stubEnv('VOUCHA_SIDELOAD_SIGNING_KEYS', TEST_SIDELOAD_SIGNING_KEY)
  })

  afterAll(() => vi.unstubAllEnvs())

  it('returns [] for missing items without fetching', async () => {
    const safeFetch = vi.fn<ChaptersSafeFetch>()

    await expect(
      getPodcastEpisodeChaptersById('01970000-0000-7000-8000-000000000000', { safeFetch }),
    ).resolves.toEqual([])
    expect(safeFetch).not.toHaveBeenCalled()
  })

  it('returns [] for non-HTTPS chapter URLs without fetching', async () => {
    const safeFetch = vi.fn<ChaptersSafeFetch>()
    const item = makeItem({
      chapters_url: 'http://chapters.example.com/episode.json',
      chapters_type: 'application/json',
    })

    await expect(
      getPodcastEpisodeChaptersById(item.id, { getRssFeedItemById: async () => item, safeFetch }),
    ).resolves.toEqual([])
    expect(safeFetch).not.toHaveBeenCalled()
  })

  it('returns [] for unsupported and non-string chapter types without fetching', async () => {
    for (const chaptersType of ['text/plain', 123]) {
      const item = makeItem({
        chapters_url: 'https://chapters.example.com/episode.json',
        chapters_type: chaptersType as never,
      })
      const safeFetch = vi.fn<ChaptersSafeFetch>()

      await expect(
        getPodcastEpisodeChaptersById(item.id, { getRssFeedItemById: async () => item, safeFetch }),
      ).resolves.toEqual([])
      expect(safeFetch).not.toHaveBeenCalled()
    }
  })

  it('accepts missing chapter types for feed compatibility', async () => {
    const item = makeItem({
      chapters_url: 'https://chapters.example.com/episode.json',
      chapters_type: undefined,
    })
    const safeFetch = vi.fn<ChaptersSafeFetch>(async url => ({
      body: null,
      ok: true,
      url: String(url),
    }))

    await expect(
      getPodcastEpisodeChaptersById(item.id, {
        getRssFeedItemById: async () => item,
        safeFetch,
        readResponseBodyAsBuffer: async () => Buffer.from('[{"startTime":0,"title":"Intro"}]'),
      }),
    ).resolves.toEqual([expect.objectContaining({ title: 'Intro' })])
    expect(safeFetch).toHaveBeenCalledOnce()
  })

  it('uses safeFetch for HTTPS-only SSRF-guarded redirects and normalizes chapter JSON', async () => {
    const item = makeItem({
      chapters_url: 'https://chapters.example.com/episode.json',
      chapters_type: 'application/json+chapters',
    })
    const finalUrl = 'https://cdn.example.com/episode.json'
    const safeFetch = vi.fn<ChaptersSafeFetch>(async () => ({
      body: null,
      ok: true,
      url: finalUrl,
    }))
    const readResponseBodyAsBuffer = vi.fn<() => Promise<Buffer>>(async () =>
      Buffer.from(JSON.stringify([{ startTime: 0, title: 'Intro' }])),
    )

    const chapters = await getPodcastEpisodeChaptersById(item.id, {
      getRssFeedItemById: async () => item,
      safeFetch,
      readResponseBodyAsBuffer,
    })

    expect(chapters).toEqual([expect.objectContaining({ title: 'Intro' })])
    expect(safeFetch).toHaveBeenCalledWith(
      'https://chapters.example.com/episode.json',
      expect.objectContaining({ allowedProtocols: ['https:'], maxRedirects: 5 }),
    )
    expect(readResponseBodyAsBuffer).toHaveBeenCalledWith(
      expect.objectContaining({ url: finalUrl }),
    )
  })

  it('normalizes, sideloads, and caps chapter JSON', async () => {
    const item = makeItem({
      chapters_url: 'https://chapters.example.com/episode.json',
      chapters_type: 'application/json+chapters',
    })
    const chaptersPayload = {
      chapters: [
        { startTime: 50, title: 'B', toc: false },
        { startTime: 10, title: 'A', image: 'https://example.com/a.jpg' },
        ...Array.from({ length: 200 }, (_, index) => ({ startTime: index + 100, title: 'C' })),
      ],
    }

    const chapters = await getPodcastEpisodeChaptersById(item.id, {
      getRssFeedItemById: async () => item,
      safeFetch: async url => ({ body: null, ok: true, url: String(url) }),
      readResponseBodyAsBuffer: async () => Buffer.from(JSON.stringify(chaptersPayload)),
    })

    expect(chapters).toHaveLength(200)
    expect(chapters).toEqual([
      expect.objectContaining({
        start_seconds: 10,
        end_seconds: 50,
        title: 'A',
        image_url: expect.stringMatching(/^https?:\/\/[^/]+\/sideload\//),
        is_visible: true,
      }),
      expect.objectContaining({
        start_seconds: 50,
        end_seconds: 100,
        title: 'B',
        image_url: null,
        is_visible: false,
      }),
      ...Array.from({ length: 198 }, () => expect.any(Object)),
    ])
  })

  it('returns [] for non-2xx responses', async () => {
    const item = makeItem({ chapters_url: 'https://chapters.example.com/episode.json' })

    await expect(
      getPodcastEpisodeChaptersById(item.id, {
        getRssFeedItemById: async () => item,
        safeFetch: async () => ({ body: null, ok: false, url: item.data.chapters_url! }),
      }),
    ).resolves.toEqual([])
  })

  it('does not report SSRF rejections', async () => {
    const item = makeItem({ chapters_url: 'https://chapters.example.com/episode.json' })
    const onError = vi.fn<(error: Error) => void>()

    await expect(
      getPodcastEpisodeChaptersById(item.id, {
        getRssFeedItemById: async () => item,
        safeFetch: async () => {
          throw new UnsafeUrlError('https://localhost/chapters.json', 'hostname not allowed')
        },
        onError,
      }),
    ).resolves.toEqual([])
    expect(onError).not.toHaveBeenCalled()
  })

  it('reports invalid chapter JSON', async () => {
    const item = makeItem({ chapters_url: 'https://chapters.example.com/episode.json' })
    const onError = vi.fn<(error: Error) => void>()

    await expect(
      getPodcastEpisodeChaptersById(item.id, {
        getRssFeedItemById: async () => item,
        safeFetch: async url => ({ body: null, ok: true, url: String(url) }),
        readResponseBodyAsBuffer: async () => Buffer.from('not json'),
        onError,
      }),
    ).resolves.toEqual([])
    expect(onError).toHaveBeenCalledOnce()
    expect(onError.mock.calls[0]?.[0]).toBeInstanceOf(SyntaxError)
  })

  it('aborts the safe fetch and body reader when the chapter deadline expires', async () => {
    vi.useFakeTimers()
    const item = makeItem({ chapters_url: 'https://chapters.example.com/episode.json' })
    const safeFetch = vi.fn<ChaptersSafeFetch>(async (_url, options) => {
      await new Promise<void>((_resolve, reject) => {
        options?.signal?.addEventListener('abort', () => reject(options.signal?.reason))
      })
      return { body: null, ok: true, url: String(_url) }
    })

    try {
      const chaptersPromise = getPodcastEpisodeChaptersById(item.id, {
        getRssFeedItemById: async () => item,
        safeFetch,
      })
      await vi.advanceTimersByTimeAsync(5000)
      await expect(chaptersPromise).resolves.toEqual([])
      expect(safeFetch.mock.calls[0]?.[1]?.signal?.aborted).toBe(true)
    } finally {
      vi.useRealTimers()
    }
  })

  it('aborts the body reader and reports a chapter timeout', async () => {
    vi.useFakeTimers()
    const item = makeItem({ chapters_url: 'https://chapters.example.com/episode.json' })
    const onError = vi.fn<(error: Error) => void>()
    const readResponseBodyAsBuffer = vi.fn<(options: ReadResponseBodyOptions) => Promise<Buffer>>(
      options =>
        new Promise<Buffer>((_resolve, reject) => {
          options.signal?.addEventListener('abort', () => reject(options.signal?.reason))
        }),
    )

    try {
      const chaptersPromise = getPodcastEpisodeChaptersById(item.id, {
        getRssFeedItemById: async () => item,
        safeFetch: async url => ({ body: null, ok: true, url: String(url) }),
        readResponseBodyAsBuffer,
        onError,
      })
      await vi.advanceTimersByTimeAsync(5000)

      await expect(chaptersPromise).resolves.toEqual([])
      expect(readResponseBodyAsBuffer.mock.calls[0]?.[0].signal?.aborted).toBe(true)
      expect(onError).toHaveBeenCalledOnce()
    } finally {
      vi.useRealTimers()
    }
  })
})

function makeItem(overrides: Partial<ViewRssFeedItem['data']>): ViewRssFeedItem {
  return {
    __entity_type: 'rss_feed_item',
    id: '01970000-0000-7000-8000-000000000001',
    guid: 'guid-1',
    published_at: new Date(),
    data: { link: 'https://example.com/episode', guid: 'guid-1', title: 'Episode', ...overrides },
    url: { id: 'url-1', url: 'https://example.com/episode' } as ViewRssFeedItem['url'],
    rss_feed: {
      __entity_type: 'rss_feed',
      id: 'feed-1',
      title: 'Test Feed',
      is_enabled: true,
      is_discoverable: true,
      etag: null,
      last_modified_at: null,
      last_fetched_at: null,
      feed_type: 'podcast',
      rss_feed_url: {
        id: 'url-feed-1',
        url: 'https://example.com/feed.xml',
      } as ViewRssFeedItem['rss_feed']['rss_feed_url'],
      home_page_url: null,
      hostname: null,
      topic: {} as ViewRssFeedItem['rss_feed']['topic'],
      publisher_type: null,
    } as ViewRssFeedItem['rss_feed'],
    categories: [],
  }
}
