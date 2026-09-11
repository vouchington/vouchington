import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createBlueskyAdapter } from './bluesky.mts'
import { decodeFediverseCursor } from '../cursor.mts'
import { getExternalRequestDispatcher } from '@modules/utils/http-dispatchers'

const fetchSpy = vi.hoisted(() => vi.fn<VitestLooseMock>())
vi.mock<typeof import('undici')>(import('undici'), async () => {
  const actual = await vi.importActual<typeof import('undici')>('undici')
  return { ...actual, fetch: fetchSpy }
})

type BlueskyCombinedCursorShape = {
  a: { cursor?: string; done: boolean }
  p: { cursor?: string; done: boolean }
}

const HOST = 'bsky.example'

const ACTOR = { did: 'did:plc:abc123', handle: 'alice.bsky.social', displayName: 'Alice' }
const POST = {
  uri: 'at://did:plc:abc123/app.bsky.feed.post/3k2abc',
  author: { handle: 'alice.bsky.social', displayName: 'Alice' },
  record: { text: 'Hello world', createdAt: '2026-01-01T00:00:00.000Z' },
}

function requestedUrl(callIndex = 0): URL {
  const requestUrl = fetchSpy.mock.calls[callIndex]?.[0]
  return requestUrl instanceof URL ? requestUrl : new URL(String(requestUrl))
}

describe('createBlueskyAdapter', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    fetchSpy.mockReset()
  })

  it('searches actors for type "profile" and maps to profile items', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ actors: [ACTOR] }), { status: 200 }),
    )

    const adapter = createBlueskyAdapter(HOST)
    const bucket = await adapter.search({ q: 'test', type: 'profile', limit: 10 })

    expect(bucket).toEqual({ provider: 'bluesky', status: 'ok', items: expect.any(Array) })
    expect(bucket.items).toHaveLength(1)
    expect(bucket.items[0]!.result_type).toBe('profile')
    expect(requestedUrl().pathname).toBe('/xrpc/app.bsky.actor.searchActors')
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ dispatcher: getExternalRequestDispatcher() }),
    )
  })

  it('defaults limit to 10 when options.limit is omitted', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ actors: [ACTOR] }), { status: 200 }),
    )

    const adapter = createBlueskyAdapter(HOST)
    await adapter.search({ q: 'test', type: 'profile' })

    expect(requestedUrl().searchParams.get('limit')).toBe('10')
  })

  it('searches posts for type "post" and maps to post items', async () => {
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({ posts: [POST] }), { status: 200 }))

    const adapter = createBlueskyAdapter(HOST)
    const bucket = await adapter.search({ q: 'test', type: 'post', limit: 10 })

    expect(bucket.items).toHaveLength(1)
    expect(bucket.items[0]!.result_type).toBe('post')
    expect(requestedUrl().pathname).toBe('/xrpc/app.bsky.feed.searchPosts')
  })

  it('returns an empty ok bucket with zero fetch calls for type "video"', async () => {
    const adapter = createBlueskyAdapter(HOST)
    const bucket = await adapter.search({ q: 'test', type: 'video', limit: 10 })

    expect(bucket).toEqual({ provider: 'bluesky', status: 'ok', items: [] })
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('returns an empty ok bucket with zero fetch calls for type "instance"', async () => {
    const adapter = createBlueskyAdapter(HOST)
    const bucket = await adapter.search({ q: 'test', type: 'instance', limit: 10 })

    expect(bucket).toEqual({ provider: 'bluesky', status: 'ok', items: [] })
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('combines actors and posts for the default (all) type', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ actors: [ACTOR] }), { status: 200 }),
    )
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({ posts: [POST] }), { status: 200 }))

    const adapter = createBlueskyAdapter(HOST)
    const bucket = await adapter.search({ q: 'test', limit: 10 })

    expect(bucket).toEqual({ provider: 'bluesky', status: 'ok', items: expect.any(Array) })
    expect(bucket.items).toHaveLength(2)
    expect(fetchSpy).toHaveBeenCalledTimes(2)
  })

  it('degrades to a status:error bucket on a non-ok HTTP response', async () => {
    fetchSpy.mockResolvedValueOnce(new Response(null, { status: 500 }))

    const adapter = createBlueskyAdapter(HOST)
    const bucket = await adapter.search({ q: 'test', type: 'profile', limit: 10 })

    expect(bucket).toEqual({
      provider: 'bluesky',
      status: 'error',
      items: [],
      error_code: 'provider_error',
    })
  })

  it('degrades to a status:error bucket on a non-ok HTTP response for type "post"', async () => {
    fetchSpy.mockResolvedValueOnce(new Response(null, { status: 500 }))

    const adapter = createBlueskyAdapter(HOST)
    const bucket = await adapter.search({ q: 'test', type: 'post', limit: 10 })

    expect(bucket).toEqual({
      provider: 'bluesky',
      status: 'error',
      items: [],
      error_code: 'provider_error',
    })
  })

  it('isolates a failed actors sub-search from a successful posts sub-search for the default (all) type, preserving posts and leaving the actors cursor unchanged for retry', async () => {
    fetchSpy.mockResolvedValueOnce(new Response(null, { status: 500 }))
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({ posts: [POST] }), { status: 200 }))

    const adapter = createBlueskyAdapter(HOST)
    const bucket = await adapter.search({ q: 'test', limit: 10 })

    expect(bucket.status).toBe('partial')
    expect(bucket.error_code).toBe('provider_error')
    expect(bucket.items).toHaveLength(1)
    expect(bucket.items[0]!.result_type).toBe('post')
    expect(fetchSpy).toHaveBeenCalledTimes(2)

    const decoded = decodeFediverseCursor(bucket.next_cursor ?? undefined, 'bluesky')
    const parsed = JSON.parse(decoded ?? '{}') as BlueskyCombinedCursorShape
    expect(parsed.a.done).toBe(false)
  })

  it('degrades to a status:error bucket for the default (all) type when both actors and posts sub-searches fail', async () => {
    fetchSpy.mockResolvedValueOnce(new Response(null, { status: 500 }))
    fetchSpy.mockResolvedValueOnce(new Response(null, { status: 500 }))

    const adapter = createBlueskyAdapter(HOST)
    const bucket = await adapter.search({ q: 'test', limit: 10 })

    expect(bucket).toEqual({
      provider: 'bluesky',
      status: 'error',
      items: [],
      error_code: 'provider_error',
    })
  })

  it('degrades to a status:error bucket on an aborted/timed-out request', async () => {
    const abortError = new DOMException('The operation was aborted', 'AbortError')
    fetchSpy.mockRejectedValueOnce(abortError)

    const adapter = createBlueskyAdapter(HOST)
    const bucket = await adapter.search({ q: 'test', type: 'profile', limit: 10 })

    expect(bucket).toEqual({
      provider: 'bluesky',
      status: 'error',
      items: [],
      error_code: 'provider_error',
    })
  })
})
