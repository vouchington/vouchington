import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import {
  createMicrosoftIdentitySigningFixture,
  getMicrosoftFixtureRequestUrl,
} from '@voucha/test-helpers/microsoft-identity-token'
import { afterAll, afterEach, describe, expect, it, onTestFinished, vi } from 'vitest'
import type { fetch as undiciFetch } from 'undici'
import { createRandomEmailAddress } from '@voucha/test-helpers'
import {
  deleteTestOAuthAuthorizationFixtures,
  getTestOAuthAuthorization,
  insertTestOAuthAuthorization,
  markTestOAuthAuthorizationExchanging,
} from '@voucha/test-helpers/entities/oauth-authorizations'

type FetchResponse = Awaited<ReturnType<typeof undiciFetch>>
const fetchSpy = vi.fn<typeof undiciFetch>()
vi.stubEnv('MICROSOFT_CLIENT_ID', 'test-microsoft-client')
vi.stubEnv('MICROSOFT_CLIENT_SECRET', 'test-microsoft-secret')
vi.stubEnv('MICROSOFT_TENANT_ID', 'common')
vi.resetModules()
vi.doMock<typeof import('undici')>(import('undici'), async importOriginal => ({
  ...(await importOriginal()),
  fetch: fetchSpy,
}))
const { publicKey, keyId, signToken } = createMicrosoftIdentitySigningFixture()
const { upsertMicrosoftAccount } = await import('./index.mts')

function mockProvider(
  providerUserId: string,
  idToken: string,
  graph: Record<string, unknown> = {},
) {
  fetchSpy.mockImplementation(async url => {
    const href = getMicrosoftFixtureRequestUrl(url)
    if (href.endsWith('/token'))
      return response({ access_token: 'microsoft-access', expires_in: 3600, id_token: idToken })
    if (href.endsWith('/keys'))
      return response({ keys: [{ ...publicKey.export({ format: 'jwk' }), kid: keyId }] })
    return response({ id: providerUserId, ...graph })
  })
}

describe('Microsoft provider adapter', () => {
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
    mockProvider(providerUserId, signToken({ oid: providerUserId }), {
      displayName: 'Microsoft Member',
    })
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
      microsoft_account_id: account.account_id,
      callback_code_ciphertext: null,
      exchange_claim_id: null,
    })
    const [tokenUrl, tokenInit] = fetchSpy.mock.calls[0]!
    expect(tokenUrl).toBe('https://login.microsoftonline.com/common/oauth2/v2.0/token')
    assert(typeof tokenInit?.body === 'string')
    expect(Object.fromEntries(new URLSearchParams(tokenInit.body))).toMatchObject({
      code: 'provider-code',
      client_id: 'test-microsoft-client',
      client_secret: 'test-microsoft-secret',
      code_verifier: 'server-held-verifier',
    })
  })

  it.each([undefined, false, true, 'true'] as const)(
    'stores token email only with verified ownership (%s)',
    async verification => {
      const providerUserId = randomUUID()
      onTestFinished(() =>
        deleteTestOAuthAuthorizationFixtures({ microsoftUserIds: [providerUserId] }),
      )
      const verifiedEmail = createRandomEmailAddress()
      const graphEmail = createRandomEmailAddress()
      mockProvider(
        providerUserId,
        signToken({ oid: providerUserId, email: verifiedEmail, xms_edov: verification }),
        { mail: graphEmail },
      )

      const account = await upsertMicrosoftAccount(
        'code',
        'https://example.com/callback',
        'verifier',
      )

      expect(account.provider_user_email_address).toBe(verification === true ? verifiedEmail : null)
    },
  )

  it('rejects an identity token minted for another client', async () => {
    const providerUserId = randomUUID()
    mockProvider(
      providerUserId,
      signToken({
        oid: providerUserId,
        aud: 'other-client',
        email: createRandomEmailAddress(),
        xms_edov: true,
      }),
    )

    await expect(
      upsertMicrosoftAccount('code', 'https://example.com/callback', 'verifier'),
    ).rejects.toMatchObject({ status: 401 })
  })

  it('fails closed without client credentials', async () => {
    vi.stubEnv('MICROSOFT_CLIENT_ID', '')
    vi.resetModules()
    const { upsertMicrosoftAccount: unconfigured } = await import('./index.mts')

    await expect(unconfigured('code', 'https://example.com', 'verifier')).rejects.toThrow(
      'MICROSOFT_CLIENT_ID and MICROSOFT_CLIENT_SECRET must be defined',
    )
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})

function response(value: unknown): FetchResponse {
  return { ok: true, status: 200, json: () => Promise.resolve(value) } as FetchResponse
}
