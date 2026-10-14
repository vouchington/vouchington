import { randomUUID } from 'node:crypto'
import { afterAll, afterEach, describe, expect, it, onTestFinished, vi } from 'vitest'
import type { fetch as undiciFetch } from 'undici'
import {
  deleteTestOAuthAuthorizationFixtures,
  getTestOAuthAuthorization,
  insertTestOAuthAuthorization,
  markTestOAuthAuthorizationExchanging,
} from '@voucha/test-helpers/entities/oauth-authorizations'

type FetchResponse = Awaited<ReturnType<typeof undiciFetch>>
const fetchSpy = vi.fn<VitestLooseMock>()
vi.stubEnv('MICROSOFT_CLIENT_ID', 'test-microsoft-client')
vi.stubEnv('MICROSOFT_CLIENT_SECRET', 'test-microsoft-secret')
vi.stubEnv('MICROSOFT_TENANT_ID', 'common')
vi.resetModules()
vi.doMock<typeof import('undici')>(import('undici'), async importOriginal => ({
  ...(await importOriginal()),
  fetch: fetchSpy,
}))
const { upsertMicrosoftAccount } = await import('./index.mts')

describe('Microsoft broker provider exchange', () => {
  afterEach(() => fetchSpy.mockReset())
  afterAll(() => {
    vi.unstubAllEnvs()
    vi.doUnmock('undici')
  })

  it('uses server-held PKCE and atomically completes the claimed native flow', async () => {
    const providerUserId = `microsoft-broker-${randomUUID()}`
    const authorizationId = await insertTestOAuthAuthorization({ provider: 'microsoft' })
    onTestFinished(() =>
      deleteTestOAuthAuthorizationFixtures({
        authorizationIds: [authorizationId],
        microsoftUserIds: [providerUserId],
      }),
    )
    const authorizationClaimId = randomUUID()
    await markTestOAuthAuthorizationExchanging(authorizationId, authorizationClaimId)
    fetchSpy
      .mockResolvedValueOnce(response({ access_token: 'microsoft-access', expires_in: 3600 }))
      .mockResolvedValueOnce(response({ id: providerUserId, displayName: 'Microsoft Member' }))
    const cancellation = new AbortController()

    const account = await upsertMicrosoftAccount(
      'provider-code',
      'https://example.com/auth/callback/microsoft/broker',
      'server-held-verifier',
      { authorizationId, authorizationClaimId, signal: cancellation.signal },
    )

    expect(account).toMatchObject({ provider_user_id: providerUserId })
    expect(await getTestOAuthAuthorization(authorizationId)).toMatchObject({
      status: 'completion_ready',
      microsoft_user_id: providerUserId,
      callback_code_ciphertext: null,
      exchange_claim_id: null,
    })
    const [tokenUrl, tokenInit] = fetchSpy.mock.calls[0]!
    expect(tokenUrl).toBe('https://login.microsoftonline.com/common/oauth2/v2.0/token')
    expect(tokenInit).toMatchObject({ method: 'POST', signal: cancellation.signal })
    expect(Object.fromEntries(new URLSearchParams(String(tokenInit.body)))).toMatchObject({
      grant_type: 'authorization_code',
      code: 'provider-code',
      redirect_uri: 'https://example.com/auth/callback/microsoft/broker',
      client_id: 'test-microsoft-client',
      client_secret: 'test-microsoft-secret',
      code_verifier: 'server-held-verifier',
    })
    expect(fetchSpy.mock.calls[1]).toEqual([
      'https://graph.microsoft.com/v1.0/me',
      expect.objectContaining({
        headers: { Authorization: 'Bearer microsoft-access' },
        signal: cancellation.signal,
      }),
    ])
  })

  it('preserves the existing web code verifier and ordinary account upsert', async () => {
    const providerUserId = `microsoft-web-${randomUUID()}`
    onTestFinished(() =>
      deleteTestOAuthAuthorizationFixtures({ microsoftUserIds: [providerUserId] }),
    )
    fetchSpy
      .mockResolvedValueOnce(response({ access_token: 'web-access' }))
      .mockResolvedValueOnce(response({ id: providerUserId }))

    await upsertMicrosoftAccount(
      'web-code',
      'https://example.com/auth/callback/microsoft',
      'web-pkce-verifier',
    )

    const tokenInit = fetchSpy.mock.calls[0]![1]
    expect(new URLSearchParams(String(tokenInit.body)).get('code_verifier')).toBe(
      'web-pkce-verifier',
    )
  })
})

function response(value: unknown): FetchResponse {
  return { ok: true, status: 200, json: () => Promise.resolve(value) } as FetchResponse
}
