import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { FEDIVERSE_LEMMY_HOST, FEDIVERSE_MASTODON_HOST } from '@voucha/config'
import { decodeFediverseCursor } from '@services/fediverse-search'

// Route-level integration through the real adapter factory (per `docs` Phase A plan): only
// `undici`'s fetch is mocked, everything from the route down through `searchFediverse` and the
// Valkey-cached adapters is real. Each test uses a unique `q` because the adapter cache is a real
// shared Valkey instance across this file's tests.
const fetchSpy = vi.hoisted(() => vi.fn<VitestLooseMock>())
vi.mock<typeof import('undici')>(import('undici'), async () => {
  const actual = await vi.importActual<typeof import('undici')>('undici')
  return { ...actual, fetch: fetchSpy }
})

const LEMMY_POST_VIEW = {
  post: {
    name: 'Hello Lemmy',
    ap_id: `https://${FEDIVERSE_LEMMY_HOST}/post/1`,
    published: '2026-01-01T00:00:00.000Z',
  },
  creator: {
    name: 'alice',
    actor_id: `https://${FEDIVERSE_LEMMY_HOST}/u/alice`,
  },
}

function respondByHost(routes: Record<string, () => Response>) {
  return async (input: unknown) => {
    const url = input instanceof URL ? input : new URL(String(input))
    const respond = routes[url.hostname]
    if (!respond) throw new Error(`Unexpected fetch to unmocked host: ${url.hostname}`)
    return respond()
  }
}

// The cursor-pagination test asserts against fetchSpy's actual call arguments/order, so a cache
// hit from a leftover Valkey key (a rerun within the TTL, a prior worker) would silently make
// those assertions wrong instead of failing loudly — give it a query guaranteed unused before.
const uniqueTestQuery = (label: string): string =>
  `${label}-${Date.now()}-${Math.random().toString(36).slice(2)}`

describe('GET /api/v1/fediverse/search (real adapters, mocked undici)', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    fetchSpy.mockReset()
  })

  it('returns real mapped items through the factory-wired adapter and sets public cache headers', async () => {
    fetchSpy.mockImplementation(
      respondByHost({
        [FEDIVERSE_LEMMY_HOST]: () =>
          new Response(JSON.stringify({ posts: [LEMMY_POST_VIEW] }), { status: 200 }),
      }),
    )

    const request = createRequest()
    const response = await request
      .get('/api/v1/fediverse/search?q=fediverse-mock-basic-search&providers=lemmy&limit=5')
      .expect(200)

    expect(response.headers['cache-control']).toMatch(/public/)
    expect(response.body.buckets).toEqual([
      {
        provider: 'lemmy',
        status: 'ok',
        items: [
          expect.objectContaining({ provider: 'lemmy', external_url: LEMMY_POST_VIEW.post.ap_id }),
        ],
      },
    ])
  })

  it('isolates provider failures — one upstream errors while the other still returns results', async () => {
    fetchSpy.mockImplementation(
      respondByHost({
        [FEDIVERSE_LEMMY_HOST]: () =>
          new Response(JSON.stringify({ users: [], posts: [LEMMY_POST_VIEW] }), { status: 200 }),
        [FEDIVERSE_MASTODON_HOST]: () => new Response(null, { status: 500 }),
      }),
    )

    // No `type` filter: Mastodon's "post" branch short-circuits to `partial`/`auth_required`
    // without a configured access token (no test-env token is set), so the search must hit
    // Mastodon's combined branch — which always fetches accounts — to actually exercise the
    // mocked upstream 500.
    const request = createRequest()
    const response = await request
      .get(
        '/api/v1/fediverse/search?q=fediverse-mock-isolation-search&providers=lemmy,mastodon&limit=5',
      )
      .expect(200)

    const byProvider = Object.fromEntries(
      (response.body.buckets as { provider: string; status: string }[]).map(bucket => [
        bucket.provider,
        bucket.status,
      ]),
    )
    expect(byProvider.lemmy).toBe('ok')
    expect(byProvider.mastodon).toBe('error')
    // A degraded bucket must never be marked publicly cacheable — a shared HTTP cache replaying
    // this response would serve the transient Mastodon failure to later anonymous callers.
    expect(response.headers['cache-control']).toBeUndefined()
  })

  it('paginates a single-provider query end-to-end, requesting the next page on the second call', async () => {
    const q = uniqueTestQuery('fediverse-mock-cursor-search')
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ posts: [LEMMY_POST_VIEW, LEMMY_POST_VIEW] }), { status: 200 }),
    )

    const request = createRequest()
    const first = await request
      .get(`/api/v1/fediverse/search?q=${encodeURIComponent(q)}&providers=lemmy&type=post&limit=2`)
      .expect(200)

    const firstBucket = first.body.buckets[0]
    expect(firstBucket.next_cursor).toBeTruthy()
    const decoded = decodeFediverseCursor(firstBucket.next_cursor, 'lemmy')
    const parsed = JSON.parse(decoded ?? '{}') as { p: { page: number; done: boolean } }
    expect(parsed.p).toEqual({ page: 2, done: false })

    const firstUrl = fetchSpy.mock.calls[0]?.[0]
    const firstParams = (firstUrl instanceof URL ? firstUrl : new URL(String(firstUrl)))
      .searchParams
    expect(firstParams.get('page')).toBe('1')

    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ posts: [LEMMY_POST_VIEW] }), { status: 200 }),
    )
    await request
      .get(
        `/api/v1/fediverse/search?q=${encodeURIComponent(q)}&providers=lemmy&type=post&limit=2&after=${encodeURIComponent(firstBucket.next_cursor)}`,
      )
      .expect(200)

    const secondUrl = fetchSpy.mock.calls[1]?.[0]
    const secondParams = (secondUrl instanceof URL ? secondUrl : new URL(String(secondUrl)))
      .searchParams
    expect(secondParams.get('page')).toBe('2')
  })
})
