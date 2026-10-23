import assert from 'node:assert/strict'
import { randomUUID, generateKeyPairSync } from 'node:crypto'
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
const { privateKey, publicKey, keyId, signToken } = createMicrosoftIdentitySigningFixture()
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
    expect(account.account_id).toMatch(/^[0-9a-f-]{36}$/i)
    expect(await getTestOAuthAuthorization(authorizationId)).toMatchObject({
      status: 'completion_ready',
      microsoft_account_id: account.account_id,
      callback_code_ciphertext: null,
      exchange_claim_id: null,
    })
    const [tokenUrl, tokenInit] = fetchSpy.mock.calls[0]!
    expect(tokenUrl).toBe('https://login.microsoftonline.com/common/oauth2/v2.0/token')
    expect(tokenInit).toMatchObject({ method: 'POST', signal: cancellation.signal })
    assert(typeof tokenInit?.body === 'string')
    expect(Object.fromEntries(new URLSearchParams(tokenInit.body))).toMatchObject({
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
      .mockResolvedValueOnce(response({ id: providerUserId, mail: createRandomEmailAddress() }))

    const account = await upsertMicrosoftAccount(
      'web-code',
      'https://example.com/auth/callback/microsoft',
      'web-pkce-verifier',
    )

    expect(account.provider_user_email_address).toBeNull()
    const tokenInit = fetchSpy.mock.calls[0]![1]
    assert(typeof tokenInit?.body === 'string')
    expect(new URLSearchParams(tokenInit.body).get('code_verifier')).toBe('web-pkce-verifier')
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
      const token = signToken({
        oid: providerUserId,
        email: verifiedEmail,
        xms_edov: verification,
      })
      fetchSpy.mockImplementation(async url => {
        if (getMicrosoftFixtureRequestUrl(url).endsWith('/token'))
          return response({ access_token: 'access', id_token: token })
        if (getMicrosoftFixtureRequestUrl(url).endsWith('/keys'))
          return response({ keys: [{ ...publicKey.export({ format: 'jwk' }), kid: keyId }] })
        return response({ id: providerUserId, mail: graphEmail })
      })
      const account = await upsertMicrosoftAccount(
        'code',
        'https://example.com/callback',
        'verifier',
      )
      expect(account.provider_user_email_address).toBe(verification === true ? verifiedEmail : null)
      expect(account.provider_user_data).not.toHaveProperty('email', graphEmail)
    },
  )

  it.each([
    { aud: 'other-client' },
    { oid: randomUUID() },
    { iss: 'https://example.com' },
    { exp: 1 },
    { nbf: Math.floor(Date.now() / 1000) + 3600 },
    { nbf: 'invalid' },
    { tid: null },
  ])('rejects token claims that do not bind the email to this exchange (%j)', async override => {
    const providerUserId = randomUUID()
    fetchSpy.mockImplementation(async url => {
      if (getMicrosoftFixtureRequestUrl(url).endsWith('/token'))
        return response({
          access_token: 'access',
          id_token: signToken({
            oid: providerUserId,
            email: createRandomEmailAddress(),
            xms_edov: true,
            ...override,
          }),
        })
      if (getMicrosoftFixtureRequestUrl(url).endsWith('/keys'))
        return response({ keys: [{ ...publicKey.export({ format: 'jwk' }), kid: keyId }] })
      return response({ id: providerUserId })
    })
    await expect(
      upsertMicrosoftAccount('code', 'https://example.com/callback', 'verifier'),
    ).rejects.toMatchObject({ status: 401 })
  })
  it.each([true, false])('validates signing-key issuer metadata (matching=%s)', async matches => {
    const providerUserId = randomUUID()
    const signingKeyId = randomUUID()
    const email = createRandomEmailAddress()
    onTestFinished(() =>
      deleteTestOAuthAuthorizationFixtures({ microsoftUserIds: [providerUserId] }),
    )
    const idToken = signToken({ oid: providerUserId, email, xms_edov: true }, privateKey, {
      kid: signingKeyId,
    })
    fetchSpy.mockImplementation(async url => {
      if (getMicrosoftFixtureRequestUrl(url).endsWith('/token'))
        return response({ access_token: 'access', id_token: idToken })
      if (getMicrosoftFixtureRequestUrl(url).endsWith('/keys'))
        return response({
          keys: [
            {
              ...publicKey.export({ format: 'jwk' }),
              kid: signingKeyId,
              issuer: matches
                ? 'https://login.microsoftonline.com/{tenantid}/v2.0'
                : 'https://example.com/v2.0',
            },
          ],
        })
      return response({ id: providerUserId })
    })
    const exchange = upsertMicrosoftAccount('code', 'https://example.com/callback', 'verifier')
    const outcome = await exchange.then(
      account => ({ email: account.provider_user_email_address }),
      (err: unknown) => ({ error: err }),
    )
    expect(outcome).toMatchObject(matches ? { email } : { error: { status: 401 } })
  })

  it('rejects an identity token signed by a different key', async () => {
    const providerUserId = randomUUID()
    const otherKey = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey
    const idToken = signToken(
      { oid: providerUserId, email: createRandomEmailAddress(), xms_edov: true },
      otherKey,
    )
    fetchSpy.mockImplementation(async url => {
      if (getMicrosoftFixtureRequestUrl(url).endsWith('/token'))
        return response({ access_token: 'access', id_token: idToken })
      if (getMicrosoftFixtureRequestUrl(url).endsWith('/keys'))
        return response({ keys: [{ ...publicKey.export({ format: 'jwk' }), kid: keyId }] })
      return response({ id: providerUserId })
    })
    await expect(
      upsertMicrosoftAccount('code', 'https://example.com/callback', 'verifier'),
    ).rejects.toMatchObject({
      status: 401,
      message: 'Microsoft identity token signature is invalid',
    })
  })
})

function response(value: unknown): FetchResponse {
  return { ok: true, status: 200, json: () => Promise.resolve(value) } as FetchResponse
}
