import { afterAll, afterEach, describe, expect, it, vi } from 'vitest'
import { createRandomString } from '@voucha/test-helpers'
import type { fetch as undiciFetch } from 'undici'

type FetchResponse = Awaited<ReturnType<typeof undiciFetch>>

const fetchSpy = vi.fn<VitestLooseMock>()
vi.stubEnv('FACEBOOK_APP_ID', 'test-facebook-client')
vi.stubEnv('FACEBOOK_APP_SECRET', 'test-facebook-secret')
vi.resetModules()
vi.doMock<typeof import('undici')>(import('undici'), async () => {
  const actual = await vi.importActual<typeof import('undici')>('undici')
  return { ...actual, fetch: fetchSpy }
})

const { upsertFacebookAuthorizationCodeAccount } = await import('../index.mts')

function jsonResponse(value: unknown): FetchResponse {
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve(value),
  } as FetchResponse
}

function errorResponse(status: number): FetchResponse {
  return {
    ok: false,
    status,
  } as FetchResponse
}

describe('upsertFacebookAuthorizationCodeAccount', () => {
  afterEach(() => {
    fetchSpy.mockReset()
  })

  afterAll(() => {
    vi.unstubAllEnvs()
    vi.doUnmock('undici')
  })

  it('keeps the app secret out of token endpoint URLs', async () => {
    const providerUserId = `facebook-broker-${createRandomString(10)}`
    fetchSpy
      .mockResolvedValueOnce(jsonResponse({ access_token: 'short-token' }))
      .mockResolvedValueOnce(jsonResponse({ access_token: 'long-token', expires_in: 3600 }))
      .mockResolvedValueOnce(
        jsonResponse({
          id: providerUserId,
          name: 'Facebook Broker User',
          email: `tests+${providerUserId}@voucha.ai`,
        }),
      )

    await expect(
      upsertFacebookAuthorizationCodeAccount(
        'provider-code',
        'https://example.com/auth/callback/facebook/broker',
      ),
    ).resolves.toMatchObject({ provider_user_id: providerUserId })

    for (const callIndex of [0, 1]) {
      const [url, init] = fetchSpy.mock.calls[callIndex]!
      expect(url).toMatch(/^https:\/\/graph\.facebook\.com\/v[0-9.]+\/oauth\/access_token$/)
      expect(url).not.toContain('test-facebook-secret')
      expect(init).toMatchObject({
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      })
      expect(String(init?.body)).toContain('client_secret=test-facebook-secret')
    }
  })

  it('maps an authorization endpoint failure to a provider-safe gateway error', async () => {
    fetchSpy.mockResolvedValueOnce(errorResponse(503))

    await expect(
      upsertFacebookAuthorizationCodeAccount(
        'provider-code',
        'https://example.com/auth/callback/facebook/broker',
      ),
    ).rejects.toMatchObject({
      status: 502,
      message: 'Facebook authorization code exchange failed: 503',
    })
  })

  it('preserves a Facebook authorization error as the gateway error cause', async () => {
    fetchSpy.mockResolvedValueOnce(
      jsonResponse({
        error: { message: 'authorization code expired', type: 'OAuthException' },
      }),
    )

    const error = await upsertFacebookAuthorizationCodeAccount(
      'provider-code',
      'https://example.com/auth/callback/facebook/broker',
    ).catch(caught => caught as Error & { status: number })

    expect(error).toMatchObject({
      status: 502,
      message: 'Facebook authorization code exchange failed',
      cause: expect.objectContaining({ message: 'authorization code expired' }),
    })
  })
})
