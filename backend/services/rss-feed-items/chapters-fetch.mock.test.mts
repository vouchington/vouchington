import { createHash, randomUUID } from 'node:crypto'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const { mockSafeFetch } = vi.hoisted(() => ({ mockSafeFetch: vi.fn<VitestLooseMock>() }))

vi.mock<typeof import('ssrf-guard/node')>(import('ssrf-guard/node'), async importOriginal => ({
  ...(await importOriginal<typeof import('ssrf-guard/node')>()),
  safeFetch: mockSafeFetch,
}))

import { UnsafeUrlError } from 'ssrf-guard/node'
import { TEST_SIDELOAD_SIGNING_KEY } from '@ts-shared/url-signing/test-key'
import { createTestUrlWithHostname, insertTestRssFeedItem } from '@voucha/test-helpers'
import { createTestRssFeed } from '@voucha/test-helpers/rss-feed-create'
import { sentryCaptureExceptionMock } from '../../test-helpers/vitest.setup.sentry-mock.mts'
import { getPodcastEpisodeChaptersById } from './chapters.mts'

const CHAPTERS_URL = 'https://chapters.example.com/episode.json'

let feedId: string
let urlId: string

async function makeItem(itemOverrides: Record<string, unknown>): Promise<string> {
  const random = randomUUID()
  const itemData = {
    link: 'https://example.com/episode',
    guid: random,
    title: 'Episode',
    ...itemOverrides,
  }
  return insertTestRssFeedItem({
    rssFeedId: feedId,
    urlId,
    guid: `chapters-fetch-${random}`,
    itemData,
    contentSha256: createHash('sha256').update(JSON.stringify(itemData)).digest(),
  })
}

function jsonResponse(body: unknown, url = CHAPTERS_URL): Response {
  return withUrl(new Response(JSON.stringify(body)), url)
}

function withUrl(response: Response, url: string): Response {
  Object.defineProperty(response, 'url', { value: url })
  return response
}

function capturedErrors(): Error[] {
  return sentryCaptureExceptionMock.mock.calls.map(([captured]) => captured as Error)
}

