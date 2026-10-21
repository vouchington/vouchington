import { describe, expect, it, vi } from 'vitest'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { kagiSmallWebImportConfig } from './import-config.mts'
import { FEED_LIST_SOURCES } from './sources.mts'
import { forgetFeedListValidators } from './fetch-feed-list.mts'
import { dispatchKagiSmallWeb } from './sync.mts'

const fetchSpy = vi.hoisted(() => vi.fn<VitestLooseMock>())
// The Small Web lists live on GitHub; only the HTTP boundary is replaced.
vi.mock<typeof import('undici')>(import('undici'), async () => {
  const actual = await vi.importActual<typeof import('undici')>('undici')
  return { ...actual, fetch: fetchSpy }
})

const randomSuffix = () => Math.random().toString(36).slice(2, 10)
const [WEB, COMIC, YOUTUBE] = FEED_LIST_SOURCES.map(source => source.url)

/** Buffering the list calls one of these. Streaming the body does not. */
function unbufferedResponse(body: string): Response {
  const response = new Response(body)
  const rejectBuffered = (kind: string) => () => {
    throw new Error(`feed list buffered as ${kind}`)
  }
  Object.defineProperty(response, 'text', { value: rejectBuffered('text') })
  Object.defineProperty(response, 'arrayBuffer', { value: rejectBuffered('array') })
  Object.defineProperty(response, 'json', { value: rejectBuffered('json') })
  return response
}

describe('dispatchKagiSmallWeb with the import enabled', () => {
  it('downloads every list once and resumes later pages from that file', async () => {
    overrideDynamicConfigFieldsForTest(kagiSmallWebImportConfig, {
      enabled: true,
      candidate_batch_size: 1,
    })
    const suffix = randomSuffix()
    const feedUrl = (letter: string) => `https://kagi-sync-${suffix}-${letter}.example.com/feed.xml`
    const lists = new Map([
      [WEB, `${feedUrl('a')}\n${feedUrl('b')}`],
      [COMIC, feedUrl('c')],
      [
        YOUTUBE,
        `https://www.youtube.com/feeds/videos.xml?channel_id=UCkagisync${suffix} # Kagi Sync ${suffix}`,
      ],
    ])
    fetchSpy.mockReset()
    fetchSpy.mockImplementation(async (url: string) => unbufferedResponse(lists.get(url) ?? ''))

    const first = await dispatchKagiSmallWeb()
    expect(first).toMatchObject({ enqueued: 1, hasMore: true, total: 4 })
    expect(fetchSpy).toHaveBeenCalledTimes(3)

    let cursor = first.nextCursor
    let pages = 0
    while (cursor !== undefined && pages < 5) {
      const resumed = await dispatchKagiSmallWeb(cursor)
      expect(fetchSpy).toHaveBeenCalledTimes(3)
      cursor = resumed.nextCursor
      pages += 1
    }
    expect(pages).toBe(3)
  })

  it('reports a failed list and carries on with the others', async () => {
    overrideDynamicConfigFieldsForTest(kagiSmallWebImportConfig, { enabled: true })
    const suffix = randomSuffix()
    fetchSpy.mockReset()
    fetchSpy.mockImplementation(async (url: string) => {
      if (url === WEB) throw new Error('list unavailable')
      if (url === COMIC) throw new Error('network error')
      return new Response(
        `https://www.youtube.com/feeds/videos.xml?channel_id=UCkagifail${suffix} # Kagi Fail ${suffix}`,
      )
    })

    const result = await dispatchKagiSmallWeb()

    expect(result).toMatchObject({ enqueued: 1, total: 1 })
  })
})

