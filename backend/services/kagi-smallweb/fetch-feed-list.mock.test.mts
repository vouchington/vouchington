import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fetchFeedList } from './fetch-feed-list.mts'
import { getExternalRequestDispatcher } from '@modules/utils/http-dispatchers'

const fetchSpy = vi.hoisted(() => vi.fn<VitestLooseMock>())
vi.mock<typeof import('undici')>(import('undici'), async () => {
  const actual = await vi.importActual<typeof import('undici')>('undici')
  return { ...actual, fetch: fetchSpy }
})

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
    expect(result).toBe('https://a.com/feed\nhttps://b.com/feed')
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

  it('returns null on non-ok response', async () => {
    fetchSpy.mockResolvedValueOnce(new Response(null, { status: 500 }))

    const result = await fetchFeedList('test-fail', 'https://example.com/smallweb.txt')
    expect(result).toBeNull()
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

  it('returns an empty string for successful responses without a body', async () => {
    fetchSpy.mockResolvedValueOnce(new Response(null, { status: 200 }))

    const result = await fetchFeedList('test-empty', 'https://example.com/smallweb.txt')

    expect(result).toBe('')
  })
})