describe('getPodcastEpisodeChaptersById', () => {
  beforeAll(async () => {
    vi.stubEnv('IMAGE_ORIGIN', 'https://images.example.com/')
    vi.stubEnv('VOUCHA_SIDELOAD_SIGNING_KEYS', TEST_SIDELOAD_SIGNING_KEY)
    feedId = (await createTestRssFeed({})).id
    urlId = await createTestUrlWithHostname()
  })

  beforeEach(() => {
    mockSafeFetch.mockReset()
  })

  afterAll(() => {
    vi.unstubAllEnvs()
  })

  it('returns [] for missing items without fetching', async () => {
    await expect(getPodcastEpisodeChaptersById(randomUUID())).resolves.toEqual([])
    expect(mockSafeFetch).not.toHaveBeenCalled()
  })

  it('returns [] for non-HTTPS chapter URLs without fetching', async () => {
    const itemId = await makeItem({
      chapters_url: 'http://chapters.example.com/episode.json',
      chapters_type: 'application/json',
    })

    await expect(getPodcastEpisodeChaptersById(itemId)).resolves.toEqual([])
    expect(mockSafeFetch).not.toHaveBeenCalled()
  })

  it('returns [] for unsupported and non-string chapter types without fetching', async () => {
    for (const chaptersType of ['text/plain', 123]) {
      const itemId = await makeItem({ chapters_url: CHAPTERS_URL, chapters_type: chaptersType })

      await expect(getPodcastEpisodeChaptersById(itemId)).resolves.toEqual([])
    }
    expect(mockSafeFetch).not.toHaveBeenCalled()
  })

  it('accepts missing chapter types for feed compatibility', async () => {
    const itemId = await makeItem({ chapters_url: CHAPTERS_URL })
    mockSafeFetch.mockResolvedValue(jsonResponse([{ startTime: 0, title: 'Intro' }]))

    await expect(getPodcastEpisodeChaptersById(itemId)).resolves.toEqual([
      expect.objectContaining({ title: 'Intro' }),
    ])
    expect(mockSafeFetch).toHaveBeenCalledOnce()
  })

  it('uses safeFetch for HTTPS-only SSRF-guarded redirects and normalizes chapter JSON', async () => {
    const itemId = await makeItem({
      chapters_url: CHAPTERS_URL,
      chapters_type: 'application/json+chapters',
    })
    mockSafeFetch.mockResolvedValue(
      jsonResponse([{ startTime: 0, title: 'Intro' }], 'https://cdn.example.com/episode.json'),
    )

    const chapters = await getPodcastEpisodeChaptersById(itemId)

    expect(chapters).toEqual([expect.objectContaining({ title: 'Intro' })])
    expect(mockSafeFetch).toHaveBeenCalledExactlyOnceWith(
      CHAPTERS_URL,
      expect.objectContaining({
        headers: { Accept: 'application/json, application/*+json;q=0.9, */*;q=0.1' },
        allowedProtocols: ['https:'],
        maxRedirects: 5,
      }),
    )
  })

  it('normalizes, sideloads, and caps chapter JSON', async () => {
    const itemId = await makeItem({
      chapters_url: CHAPTERS_URL,
      chapters_type: 'application/json+chapters',
    })
    mockSafeFetch.mockResolvedValue(
      jsonResponse({
        chapters: [
          { startTime: 50, title: 'B', toc: false },
          { startTime: 10, title: 'A', image: 'https://example.com/a.jpg' },
          ...Array.from({ length: 200 }, (_, index) => ({ startTime: index + 100, title: 'C' })),
        ],
      }),
    )

    const chapters = await getPodcastEpisodeChaptersById(itemId)

    expect(chapters).toHaveLength(200)
    expect(chapters.slice(0, 2)).toEqual([
      expect.objectContaining({
        start_seconds: 10,
        end_seconds: 50,
        title: 'A',
        image_url: expect.stringMatching(/^https:\/\/images\.example\.com\/sideload\//),
        is_visible: true,
      }),
      expect.objectContaining({
        start_seconds: 50,
        end_seconds: 100,
        title: 'B',
        image_url: null,
        is_visible: false,
      }),
    ])
  })

  it('returns [] and cancels the body for non-2xx responses', async () => {
    const itemId = await makeItem({ chapters_url: CHAPTERS_URL })
    let cancelled = false
    const body = new ReadableStream<Uint8Array>({
      cancel() {
        cancelled = true
      },
    })
    mockSafeFetch.mockResolvedValue(withUrl(new Response(body, { status: 503 }), CHAPTERS_URL))

    await expect(getPodcastEpisodeChaptersById(itemId)).resolves.toEqual([])
    expect(cancelled).toBe(true)
  })

  it('returns [] without reading a body above the 256 KiB chapter limit', async () => {
    const itemId = await makeItem({ chapters_url: CHAPTERS_URL })
    const padding = 'x'.repeat(256 * 1024)
    mockSafeFetch.mockResolvedValue(jsonResponse([{ startTime: 0, title: padding }]))

    await expect(getPodcastEpisodeChaptersById(itemId)).resolves.toEqual([])
    expect(capturedErrors()).toEqual([])
  })

  it('does not report SSRF rejections', async () => {
    const itemId = await makeItem({ chapters_url: CHAPTERS_URL })
    mockSafeFetch.mockRejectedValue(
      new UnsafeUrlError('https://localhost/chapters.json', 'hostname not allowed'),
    )

    await expect(getPodcastEpisodeChaptersById(itemId)).resolves.toEqual([])
    expect(capturedErrors()).toEqual([])
  })

  it('reports invalid chapter JSON', async () => {
    const itemId = await makeItem({ chapters_url: CHAPTERS_URL })
    mockSafeFetch.mockResolvedValue(withUrl(new Response('not json'), CHAPTERS_URL))

    await expect(getPodcastEpisodeChaptersById(itemId)).resolves.toEqual([])
    const errors = capturedErrors()
    expect(errors).toHaveLength(1)
    expect(errors[0]).toBeInstanceOf(SyntaxError)
  })

  it('aborts the safe fetch when the chapter deadline expires', async () => {
    const itemId = await makeItem({ chapters_url: CHAPTERS_URL })
    const fetchStarted = Promise.withResolvers<AbortSignal>()
    mockSafeFetch.mockImplementation(
      (_url: string, options: { signal: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          fetchStarted.resolve(options.signal)
          // oxlint-disable-next-line typescript/prefer-promise-reject-errors -- AbortSignal.reason is an arbitrary value owned by the signal.
          options.signal.addEventListener('abort', () => reject(options.signal.reason))
        }),
    )
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })

    try {
      const chaptersPromise = getPodcastEpisodeChaptersById(itemId)
      const signal = await fetchStarted.promise
      await vi.advanceTimersByTimeAsync(5000)

      await expect(chaptersPromise).resolves.toEqual([])
      expect(signal.aborted).toBe(true)
      expect(capturedErrors().map(error => error.message)).toEqual([
        `Chapter fetch timed out for ${CHAPTERS_URL}`,
      ])
    } finally {
      vi.useRealTimers()
    }
  })

  it('aborts the body reader and reports a chapter timeout', async () => {
    const itemId = await makeItem({ chapters_url: CHAPTERS_URL })
    const fetched = Promise.withResolvers<void>()
    mockSafeFetch.mockImplementation(() => {
      fetched.resolve()
      return Promise.resolve(withUrl(new Response(new ReadableStream<Uint8Array>()), CHAPTERS_URL))
    })
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })

    try {
      const chaptersPromise = getPodcastEpisodeChaptersById(itemId)
      await fetched.promise
      await vi.advanceTimersByTimeAsync(5000)

      await expect(chaptersPromise).resolves.toEqual([])
      expect(capturedErrors().map(error => error.message)).toEqual([
        `Chapter fetch timed out for ${CHAPTERS_URL}`,
      ])
    } finally {
      vi.useRealTimers()
    }
  })
})
