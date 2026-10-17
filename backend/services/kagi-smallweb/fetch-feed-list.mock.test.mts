import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fetchFeedList } from './fetch-feed-list.mts'
import { getExternalRequestDispatcher } from '@modules/utils/http-dispatchers'

const fetchSpy = vi.hoisted(() => vi.fn<VitestLooseMock>())
vi.mock<typeof import('undici')>(import('undici'), async () => {
  const actual = await vi.importActual<typeof import('undici')>('undici')
  return { ...actual, fetch: fetchSpy }
})

const LIST_URL = 'https://example.com/smallweb.txt'

async function readAndCommit(name: string, options?: { conditional?: boolean }) {
  const read = await fetchFeedList(name, LIST_URL, options)
  await read?.commitValidators()
}

describe('fetchFeedList caching behavior', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    fetchSpy.mockReset()
  })

  it('returns text content on 200 response', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response('https://a.com/feed\nhttps://b.com/feed', {
        status: 200,
        headers: { ETag: 'W/"abc"' },
      }),
    )

    const result = await fetchFeedList('test-web', 'https://example.com/smallweb.txt')
    expect(result?.text).toBe('https://a.com/feed\nhttps://b.com/feed')
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://example.com/smallweb.txt',
      expect.objectContaining({
        dispatcher: getExternalRequestDispatcher(),
      }),
    )
  })

  it('returns null on 304 Not Modified (content unchanged)', async () => {
    fetchSpy.mockResolvedValueOnce(new Response(null, { status: 304 }))

    const result = await fetchFeedList('test-304', 'https://example.com/smallweb.txt')
    expect(result).toBeNull()
  })

  it('throws on a non-ok response so it is not mistaken for "not modified"', async () => {
    fetchSpy.mockResolvedValueOnce(new Response(null, { status: 500 }))

    await expect(fetchFeedList('test-fail', 'https://example.com/smallweb.txt')).rejects.toThrow(
      'Failed to fetch test-fail: 500',
    )
  })

  it('throws on network error', async () => {
    fetchSpy.mockRejectedValueOnce(new Error('network error'))

    await expect(fetchFeedList('test-error', 'https://example.com/smallweb.txt')).rejects.toThrow(
      'network error',
    )
  })

  it('rejects oversized feed lists', async () => {
    const oversizedFeedList = 'x'.repeat(10 * 1024 * 1024 + 1)
    fetchSpy.mockResolvedValueOnce(new Response(oversizedFeedList, { status: 200 }))

    await expect(
      fetchFeedList('test-oversized', 'https://example.com/smallweb.txt'),
    ).rejects.toThrow('Response size exceeded limit')
  })

  it('asks for "not modified" only when the request is conditional', async () => {
    const name = `test-conditional-${crypto.randomUUID()}`
    fetchSpy.mockImplementation(async () => new Response('x', { headers: { ETag: 'W/"abc"' } }))
    await readAndCommit(name)

    await readAndCommit(name)
    await readAndCommit(name, { conditional: false })

    const sentHeaders = fetchSpy.mock.calls.map(call => call[1].headers)
    expect(sentHeaders[0]).not.toHaveProperty('If-None-Match')
    expect(sentHeaders[1]).toHaveProperty('If-None-Match', 'W/"abc"')
    expect(sentHeaders[2]).not.toHaveProperty('If-None-Match')
  })

  it('caches validators only when the caller commits them', async () => {
    const name = `test-uncommitted-${crypto.randomUUID()}`
    fetchSpy.mockImplementation(async () => new Response('x', { headers: { ETag: 'W/"abc"' } }))
    await fetchFeedList(name, LIST_URL)

    await readAndCommit(name)

    expect(fetchSpy.mock.calls[1]![1].headers).not.toHaveProperty('If-None-Match')
  })

  it('keeps the validator from the conditional read when an unconditional read sees a changed list', async () => {
    const name = `test-continuation-${crypto.randomUUID()}`
    fetchSpy.mockResolvedValueOnce(new Response('a', { headers: { ETag: 'W/"root"' } }))
    await readAndCommit(name)
    fetchSpy.mockResolvedValueOnce(new Response('a\nb', { headers: { ETag: 'W/"changed"' } }))
    await readAndCommit(name, { conditional: false })
    fetchSpy.mockResolvedValueOnce(new Response('a\nb', { headers: { ETag: 'W/"changed"' } }))

    await readAndCommit(name)

    expect(fetchSpy.mock.calls[2]![1].headers).toHaveProperty('If-None-Match', 'W/"root"')
  })

  it('returns an empty string for successful responses without a body', async () => {
    fetchSpy.mockResolvedValueOnce(new Response(null, { status: 200 }))

    const result = await fetchFeedList('test-empty', 'https://example.com/smallweb.txt')

    expect(result?.text).toBe('')
  })
})
