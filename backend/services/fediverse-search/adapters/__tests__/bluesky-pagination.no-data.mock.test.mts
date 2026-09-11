import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createBlueskyAdapter } from '../bluesky.mts'
import { decodeFediverseCursor, encodeFediverseCursor } from '../../cursor.mts'

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

describe('createBlueskyAdapter pagination', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    fetchSpy.mockReset()
  })

  it('forwards a decoded combined cursor to both sub-searches and encodes a combined next_cursor for the default (all) type', async () => {
    const incomingCursor = encodeFediverseCursor(
      'bluesky',
      JSON.stringify({
        a: { cursor: 'actors-page-2', done: false },
        p: { cursor: 'posts-page-2', done: false },
      }),
    )
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ actors: [ACTOR], cursor: 'actors-page-3' }), { status: 200 }),
    )
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ posts: [POST], cursor: 'posts-page-3' }), { status: 200 }),
    )

    const adapter = createBlueskyAdapter(HOST)
    const bucket = await adapter.search({ q: 'test', limit: 10, cursor: incomingCursor })

    expect(requestedUrl(0).searchParams.get('cursor')).toBe('actors-page-2')
    expect(requestedUrl(1).searchParams.get('cursor')).toBe('posts-page-2')

    expect(bucket.next_cursor).toBeDefined()
    const decoded = decodeFediverseCursor(bucket.next_cursor ?? undefined, 'bluesky')
    expect(decoded).toBeDefined()
    const parsed = JSON.parse(decoded ?? '{}') as BlueskyCombinedCursorShape
    expect(parsed.a.cursor).toBe('actors-page-3')
    expect(parsed.p.cursor).toBe('posts-page-3')
  })

  it('falls back to no forwarded cursor on a malformed combined cursor for the default (all) type', async () => {
    const malformed = encodeFediverseCursor('bluesky', '{not-json')
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ actors: [ACTOR] }), { status: 200 }),
    )
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({ posts: [POST] }), { status: 200 }))

    const adapter = createBlueskyAdapter(HOST)
    await adapter.search({ q: 'test', limit: 10, cursor: malformed })

    expect(requestedUrl(0).searchParams.has('cursor')).toBe(false)
    expect(requestedUrl(1).searchParams.has('cursor')).toBe(false)
  })

  it('falls back to no forwarded cursor on a well-formed but wrong-typed combined cursor for the default (all) type', async () => {
    const wrongTyped = encodeFediverseCursor('bluesky', JSON.stringify({ a: 5, p: true }))
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ actors: [ACTOR] }), { status: 200 }),
    )
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({ posts: [POST] }), { status: 200 }))

    const adapter = createBlueskyAdapter(HOST)
    await adapter.search({ q: 'test', limit: 10, cursor: wrongTyped })

    expect(requestedUrl(0).searchParams.has('cursor')).toBe(false)
    expect(requestedUrl(1).searchParams.has('cursor')).toBe(false)
  })

  it('sets next_cursor from the upstream cursor and omits it when absent', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ actors: [ACTOR], cursor: 'upstream-cursor-1' }), {
        status: 200,
      }),
    )

    const adapter = createBlueskyAdapter(HOST)
    const withCursor = await adapter.search({ q: 'test', type: 'profile', limit: 10 })
    expect(withCursor.next_cursor).toBeDefined()
    expect(decodeFediverseCursor(withCursor.next_cursor ?? undefined, 'bluesky')).toBe(
      'upstream-cursor-1',
    )

    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ actors: [ACTOR] }), { status: 200 }),
    )
    const withoutCursor = await adapter.search({ q: 'test', type: 'profile', limit: 10 })
    expect(withoutCursor.next_cursor).toBeUndefined()
    expect('next_cursor' in withoutCursor).toBe(false)
  })

  it('skips the posts fetch and leaves the posts cursor unset when actors alone fill the page, for the default (all) type', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ actors: [ACTOR, ACTOR], cursor: 'actors-page-2' }), {
        status: 200,
      }),
    )

    const adapter = createBlueskyAdapter(HOST)
    const bucket = await adapter.search({ q: 'test', limit: 2 })

    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect(bucket.items).toHaveLength(2)
    expect(bucket.next_cursor).toBeDefined()

    const decoded = decodeFediverseCursor(bucket.next_cursor ?? undefined, 'bluesky')
    const parsed = JSON.parse(decoded ?? '{}') as BlueskyCombinedCursorShape
    expect(parsed.a.cursor).toBe('actors-page-2')
    expect(parsed.a.done).toBe(false)
    expect(parsed.p.cursor).toBeUndefined()
    expect(parsed.p.done).toBe(false)
  })

  it('still emits a next_cursor when actors alone fill the page and actors has no upstream cursor, so the never-attempted posts sub-search stays reachable', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ actors: [ACTOR, ACTOR] }), { status: 200 }),
    )

    const adapter = createBlueskyAdapter(HOST)
    const bucket = await adapter.search({ q: 'test', limit: 2 })

    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect(bucket.items).toHaveLength(2)
    expect(bucket.next_cursor).toBeDefined()

    const decoded = decodeFediverseCursor(bucket.next_cursor ?? undefined, 'bluesky')
    const parsed = JSON.parse(decoded ?? '{}') as BlueskyCombinedCursorShape
    expect(parsed.a.done).toBe(true)
    expect(parsed.p.done).toBe(false)

    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({ posts: [POST] }), { status: 200 }))
    await adapter.search({ q: 'test', limit: 2, cursor: bucket.next_cursor ?? undefined })

    expect(fetchSpy).toHaveBeenCalledTimes(2)
    expect(requestedUrl(1).pathname).toBe('/xrpc/app.bsky.feed.searchPosts')
  })

  it('omits next_cursor once both actors and posts are exhausted for the default (all) type', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ actors: [ACTOR] }), { status: 200 }),
    )
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({ posts: [POST] }), { status: 200 }))

    const adapter = createBlueskyAdapter(HOST)
    const bucket = await adapter.search({ q: 'test', limit: 10 })

    expect(bucket.next_cursor).toBeUndefined()
    expect('next_cursor' in bucket).toBe(false)
  })

  it('round-trips the cursor across two calls, forwarding the decoded value as the upstream cursor param', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ actors: [ACTOR], cursor: 'upstream-cursor-2' }), {
        status: 200,
      }),
    )
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ actors: [ACTOR] }), { status: 200 }),
    )

    const adapter = createBlueskyAdapter(HOST)
    const first = await adapter.search({ q: 'test', type: 'profile', limit: 10 })
    expect(requestedUrl(0).searchParams.has('cursor')).toBe(false)

    await adapter.search({
      q: 'test',
      type: 'profile',
      limit: 10,
      cursor: first.next_cursor ?? undefined,
    })
    expect(requestedUrl(1).searchParams.get('cursor')).toBe('upstream-cursor-2')
  })
})
