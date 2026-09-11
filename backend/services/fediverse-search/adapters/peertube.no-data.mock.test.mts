import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createPeerTubeAdapter } from './peertube.mts'
import { decodeFediverseCursor, encodeFediverseCursor } from '../cursor.mts'
import { getExternalRequestDispatcher } from '@modules/utils/http-dispatchers'

const fetchSpy = vi.hoisted(() => vi.fn<VitestLooseMock>())
vi.mock<typeof import('undici')>(import('undici'), async () => {
  const actual = await vi.importActual<typeof import('undici')>('undici')
  return { ...actual, fetch: fetchSpy }
})

const HOST = 'peertube.example'

const VIDEO = {
  uuid: 'abc-123',
  name: 'My Video',
  url: 'https://peertube.example/videos/watch/abc-123',
  account: { name: 'creator', host: 'peertube.example' },
}

const CHANNEL = {
  name: 'chan',
  host: 'peertube.example',
  url: 'https://peertube.example/video-channels/chan',
}

function requestedUrl(callIndex = 0): URL {
  const requestUrl = fetchSpy.mock.calls[callIndex]?.[0]
  return requestUrl instanceof URL ? requestUrl : new URL(String(requestUrl))
}

describe('createPeerTubeAdapter', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    fetchSpy.mockReset()
  })

  it('searches videos for type "video" and maps to video items', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ total: 1, data: [VIDEO] }), { status: 200 }),
    )

    const adapter = createPeerTubeAdapter(HOST)
    const bucket = await adapter.search({ q: 'test', type: 'video', limit: 10 })

    expect(bucket).toEqual({ provider: 'peertube', status: 'ok', items: expect.any(Array) })
    expect(bucket.items).toHaveLength(1)
    expect(bucket.items[0]!.result_type).toBe('video')
    expect(requestedUrl().pathname).toBe('/api/v1/search/videos')
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ dispatcher: getExternalRequestDispatcher() }),
    )
  })

  it('searches channels for type "profile" and maps to profile items', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ total: 1, data: [CHANNEL] }), { status: 200 }),
    )

    const adapter = createPeerTubeAdapter(HOST)
    const bucket = await adapter.search({ q: 'test', type: 'profile', limit: 10 })

    expect(bucket.items).toHaveLength(1)
    expect(bucket.items[0]!.result_type).toBe('profile')
    expect(requestedUrl().pathname).toBe('/api/v1/search/video-channels')
  })

  it('returns an empty ok bucket with zero fetch calls for type "post"', async () => {
    const adapter = createPeerTubeAdapter(HOST)
    const bucket = await adapter.search({ q: 'test', type: 'post', limit: 10 })

    expect(bucket).toEqual({ provider: 'peertube', status: 'ok', items: [] })
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('returns an empty ok bucket with zero fetch calls for type "instance"', async () => {
    const adapter = createPeerTubeAdapter(HOST)
    const bucket = await adapter.search({ q: 'test', type: 'instance', limit: 10 })

    expect(bucket).toEqual({ provider: 'peertube', status: 'ok', items: [] })
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('combines videos and channels for the default (all) type', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ total: 1, data: [VIDEO] }), { status: 200 }),
    )
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ total: 1, data: [CHANNEL] }), { status: 200 }),
    )

    const adapter = createPeerTubeAdapter(HOST)
    const bucket = await adapter.search({ q: 'test', limit: 10 })

    expect(bucket).toEqual({ provider: 'peertube', status: 'ok', items: expect.any(Array) })
    expect(bucket.items).toHaveLength(2)
    expect(fetchSpy).toHaveBeenCalledTimes(2)
  })

  it("returns a partial bucket combining the successful side's items when one sub-search rejects, for the default (all) type", async () => {
    fetchSpy.mockRejectedValueOnce(new Error('videos unreachable'))
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ total: 1, data: [CHANNEL] }), { status: 200 }),
    )

    const adapter = createPeerTubeAdapter(HOST)
    const bucket = await adapter.search({ q: 'test', limit: 10 })

    expect(bucket.status).toBe('partial')
    expect(bucket.error_code).toBe('provider_error')
    expect(bucket.items).toHaveLength(1)
    expect(bucket.items[0]!.result_type).toBe('profile')
  })

  it('returns an error bucket with zero items when both sub-searches reject, for the default (all) type', async () => {
    fetchSpy.mockRejectedValueOnce(new Error('videos unreachable'))
    fetchSpy.mockRejectedValueOnce(new Error('channels unreachable'))

    const adapter = createPeerTubeAdapter(HOST)
    const bucket = await adapter.search({ q: 'test', limit: 10 })

    expect(bucket).toEqual({
      provider: 'peertube',
      status: 'error',
      items: [],
      error_code: 'provider_error',
    })
  })

  it('forwards each sub-search its own combined-cursor start offset and does not advance the sliced-off sub-search offset, for the default (all) type', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ total: 5, data: [VIDEO, VIDEO] }), { status: 200 }),
    )
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ total: 1, data: [] }), { status: 200 }),
    )

    const adapter = createPeerTubeAdapter(HOST)
    const bucket = await adapter.search({ q: 'test', limit: 2 })

    expect(requestedUrl(0).searchParams.get('start')).toBe('0')
    expect(requestedUrl(1).searchParams.get('start')).toBe('0')
    expect(bucket.next_cursor).toBeDefined()

    const decoded = decodeFediverseCursor(bucket.next_cursor ?? undefined, 'peertube')
    expect(decoded).toBeDefined()
    const parsed = JSON.parse(decoded ?? '{}') as { v?: number; c?: number }
    // Videos alone filled the page, so the channels items were sliced off —
    // the channels start offset must not advance past what was actually shown.
    expect(parsed.v).toBe(2)
    expect(parsed.c).toBe(0)

    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ total: 5, data: [VIDEO] }), { status: 200 }),
    )
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ total: 1, data: [] }), { status: 200 }),
    )
    await adapter.search({ q: 'test', limit: 2, cursor: bucket.next_cursor ?? undefined })
    expect(requestedUrl(2).searchParams.get('start')).toBe('2')
    expect(requestedUrl(3).searchParams.get('start')).toBe('0')
  })

  it('falls back to start offset 0 for both sub-searches on a malformed combined cursor, for the default (all) type', async () => {
    const malformed = encodeFediverseCursor('peertube', '{not-json')
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ total: 1, data: [VIDEO] }), { status: 200 }),
    )
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ total: 1, data: [CHANNEL] }), { status: 200 }),
    )

    const adapter = createPeerTubeAdapter(HOST)
    await adapter.search({ q: 'test', limit: 10, cursor: malformed })

    expect(requestedUrl(0).searchParams.get('start')).toBe('0')
    expect(requestedUrl(1).searchParams.get('start')).toBe('0')
  })

  it('falls back to start offset 0 for both sub-searches on a well-formed but wrong-typed/out-of-range combined cursor, for the default (all) type', async () => {
    const wrongTyped = encodeFediverseCursor('peertube', JSON.stringify({ v: 'x', c: -1 }))
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ total: 1, data: [VIDEO] }), { status: 200 }),
    )
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ total: 1, data: [CHANNEL] }), { status: 200 }),
    )

    const adapter = createPeerTubeAdapter(HOST)
    await adapter.search({ q: 'test', limit: 10, cursor: wrongTyped })

    expect(requestedUrl(0).searchParams.get('start')).toBe('0')
    expect(requestedUrl(1).searchParams.get('start')).toBe('0')
  })

  it('degrades to a status:error bucket on a non-ok HTTP response', async () => {
    fetchSpy.mockResolvedValueOnce(new Response(null, { status: 500 }))

    const adapter = createPeerTubeAdapter(HOST)
    const bucket = await adapter.search({ q: 'test', type: 'video', limit: 10 })

    expect(bucket).toEqual({
      provider: 'peertube',
      status: 'error',
      items: [],
      error_code: 'provider_error',
    })
  })

  it('degrades to a status:error bucket on a non-ok HTTP response for type "profile"', async () => {
    fetchSpy.mockResolvedValueOnce(new Response(null, { status: 500 }))

    const adapter = createPeerTubeAdapter(HOST)
    const bucket = await adapter.search({ q: 'test', type: 'profile', limit: 10 })

    expect(bucket).toEqual({
      provider: 'peertube',
      status: 'error',
      items: [],
      error_code: 'provider_error',
    })
  })

  it('degrades to a status:error bucket on an aborted/timed-out request', async () => {
    const abortError = new DOMException('The operation was aborted', 'AbortError')
    fetchSpy.mockRejectedValueOnce(abortError)

    const adapter = createPeerTubeAdapter(HOST)
    const bucket = await adapter.search({ q: 'test', type: 'video', limit: 10 })

    expect(bucket).toEqual({
      provider: 'peertube',
      status: 'error',
      items: [],
      error_code: 'provider_error',
    })
  })

  it('sets next_cursor when more results remain beyond this page, and omits it once exhausted', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ total: 5, data: [VIDEO, VIDEO] }), { status: 200 }),
    )

    const adapter = createPeerTubeAdapter(HOST)
    const first = await adapter.search({ q: 'test', type: 'video', limit: 2 })
    expect(first.next_cursor).toBeDefined()
    expect(decodeFediverseCursor(first.next_cursor ?? undefined, 'peertube')).toBe('2')

    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ total: 1, data: [VIDEO] }), { status: 200 }),
    )
    const exhausted = await adapter.search({ q: 'test', type: 'video', limit: 10 })
    expect(exhausted.next_cursor).toBeUndefined()
    expect('next_cursor' in exhausted).toBe(false)
  })

  it('round-trips the cursor across two calls, requesting the next start offset on the second call', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ total: 5, data: [VIDEO, VIDEO] }), { status: 200 }),
    )
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ total: 5, data: [VIDEO] }), { status: 200 }),
    )

    const adapter = createPeerTubeAdapter(HOST)
    const first = await adapter.search({ q: 'test', type: 'video', limit: 2 })
    expect(requestedUrl(0).searchParams.get('start')).toBe('0')

    await adapter.search({
      q: 'test',
      type: 'video',
      limit: 2,
      cursor: first.next_cursor ?? undefined,
    })
    expect(requestedUrl(1).searchParams.get('start')).toBe('2')
  })
})
