import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BOT_CHALLENGE_ACTION_TAG, BOT_CHALLENGE_REQUIRED } from '@ts-shared/utils/bot-challenge'
import { createAuthRecoveryFetch } from '../auth-recovery-fetch'

function errorResponse(status: number, code: string): Response {
  return new Response(JSON.stringify({ code }), { status })
}

describe('application auth recovery fetch', () => {
  beforeEach(() => {
    vi.stubGlobal('navigator', {
      locks: {
        request: async (_name: string, _options: unknown, callback: () => Promise<boolean>) =>
          callback(),
      },
    })
    vi.stubGlobal('window', {
      location: {
        pathname: '/news',
        search: '?topic=owned',
        assign: vi.fn<(url: string) => void>(),
      },
    })
  })

  afterEach(() => vi.unstubAllGlobals())

  it('renews an expired identity and replays the original request once', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(errorResponse(401, 'AUTH_REQUIRED'))
      .mockResolvedValueOnce(new Response(JSON.stringify({ session: { uid: 'user' } })))
      .mockResolvedValueOnce(new Response('{}'))
    vi.stubGlobal('fetch', fetchMock)
    const init: RequestInit = {
      body: JSON.stringify({ value: 'owned' }),
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    }

    expect((await createAuthRecoveryFetch()('/api/v1/posts', init)).status).toBe(200)
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      '/api/v1/posts',
      '/api/v1/session',
      '/api/v1/posts',
    ])
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({
      method: 'PATCH',
      credentials: 'include',
      body: '{}',
    })
    expect(fetchMock.mock.calls[2]?.[1]).toBe(init)
  })

  it('preserves an anonymous 401 without cleanup or navigation', async () => {
    const original = errorResponse(401, 'AUTH_REQUIRED')
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(original)
      .mockResolvedValueOnce(new Response(JSON.stringify({ session: { uid: null } })))
    vi.stubGlobal('fetch', fetchMock)

    await expect(createAuthRecoveryFetch()('/api/v1/bookmarks/user/example')).resolves.toBe(
      original,
    )
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(window.location.assign).not.toHaveBeenCalled()
  })

  it('treats a malformed successful renewal as a protocol error and clears cookies', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(errorResponse(401, 'AUTH_REQUIRED'))
      .mockResolvedValueOnce(new Response(JSON.stringify({ session: {} })))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(createAuthRecoveryFetch()('/api/v1/posts')).rejects.toMatchObject({ status: 502 })
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      '/api/v1/posts',
      '/api/v1/session',
      '/api/v1/session',
    ])
    expect(fetchMock.mock.calls[2]?.[1]).toMatchObject({ method: 'DELETE' })
    expect(window.location.assign).toHaveBeenCalledTimes(1)
  })

  it('preserves cookies and does not navigate when renewal fails transiently', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(errorResponse(401, 'AUTH_REQUIRED'))
      .mockResolvedValueOnce(errorResponse(503, 'UPSTREAM_UNAVAILABLE'))
    vi.stubGlobal('fetch', fetchMock)

    await expect(createAuthRecoveryFetch()('/api/v1/posts')).rejects.toMatchObject({ status: 503 })
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(['/api/v1/posts', '/api/v1/session'])
    expect(window.location.assign).not.toHaveBeenCalled()
  })

  it('does not clean up a session after a renewal transport error', async () => {
    const transportError = new TypeError('connection closed')
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(errorResponse(401, 'AUTH_REQUIRED'))
      .mockRejectedValueOnce(transportError)
    vi.stubGlobal('fetch', fetchMock)

    await expect(createAuthRecoveryFetch()('/api/v1/posts')).rejects.toBe(transportError)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(window.location.assign).not.toHaveBeenCalled()
  })

  it('does not navigate to login for a replay transport failure after successful renewal', async () => {
    const transportError = new TypeError('connection closed')
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(errorResponse(401, 'AUTH_REQUIRED'))
      .mockResolvedValueOnce(new Response(JSON.stringify({ session: { uid: 'user' } })))
      .mockRejectedValueOnce(transportError)
    vi.stubGlobal('fetch', fetchMock)

    await expect(createAuthRecoveryFetch()('/api/v1/posts')).rejects.toBe(transportError)
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(window.location.assign).not.toHaveBeenCalled()
  })

  it('preserves caller cancellation after renewal without replay or navigation', async () => {
    const cancellation = new DOMException('Canceled by caller', 'AbortError')
    const controller = new AbortController()
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(errorResponse(401, 'AUTH_REQUIRED'))
      .mockImplementationOnce(async () => {
        controller.abort(cancellation)
        return new Response(JSON.stringify({ session: { uid: 'user' } }))
      })
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      createAuthRecoveryFetch()('/api/v1/posts', { signal: controller.signal }),
    ).rejects.toBe(cancellation)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(window.location.assign).not.toHaveBeenCalled()
  })

  it('does not recursively renew the session endpoint', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(errorResponse(401, 'AUTH_REQUIRED'))
    vi.stubGlobal('fetch', fetchMock)

    expect((await createAuthRecoveryFetch()('/api/v1/session')).status).toBe(401)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('sends a revoked refresh credential to login without attempting renewal', async () => {
    const response = errorResponse(401, 'SESSION_REFRESH_REUSED')
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(response)
    vi.stubGlobal('fetch', fetchMock)

    await expect(createAuthRecoveryFetch()('/api/v1/posts')).resolves.toBe(response)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(window.location.assign).toHaveBeenCalledTimes(1)
  })

  it('allows one challenge after one authenticated renewal, preserving the request body', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(errorResponse(401, 'AUTH_REQUIRED'))
      .mockResolvedValueOnce(new Response(JSON.stringify({ session: { uid: 'user' } })))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ code: BOT_CHALLENGE_REQUIRED, action: BOT_CHALLENGE_ACTION_TAG }),
          {
            status: 403,
          },
        ),
      )
      .mockResolvedValueOnce(new Response('{}'))
    vi.stubGlobal('fetch', fetchMock)
    const solve = vi
      .fn<(action: string, signal?: AbortSignal) => Promise<string>>()
      .mockResolvedValue('one-proof')
    const init: RequestInit = { method: 'POST', body: 'same-body', credentials: 'include' }

    expect((await createAuthRecoveryFetch(solve)('/api/posts', init)).status).toBe(200)
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      '/api/posts',
      '/api/v1/session',
      '/api/posts',
      '/api/posts',
    ])
    expect(fetchMock.mock.calls[3]?.[1]?.body).toBe(init.body)
    expect(fetchMock.mock.calls[3]?.[1]?.credentials).toBe(init.credentials)
    expect(solve).toHaveBeenCalledTimes(1)
  })
})
