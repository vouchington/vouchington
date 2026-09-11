import { afterEach, describe, expect, it, vi } from 'vitest'
import { createRandomString } from '@voucha/test-helpers'
import type { fetch as undiciFetch } from 'undici'

type FetchResponse = Awaited<ReturnType<typeof undiciFetch>>
const fetchSpy = vi.fn<VitestLooseMock>()
vi.resetModules()
vi.doMock<typeof import('undici')>(import('undici'), async importOriginal => ({
  ...(await importOriginal()),
  fetch: fetchSpy,
}))
const { upsertGithubAccount } = await import('../index.mts')

describe('upsertGithubAccount', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    fetchSpy.mockReset()
  })

  it('exchanges a code, loads the profile and persists only a verified primary email', async () => {
    const login = `github-${createRandomString(8)}`
    fetchSpy
      .mockResolvedValueOnce(
        response({ access_token: 'token', token_type: 'bearer', scope: 'read:user' }),
      )
      .mockResolvedValueOnce(
        response({ id: 42, login, name: 'Test User', avatar_url: 'https://example.com/avatar' }),
      )
      .mockResolvedValueOnce(
        response([{ email: `tests+${login}@voucha.ai`, primary: true, verified: true }]),
      )

    const account = await upsertGithubAccount('code', 'https://example.com/callback')

    expect(account).toMatchObject({
      provider_user_id: '42',
      provider_user_email_address: `tests+${login}@voucha.ai`,
    })
    expect(fetchSpy).toHaveBeenNthCalledWith(
      1,
      'https://github.com/login/oauth/access_token',
      expect.objectContaining({ method: 'POST' }),
    )
    expect(fetchSpy).toHaveBeenNthCalledWith(2, 'https://api.github.com/user', expect.any(Object))
    expect(fetchSpy).toHaveBeenNthCalledWith(
      3,
      'https://api.github.com/user/emails',
      expect.any(Object),
    )
  })

  it('does not persist an unverified email and rejects failed provider requests', async () => {
    const login = `unverified-${createRandomString(8)}`
    fetchSpy
      .mockResolvedValueOnce(
        response({ access_token: 'token', token_type: 'bearer', scope: 'read:user' }),
      )
      .mockResolvedValueOnce(response({ id: 43, login, name: null }))
      .mockResolvedValueOnce(
        response([{ email: `tests+${login}@voucha.ai`, primary: true, verified: false }]),
      )
    await expect(
      upsertGithubAccount('code', 'https://example.com/callback'),
    ).resolves.toMatchObject({ provider_user_email_address: null })

    fetchSpy.mockReset()
    fetchSpy.mockResolvedValueOnce(response({}, { ok: false, status: 401 }))
    await expect(upsertGithubAccount('bad-code', 'https://example.com/callback')).rejects.toThrow(
      'GitHub token exchange failed: 401',
    )
  })

  it('gives the token and profile calls fresh deadlines and maps an aborted provider request to 502', async () => {
    const login = `deadline-${createRandomString(8)}`
    const parent = new AbortController()
    fetchSpy
      .mockResolvedValueOnce(
        response({ access_token: 'token', token_type: 'bearer', scope: 'read:user' }),
      )
      .mockResolvedValueOnce(response({ id: 44, login, name: login }))
      .mockResolvedValueOnce(response([]))

    await upsertGithubAccount('code', 'https://example.com/callback', { signal: parent.signal })

    const signals = fetchSpy.mock.calls.map(([, init]) => (init as RequestInit).signal)
    expect(signals).toHaveLength(3)
    expect(new Set(signals).size).toBe(3)
    expect(signals).not.toContain(parent.signal)

    const abort = new DOMException('request timed out', 'TimeoutError')
    fetchSpy.mockReset()
    fetchSpy.mockRejectedValueOnce(abort)
    await expect(upsertGithubAccount('code', 'https://example.com/callback')).rejects.toMatchObject(
      {
        status: 502,
        cause: abort,
      },
    )
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
