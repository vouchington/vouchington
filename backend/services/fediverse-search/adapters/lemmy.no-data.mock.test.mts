import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createLemmyAdapter } from './lemmy.mts'
import { decodeFediverseCursor } from '../cursor.mts'
import { getExternalRequestDispatcher } from '@modules/utils/http-dispatchers'

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

describe('createLemmyAdapter', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    fetchSpy.mockReset()
  })

  it('fetches posts, users, and communities in order for the default (all) type', async () => {
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

    expect(bucket.status).toBe('ok')
    expect(bucket.items.map(item => item.external_url)).toEqual([
      'https://lemmy.example/post/1',
      'https://lemmy.example/u/bob',
      'https://lemmy.example/c/technology',
    ])
    expect(requestedSearchParams(0).get('type_')).toBe('Posts')
    expect(requestedSearchParams(1).get('type_')).toBe('Users')
    expect(requestedSearchParams(2).get('type_')).toBe('Communities')
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ dispatcher: getExternalRequestDispatcher() }),
    )
  })

  it('defaults limit to 10 when options.limit is omitted', async () => {
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
    await adapter.search({ q: 'test' })

    expect(requestedSearchParams(0).get('limit')).toBe('10')
  })

  it('sets listing_type=All on every request so federated results are not dropped', async () => {
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({}), { status: 200 }))
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({}), { status: 200 }))
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({}), { status: 200 }))

    const adapter = createLemmyAdapter(HOST)
    await adapter.search({ q: 'test', limit: 10 })

    expect(requestedSearchParams(0).get('listing_type')).toBe('All')
    expect(requestedSearchParams(1).get('listing_type')).toBe('All')
    expect(requestedSearchParams(2).get('listing_type')).toBe('All')
  })

  it('sends only a Posts request and maps posts when options.type is "post"', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ posts: [POST_VIEW] }), { status: 200 }),
    )

    const adapter = createLemmyAdapter(HOST)
    const bucket = await adapter.search({ q: 'test', type: 'post', limit: 10 })

    expect(bucket.items).toHaveLength(1)
    expect(bucket.items[0]!.result_type).toBe('post')
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect(requestedSearchParams(0).get('type_')).toBe('Posts')
  })

  it('sends Users and Communities requests but never fetches posts when options.type is "profile"', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ users: [USER_VIEW] }), { status: 200 }),
    )
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ communities: [COMMUNITY_VIEW] }), { status: 200 }),
    )

    const adapter = createLemmyAdapter(HOST)
    const bucket = await adapter.search({ q: 'test', type: 'profile', limit: 10 })

    expect(bucket.items).toHaveLength(2)
    expect(bucket.items.every(item => item.result_type === 'profile')).toBe(true)
    expect(fetchSpy).toHaveBeenCalledTimes(2)
    expect(requestedSearchParams(0).get('type_')).toBe('Users')
    expect(requestedSearchParams(1).get('type_')).toBe('Communities')
  })

  it('returns an empty ok bucket with zero fetch calls for type "video"', async () => {
    const adapter = createLemmyAdapter(HOST)
    const bucket = await adapter.search({ q: 'test', type: 'video', limit: 10 })

    expect(bucket).toEqual({ provider: 'lemmy', status: 'ok', items: [] })
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('returns an empty ok bucket with zero fetch calls for type "instance"', async () => {
    const adapter = createLemmyAdapter(HOST)
    const bucket = await adapter.search({ q: 'test', type: 'instance', limit: 10 })

    expect(bucket).toEqual({ provider: 'lemmy', status: 'ok', items: [] })
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('degrades to a status:error bucket on a non-ok HTTP response', async () => {
    fetchSpy.mockResolvedValueOnce(new Response(null, { status: 500 }))

    const adapter = createLemmyAdapter(HOST)
    const bucket = await adapter.search({ q: 'test', limit: 10 })

    expect(bucket).toEqual({
      provider: 'lemmy',
      status: 'error',
      items: [],
      error_code: 'provider_error',
    })
  })

  it('isolates a failed posts sub-search from successful users and communities sub-searches, preserving their items and leaving the posts page unchanged for retry', async () => {
    fetchSpy.mockResolvedValueOnce(new Response(null, { status: 500 }))
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ users: [USER_VIEW] }), { status: 200 }),
    )
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ communities: [COMMUNITY_VIEW] }), { status: 200 }),
    )

    const adapter = createLemmyAdapter(HOST)
    const bucket = await adapter.search({ q: 'test', limit: 10 })

    expect(bucket.status).toBe('partial')
    expect(bucket.error_code).toBe('provider_error')
    expect(bucket.items.map(item => item.external_url)).toEqual([
      'https://lemmy.example/u/bob',
      'https://lemmy.example/c/technology',
    ])
    expect(fetchSpy).toHaveBeenCalledTimes(3)

    const decoded = decodeFediverseCursor(bucket.next_cursor ?? undefined, 'lemmy')
    const parsed = JSON.parse(decoded ?? '{}') as LemmyCombinedCursorShape
    expect(parsed.p).toEqual({ page: 1, done: false })
  })

  it('degrades to a status:error bucket when a mapped result has a malformed ap_id/actor_id, since mapping happens outside the per-kind fetch isolation', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          posts: [{ ...POST_VIEW, post: { ...POST_VIEW.post, ap_id: 'not-a-url' } }],
        }),
        { status: 200 },
      ),
    )

    const adapter = createLemmyAdapter(HOST)
    const bucket = await adapter.search({ q: 'test', type: 'post', limit: 10 })

    expect(bucket).toEqual({
      provider: 'lemmy',
      status: 'error',
      items: [],
      error_code: 'provider_error',
    })
  })

  it('degrades to a status:error bucket on an aborted/timed-out request', async () => {
    const abortError = new DOMException('The operation was aborted', 'AbortError')
    fetchSpy.mockRejectedValueOnce(abortError)

    const adapter = createLemmyAdapter(HOST)
    const bucket = await adapter.search({ q: 'test', limit: 10 })

    expect(bucket).toEqual({
      provider: 'lemmy',
      status: 'error',
      items: [],
      error_code: 'provider_error',
    })
  })
})
