import { afterAll, afterEach, describe, expect, it, vi } from 'vitest'
import { createRandomString } from '@voucha/test-helpers'
import type { fetch as undiciFetch } from 'undici'

type FetchResponse = Awaited<ReturnType<typeof undiciFetch>>
const fetchSpy = vi.fn<VitestLooseMock>()
vi.stubEnv('X_CLIENT_ID', 'test-client')
vi.stubEnv('X_CLIENT_SECRET', 'test-secret')
vi.resetModules()
vi.doMock<typeof import('undici')>(import('undici'), async importOriginal => ({
  ...(await importOriginal()),
  fetch: fetchSpy,
}))
const { upsertXAccount } = await import('../index.mts')

describe('upsertXAccount', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    fetchSpy.mockReset()
  })
  afterAll(() => {
    vi.unstubAllEnvs()
    vi.doUnmock('undici')
  })

  it('exchanges a PKCE code, loads its profile, and persists the token material', async () => {
    const userId = `x-${createRandomString(8)}`
    fetchSpy
      .mockResolvedValueOnce(
        response({
          access_token: 'access',
          refresh_token: 'refresh',
          expires_in: 60,
          token_type: 'bearer',
          scope: 'users.read',
        }),
      )
      .mockResolvedValueOnce(response({ data: { id: userId, name: 'X User', username: 'x_user' } }))
    await expect(
      upsertXAccount('code', 'https://example.com/callback', 'verifier'),
    ).resolves.toMatchObject({
      provider_user_id: userId,
      provider_user_data: { username: 'x_user' },
    })
    expect(fetchSpy).toHaveBeenNthCalledWith(
      1,
      'https://api.x.com/2/oauth2/token',
      expect.objectContaining({ method: 'POST' }),
    )
    expect(fetchSpy).toHaveBeenNthCalledWith(
      2,
      'https://api.x.com/2/users/me?user.fields=profile_image_url',
      expect.any(Object),
    )
  })

  it('rejects a failed token exchange', async () => {
    fetchSpy.mockResolvedValueOnce(response({}, { ok: false, status: 401 }))
    await expect(upsertXAccount('bad', 'https://example.com/callback', 'verifier')).rejects.toThrow(
      'X token exchange failed: 401',
    )
  })

  it('gives the token and profile calls fresh deadlines and maps an aborted provider request to 502', async () => {
    const parent = new AbortController()
    fetchSpy
      .mockResolvedValueOnce(
        response({
          access_token: 'access',
          token_type: 'bearer',
          scope: 'users.read',
        }),
      )
      .mockResolvedValueOnce(response({ data: { id: 'x-deadline', name: 'X', username: 'x' } }))

    await upsertXAccount('code', 'https://example.com/callback', 'verifier', {
      signal: parent.signal,
    })

    const signals = fetchSpy.mock.calls.map(([, init]) => (init as RequestInit).signal)
    expect(signals).toHaveLength(2)
    expect(new Set(signals).size).toBe(2)
    expect(signals).not.toContain(parent.signal)

    const abort = new DOMException('request timed out', 'TimeoutError')
    fetchSpy.mockReset()
    fetchSpy.mockRejectedValueOnce(abort)
    await expect(
      upsertXAccount('code', 'https://example.com/callback', 'verifier'),
    ).rejects.toMatchObject({ status: 502, cause: abort })
  })
})

function response(
  value: unknown,
  overrides: Partial<Pick<FetchResponse, 'ok' | 'status'>> = {},
): FetchResponse {
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve(value),
    ...overrides,
  } as FetchResponse
}
