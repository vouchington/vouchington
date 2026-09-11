import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMastodonAdapter } from './mastodon.mts'
import { getExternalRequestDispatcher } from '@modules/utils/http-dispatchers'

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

describe('createMastodonAdapter', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    fetchSpy.mockReset()
  })

  it('searches accounts for type "profile" and maps to profile items', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ accounts: [ACCOUNT] }), { status: 200 }),
    )

    const adapter = createMastodonAdapter(HOST, TOKEN)
    const bucket = await adapter.search({ q: 'test', type: 'profile', limit: 10 })

    expect(bucket.status).toBe('ok')
    expect(bucket.items).toHaveLength(1)
    expect(bucket.items[0]!.result_type).toBe('profile')
    expect(requestedUrl().searchParams.get('type')).toBe('accounts')
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        dispatcher: getExternalRequestDispatcher(),
        headers: expect.objectContaining({ Authorization: `Bearer ${TOKEN}` }),
      }),
    )
  })

  it('defaults limit to 10 when options.limit is omitted', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ accounts: [ACCOUNT] }), { status: 200 }),
    )

    const adapter = createMastodonAdapter(HOST, TOKEN)
    await adapter.search({ q: 'test', type: 'profile' })

    expect(requestedUrl().searchParams.get('limit')).toBe('10')
  })

  it('omits resolve and offset params for type "profile" without an access token, and never returns a next_cursor', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ accounts: [ACCOUNT, ACCOUNT] }), {
        status: 200,
      }),
    )

    const adapter = createMastodonAdapter(HOST, undefined)
    const bucket = await adapter.search({ q: 'test', type: 'profile', limit: 2 })

    expect(bucket.status).toBe('ok')
    expect(bucket.items).toHaveLength(2)
    expect(bucket.next_cursor).toBeUndefined()
    expect(requestedUrl().searchParams.has('resolve')).toBe(false)
    expect(requestedUrl().searchParams.has('offset')).toBe(false)
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        headers: expect.not.objectContaining({ Authorization: expect.anything() }),
      }),
    )
  })

  it('never proxies token-scoped status search — type "post" returns an auth_required partial bucket with zero fetch calls when an access token is configured', async () => {
    const adapter = createMastodonAdapter(HOST, TOKEN)
    const bucket = await adapter.search({ q: 'test', type: 'post', limit: 10 })

    expect(bucket).toEqual({
      provider: 'mastodon',
      status: 'partial',
      items: [],
      error_code: 'auth_required',
    })
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('degrades type "post" to a partial/auth_required bucket with zero fetch calls when no access token is configured', async () => {
    const adapter = createMastodonAdapter(HOST, undefined)
    const bucket = await adapter.search({ q: 'test', type: 'post', limit: 10 })

    expect(bucket).toEqual({
      provider: 'mastodon',
      status: 'partial',
      items: [],
      error_code: 'auth_required',
    })
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('returns an empty ok bucket with zero fetch calls for type "video"', async () => {
    const adapter = createMastodonAdapter(HOST, TOKEN)
    const bucket = await adapter.search({ q: 'test', type: 'video', limit: 10 })

    expect(bucket).toEqual({ provider: 'mastodon', status: 'ok', items: [] })
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('returns an empty ok bucket with zero fetch calls for type "instance"', async () => {
    const adapter = createMastodonAdapter(HOST, TOKEN)
    const bucket = await adapter.search({ q: 'test', type: 'instance', limit: 10 })

    expect(bucket).toEqual({ provider: 'mastodon', status: 'ok', items: [] })
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('searches only accounts for the default (all) type when an access token is configured', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ accounts: [ACCOUNT] }), { status: 200 }),
    )

    const adapter = createMastodonAdapter(HOST, TOKEN)
    const bucket = await adapter.search({ q: 'test', limit: 10 })

    expect(bucket.status).toBe('ok')
    expect(bucket.items).toHaveLength(1)
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })

  it('searches only accounts and returns status "ok" for the default (all) type without an access token', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ accounts: [ACCOUNT] }), { status: 200 }),
    )

    const adapter = createMastodonAdapter(HOST, undefined)
    const bucket = await adapter.search({ q: 'test', limit: 10 })

    expect(bucket.status).toBe('ok')
    expect(bucket.items).toHaveLength(1)
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })

  it('degrades to a status:error bucket for the default (all) type when the accounts search fails without an access token', async () => {
    fetchSpy.mockResolvedValueOnce(new Response(null, { status: 500 }))

    const adapter = createMastodonAdapter(HOST, undefined)
    const bucket = await adapter.search({ q: 'test', limit: 10 })

    expect(bucket).toEqual({
      provider: 'mastodon',
      status: 'error',
      items: [],
      error_code: 'provider_error',
    })
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })

  it('degrades to a status:error bucket on a non-ok HTTP response', async () => {
    fetchSpy.mockResolvedValueOnce(new Response(null, { status: 500 }))

    const adapter = createMastodonAdapter(HOST, TOKEN)
    const bucket = await adapter.search({ q: 'test', type: 'profile', limit: 10 })

    expect(bucket).toEqual({
      provider: 'mastodon',
      status: 'error',
      items: [],
      error_code: 'provider_error',
    })
  })

  it('degrades to a status:error bucket on an aborted/timed-out request', async () => {
    const abortError = new DOMException('The operation was aborted', 'AbortError')
    fetchSpy.mockRejectedValueOnce(abortError)

    const adapter = createMastodonAdapter(HOST, TOKEN)
    const bucket = await adapter.search({ q: 'test', type: 'profile', limit: 10 })

    expect(bucket).toEqual({
      provider: 'mastodon',
      status: 'error',
      items: [],
      error_code: 'provider_error',
    })
  })
})
