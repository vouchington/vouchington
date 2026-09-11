import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createLemmyAdapter } from '../lemmy.mts'
import { decodeFediverseCursor, encodeFediverseCursor } from '../../cursor.mts'

const fetchSpy = vi.hoisted(() => vi.fn<VitestLooseMock>())
vi.mock<typeof import('undici')>(import('undici'), async () => {
  const actual = await vi.importActual<typeof import('undici')>('undici')
  return { ...actual, fetch: fetchSpy }
})

const HOST = 'lemmy.example'

const POST_VIEW = {
  post: {
    name: 'Hello Lemmy',
    body: 'Post body',
    ap_id: 'https://lemmy.example/post/1',
    published: '2024-01-01T00:00:00.000Z',
    thumbnail_url: null,
  },
  creator: {
    name: 'alice',
    display_name: 'Alice',
    actor_id: 'https://lemmy.example/u/alice',
  },
}

const USER_VIEW = {
  person: {
    name: 'bob',
    display_name: 'Bob',
    bio: null,
    actor_id: 'https://lemmy.example/u/bob',
    avatar: null,
    published: '2024-01-02T00:00:00.000Z',
  },
}

const COMMUNITY_VIEW = {
  community: {
    name: 'technology',
    title: 'Technology',
    description: null,
    actor_id: 'https://lemmy.example/c/technology',
    icon: null,
    published: '2024-01-03T00:00:00.000Z',
  },
}

type LemmyCombinedCursorShape = {
  p: { page: number; done: boolean }
  u: { page: number; done: boolean }
  c: { page: number; done: boolean }
}

function requestedSearchParams(callIndex = 0): URLSearchParams {
  const requestUrl = fetchSpy.mock.calls[callIndex]?.[0]
  const url = requestUrl instanceof URL ? requestUrl : new URL(String(requestUrl))
  return url.searchParams
}

describe('createLemmyAdapter pagination', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    fetchSpy.mockReset()
  })

  it('falls back to page 1 for every kind on a malformed combined cursor', async () => {
    const malformed = encodeFediverseCursor('lemmy', '{not-json')
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ posts: [POST_VIEW] }), { status: 200 }),
    )
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ users: [USER_VIEW] }), { status: 200 }),
    )
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ communities: [COMMUNITY_VIEW] }), { status: 200 }),
    )

    const adapter = createLemmyAdapter(HOST)
    await adapter.search({ q: 'test', limit: 10, cursor: malformed })

    expect(requestedSearchParams(0).get('page')).toBe('1')
    expect(requestedSearchParams(1).get('page')).toBe('1')
    expect(requestedSearchParams(2).get('page')).toBe('1')
  })

  it('falls back to page 1 for a kind whose cursor value is a non-object or an out-of-range page, while honoring a valid sibling', async () => {
    const wrongTyped = encodeFediverseCursor(
      'lemmy',
      JSON.stringify({ p: 'not-an-object', u: { page: 3, done: false }, c: { page: -1 } }),
    )
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ posts: [POST_VIEW] }), { status: 200 }),
    )
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ users: [USER_VIEW] }), { status: 200 }),
    )
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ communities: [COMMUNITY_VIEW] }), { status: 200 }),
    )

    const adapter = createLemmyAdapter(HOST)
    await adapter.search({ q: 'test', limit: 10, cursor: wrongTyped })

    expect(requestedSearchParams(0).get('page')).toBe('1')
    expect(requestedSearchParams(1).get('page')).toBe('3')
    expect(requestedSearchParams(2).get('page')).toBe('1')
  })

  it('stops fetching users and communities once posts alone fill the limit, without dropping them from the next page', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ posts: [POST_VIEW, POST_VIEW] }), { status: 200 }),
    )

    const adapter = createLemmyAdapter(HOST)
    const bucket = await adapter.search({ q: 'test', limit: 2 })

    expect(bucket.items).toHaveLength(2)
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect(bucket.next_cursor).toBeDefined()

    const decoded = decodeFediverseCursor(bucket.next_cursor ?? undefined, 'lemmy')
    const parsed = JSON.parse(decoded ?? '{}') as LemmyCombinedCursorShape
    expect(parsed.p.done).toBe(false)
    expect(parsed.u.done).toBe(false)
    expect(parsed.c.done).toBe(false)
  })

  it('omits next_cursor once posts, users, and communities have all returned under-budget pages', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ posts: [POST_VIEW] }), { status: 200 }),
    )
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ users: [USER_VIEW] }), { status: 200 }),
    )
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ communities: [COMMUNITY_VIEW] }), { status: 200 }),
    )

    const adapter = createLemmyAdapter(HOST)
    const bucket = await adapter.search({ q: 'test', limit: 10 })

    expect(bucket.next_cursor).toBeUndefined()
    expect('next_cursor' in bucket).toBe(false)
  })

  it('round-trips a single kind\'s page across two calls, requesting page=2 on the second call for type "post"', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ posts: [POST_VIEW, POST_VIEW] }), { status: 200 }),
    )
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ posts: [POST_VIEW] }), { status: 200 }),
    )

    const adapter = createLemmyAdapter(HOST)
    const first = await adapter.search({ q: 'test', type: 'post', limit: 2 })
    expect(requestedSearchParams(0).get('page')).toBe('1')
    expect(first.next_cursor).toBeDefined()

    await adapter.search({
      q: 'test',
      type: 'post',
      limit: 2,
      cursor: first.next_cursor ?? undefined,
    })
    expect(requestedSearchParams(1).get('page')).toBe('2')
  })
})
