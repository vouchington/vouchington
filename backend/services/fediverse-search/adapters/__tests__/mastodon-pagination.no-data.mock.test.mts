import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMastodonAdapter } from '../mastodon.mts'
import { decodeFediverseCursor } from '../../cursor.mts'

const fetchSpy = vi.hoisted(() => vi.fn<VitestLooseMock>())
vi.mock<typeof import('undici')>(import('undici'), async () => {
  const actual = await vi.importActual<typeof import('undici')>('undici')
  return { ...actual, fetch: fetchSpy }
})

const HOST = 'mastodon.example'
const TOKEN = 'app-token'

const ACCOUNT = {
  username: 'alice',
  display_name: 'Alice',
  url: 'https://mastodon.example/@alice',
}

function requestedUrl(callIndex = 0): URL {
  const requestUrl = fetchSpy.mock.calls[callIndex]?.[0]
  return requestUrl instanceof URL ? requestUrl : new URL(String(requestUrl))
}

describe('createMastodonAdapter pagination', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    fetchSpy.mockReset()
  })

  it('sets next_cursor when the result count equals the limit, and omits it otherwise', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ accounts: [ACCOUNT, ACCOUNT], statuses: [] }), {
        status: 200,
      }),
    )

    const adapter = createMastodonAdapter(HOST, TOKEN)
    const full = await adapter.search({ q: 'test', type: 'profile', limit: 2 })
    expect(full.next_cursor).toBeDefined()
    expect(decodeFediverseCursor(full.next_cursor ?? undefined, 'mastodon')).toBe('2')

    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ accounts: [ACCOUNT], statuses: [] }), { status: 200 }),
    )
    const partial = await adapter.search({ q: 'test', type: 'profile', limit: 10 })
    expect(partial.next_cursor).toBeUndefined()
    expect('next_cursor' in partial).toBe(false)
  })

  it('round-trips the cursor across two calls, requesting the next offset on the second call', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ accounts: [ACCOUNT, ACCOUNT], statuses: [] }), {
        status: 200,
      }),
    )
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ accounts: [ACCOUNT], statuses: [] }), { status: 200 }),
    )

    const adapter = createMastodonAdapter(HOST, TOKEN)
    const first = await adapter.search({ q: 'test', type: 'profile', limit: 2 })
    expect(requestedUrl(0).searchParams.get('offset')).toBe('0')

    await adapter.search({
      q: 'test',
      type: 'profile',
      limit: 2,
      cursor: first.next_cursor ?? undefined,
    })
    expect(requestedUrl(1).searchParams.get('offset')).toBe('2')
  })
})