describe('dispatchKagiSmallWeb page retries', () => {
  const suffix = randomSuffix()
  const feedUrl = (letter: string) => `https://kagi-retry-${suffix}-${letter}.example.com/feed.xml`

  it('retries a continuation whole when any list fails instead of skipping its entries', async () => {
    overrideDynamicConfigFieldsForTest(kagiSmallWebImportConfig, { enabled: true })
    fetchSpy.mockReset()
    fetchSpy.mockImplementation(async (url: string) => {
      if (url === WEB) throw new Error('list unavailable')
      return new Response(feedUrl('z'))
    })
    await expect(dispatchKagiSmallWeb(feedUrl('a'))).rejects.toThrow('list unavailable')

    fetchSpy.mockImplementation(async (url: string) =>
      url === COMIC ? new Response(null, { status: 500 }) : new Response(feedUrl('z')),
    )
    await expect(dispatchKagiSmallWeb(feedUrl('a'))).rejects.toThrow('Failed to fetch')
  })

  it('retries the first page whole when a list fails and more pages follow', async () => {
    overrideDynamicConfigFieldsForTest(kagiSmallWebImportConfig, {
      enabled: true,
      candidate_batch_size: 1,
    })
    fetchSpy.mockReset()
    fetchSpy.mockImplementation(async (url: string) => {
      if (url === WEB) throw new Error('list unavailable')
      return new Response(`${feedUrl('b')}\n${feedUrl('c')}`)
    })

    await expect(dispatchKagiSmallWeb()).rejects.toThrow('more pages follow')
  })

  it('forgets the cached validators when a continuation fails, so the next root reads the lists', async () => {
    overrideDynamicConfigFieldsForTest(kagiSmallWebImportConfig, { enabled: true })
    await forgetFeedListValidators(FEED_LIST_SOURCES.map(source => source.name))
    fetchSpy.mockReset()
    fetchSpy.mockImplementation(async () => new Response('', { headers: { ETag: `"${suffix}"` } }))
    await dispatchKagiSmallWeb()

    fetchSpy.mockImplementation(async (url: string) => {
      if (url === WEB) throw new Error('list unavailable')
      return new Response('')
    })
    await expect(dispatchKagiSmallWeb(feedUrl('a'))).rejects.toThrow('list unavailable')

    const conditionalHeaders: (string | undefined)[] = []
    fetchSpy.mockImplementation(async (_url: string, init: { headers: Record<string, string> }) => {
      conditionalHeaders.push(init.headers['If-None-Match'])
      return new Response('')
    })
    await dispatchKagiSmallWeb()
    expect(conditionalHeaders).toHaveLength(FEED_LIST_SOURCES.length)
    expect(conditionalHeaders.every(header => header === undefined)).toBe(true)
  })

  it('treats an error status on the first page like a failed list, not an unchanged one', async () => {
    overrideDynamicConfigFieldsForTest(kagiSmallWebImportConfig, {
      enabled: true,
      candidate_batch_size: 1,
    })
    fetchSpy.mockReset()
    fetchSpy.mockImplementation(async (url: string) =>
      url === COMIC
        ? new Response(null, { status: 500 })
        : new Response(`${feedUrl('f')}\n${feedUrl('g')}`),
    )

    await expect(dispatchKagiSmallWeb()).rejects.toThrow('more pages follow')
  })

  it('reads the lists again until the caller commits validators after continuation admission', async () => {
    overrideDynamicConfigFieldsForTest(kagiSmallWebImportConfig, {
      enabled: true,
      candidate_batch_size: 1,
    })
    const names = FEED_LIST_SOURCES.map(source => source.name)
    await forgetFeedListValidators(names)
    fetchSpy.mockReset()
    fetchSpy.mockImplementation(async (url: string, init: { headers: Record<string, string> }) =>
      init.headers['If-None-Match']
        ? new Response(null, { status: 304 })
        : new Response(url === WEB ? `${feedUrl('d')}\n${feedUrl('e')}` : '', {
            headers: { ETag: `"${url}"` },
          }),
    )
    const first = await dispatchKagiSmallWeb()
    expect(first).toMatchObject({ hasMore: true, nextCursor: feedUrl('d'), total: 2 })
    fetchSpy.mockClear()

    const retried = await dispatchKagiSmallWeb()

    expect(retried).toMatchObject({ hasMore: true, total: 2 })
    for (const call of fetchSpy.mock.calls) {
      expect(call[1].headers).not.toHaveProperty('If-None-Match')
    }
    await retried.commitValidators!()
    fetchSpy.mockClear()
    expect(await dispatchKagiSmallWeb()).toMatchObject({ skipped: true, total: 0 })
    for (const call of fetchSpy.mock.calls) {
      expect(call[1].headers).toHaveProperty('If-None-Match')
    }
    await forgetFeedListValidators(names)
    let cursor = retried.nextCursor
    while (cursor !== undefined) {
      const page = await dispatchKagiSmallWeb(cursor)
      cursor = page.nextCursor
    }
  })
})
