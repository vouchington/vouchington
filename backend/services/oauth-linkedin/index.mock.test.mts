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
vi.stubEnv('LINKEDIN_CLIENT_ID', 'test-linkedin-client')
vi.stubEnv('LINKEDIN_CLIENT_SECRET', 'test-linkedin-secret')
vi.resetModules()
vi.doMock<typeof import('undici')>(import('undici'), async importOriginal => ({
  ...(await importOriginal()),
  fetch: fetchSpy,
}))
const { upsertLinkedInAccount } = await import('./index.mts')

describe('LinkedIn broker provider exchange', () => {
  afterEach(() => fetchSpy.mockReset())
  afterAll(() => {
    vi.unstubAllEnvs()
    vi.doUnmock('undici')
  })

  it('uses a confidential server exchange and atomically completes the claimed native flow', async () => {
    const providerUserId = `linkedin-broker-${randomUUID()}`
    const authorizationId = await insertTestOAuthAuthorization({ provider: 'linkedin' })
    onTestFinished(() =>
      deleteTestOAuthAuthorizationFixtures({
        authorizationIds: [authorizationId],
        linkedinUserIds: [providerUserId],
      }),
    )
    const authorizationClaimId = randomUUID()
    await markTestOAuthAuthorizationExchanging(authorizationId, authorizationClaimId)
    fetchSpy
      .mockResolvedValueOnce(response({ access_token: 'linked-access', expires_in: 3600 }))
      .mockResolvedValueOnce(
        response({ sub: providerUserId, name: 'LinkedIn Member', email_verified: true }),
      )
    const cancellation = new AbortController()

    const account = await upsertLinkedInAccount(
      'provider-code',
      'https://example.com/auth/callback/linkedin/broker',
      undefined,
      { authorizationId, authorizationClaimId, signal: cancellation.signal },
    )

    expect(account).toMatchObject({ provider_user_id: providerUserId })
    expect(account.account_id).toMatch(/^[0-9a-f-]{36}$/)
    expect(await getTestOAuthAuthorization(authorizationId)).toMatchObject({
      status: 'completion_ready',
      linkedin_account_id: account.account_id,
      callback_code_ciphertext: null,
      exchange_claim_id: null,
    })
    const [tokenUrl, tokenInit] = fetchSpy.mock.calls[0]!
    expect(tokenUrl).toBe('https://www.linkedin.com/oauth/v2/accessToken')
    expect(tokenInit).toMatchObject({ method: 'POST', signal: expect.any(AbortSignal) })
    const body = new URLSearchParams(String(tokenInit.body))
    expect(Object.fromEntries(body)).toMatchObject({
      grant_type: 'authorization_code',
      code: 'provider-code',
      redirect_uri: 'https://example.com/auth/callback/linkedin/broker',
      client_id: 'test-linkedin-client',
      client_secret: 'test-linkedin-secret',
    })
    expect(body.has('code_verifier')).toBe(false)
    expect(fetchSpy.mock.calls[1]).toEqual([
      'https://api.linkedin.com/v2/userinfo',
      expect.objectContaining({
        headers: { Authorization: 'Bearer linked-access' },
        signal: expect.any(AbortSignal),
      }),
    ])
  })

  it('keeps the existing web PKCE verifier in LinkedIn token requests', async () => {
    const providerUserId = `linkedin-web-${randomUUID()}`
    onTestFinished(() =>
      deleteTestOAuthAuthorizationFixtures({ linkedinUserIds: [providerUserId] }),
    )
    fetchSpy
      .mockResolvedValueOnce(response({ access_token: 'web-access' }))
      .mockResolvedValueOnce(response({ sub: providerUserId }))

    await upsertLinkedInAccount(
      'web-code',
      'https://example.com/auth/callback/linkedin',
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
