import { afterAll, afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest'
import { createRandomString } from '@voucha/test-helpers'
import { createSign, generateKeyPairSync, randomUUID } from 'node:crypto'
import type { fetch as undiciFetch } from 'undici'
import {
  deleteTestOAuthAuthorizationFixtures,
  getTestOAuthAuthorization,
  insertTestOAuthAuthorization,
  markTestOAuthAuthorizationExchanging,
} from '@voucha/test-helpers/entities/oauth-authorizations'

const googleClientId = 'google-oauth-test-client'
const fetchSpy = vi.fn<typeof undiciFetch>()

vi.resetModules()
vi.doMock<typeof import('undici')>(import('undici'), async () => {
  const actual = await vi.importActual<typeof import('undici')>('undici')
  return { ...actual, fetch: fetchSpy }
})

const {
  getGoogleAccountByGoogleUserId,
  prepareGoogleAccount,
  upsertGoogleAuthorizationCodeAccount,
} = await import('./index.mts')

const { privateKey: googlePrivateKey, publicKey: googlePublicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
})
const googleJwk = googlePublicKey.export({ format: 'jwk' }) as Record<string, string>

describe('google oauth', () => {
  const googleUserId = `google-${createRandomString(10)}`
  const email = `tests+${createRandomString(8)}@voucha.ai`

  beforeEach(() => {
    vi.stubEnv('GOOGLE_CLIENT_ID', googleClientId)
    vi.stubEnv('GOOGLE_CLIENT_SECRET', 'google-server-secret')
  })

  afterEach(() => {
    fetchSpy.mockReset()
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  afterAll(() => {
    vi.doUnmock('undici')
  })

  it('upserts a google account from a signed credential', async () => {
    const credential = createSignedJwt(
      {
        kid: 'google-kid',
        alg: 'RS256',
      },
      {
        iss: 'https://accounts.google.com',
        aud: googleClientId,
        sub: googleUserId,
        email,
        email_verified: true,
        name: 'Google Test User',
        iat: Math.floor(Date.now() / 1000) - 60,
        exp: Math.floor(Date.now() / 1000) + 300,
      },
      jwks => {
        fetchSpy.mockResolvedValue({
          ok: true,
          json: () => Promise.resolve({ keys: [jwks] }),
        } as Awaited<ReturnType<typeof undiciFetch>>)
      },
    )

    const account = await (await prepareGoogleAccount(credential)).persist()

    expect(account.provider_user_id).toBe(googleUserId)
    expect(account.provider_user_email_address).toBe(email)

    const byId = await getGoogleAccountByGoogleUserId(googleUserId)
    expect(byId?.provider_user_id).toBe(googleUserId)
  })

  it('rejects credentials with an unsupported signing algorithm', async () => {
    const credential = createUnsignedJwt(
      { kid: 'google-kid', alg: 'HS256' },
      {
        iss: 'https://accounts.google.com',
        aud: googleClientId,
        sub: 'unsupported-alg',
        iat: Math.floor(Date.now() / 1000) - 60,
        exp: Math.floor(Date.now() / 1000) + 300,
      },
    )

    await expect(prepareGoogleAccount(credential)).rejects.toThrow('unsupported algorithm')
  })

  it('redeems the broker code with server secret and PKCE, then completes by stable sub', async () => {
    const googleUserId = `google-broker-${createRandomString(12)}`
    const authorizationId = await insertTestOAuthAuthorization({ provider: 'google' })
    onTestFinished(() =>
      deleteTestOAuthAuthorizationFixtures({
        authorizationIds: [authorizationId],
        googleUserIds: [googleUserId],
      }),
    )
    const authorizationClaimId = randomUUID()
    await markTestOAuthAuthorizationExchanging(authorizationId, authorizationClaimId)
    fetchSpy
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ access_token: 'google-access-token' }),
      } as Awaited<ReturnType<typeof undiciFetch>>)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            sub: googleUserId,
            email: 'unverified@example.test',
            email_verified: false,
            name: 'Google Broker User',
            picture: 'https://example.com/google-user.png',
            given_name: 'Google',
            family_name: 'Broker User',
          }),
      } as Awaited<ReturnType<typeof undiciFetch>>)

    const account = await upsertGoogleAuthorizationCodeAccount(
      'authorization-code',
      'https://example.com/auth/callback/google/broker',
      'server-pkce-verifier',
      { authorizationId, authorizationClaimId },
    )
    expect(account.provider_user_id).toBe(googleUserId)
    expect(account.provider_user_email_address).toBeNull()
    expect(account.provider_user_data).toMatchObject({
      name: 'Google Broker User',
      email: 'unverified@example.test',
      picture: 'https://example.com/google-user.png',
      given_name: 'Google',
      family_name: 'Broker User',
    })
    expect(await getTestOAuthAuthorization(authorizationId)).toMatchObject({
      status: 'completion_ready',
      google_account_id: account.account_id,
      callback_code_ciphertext: null,
      exchange_claim_id: null,
    })
    expect(fetchSpy).toHaveBeenCalledTimes(2)
    const [tokenUrl, tokenInit] = fetchSpy.mock.calls[0]!
    expect(tokenUrl).toBe('https://oauth2.googleapis.com/token')
    const tokenBody = tokenInit?.body
    if (typeof tokenBody !== 'string') throw new Error('Expected encoded Google token form body')
    expect(Object.fromEntries(new URLSearchParams(tokenBody))).toMatchObject({
      grant_type: 'authorization_code',
      code: 'authorization-code',
      redirect_uri: 'https://example.com/auth/callback/google/broker',
      client_id: googleClientId,
      client_secret: 'google-server-secret',
      code_verifier: 'server-pkce-verifier',
    })
    expect(fetchSpy.mock.calls[1]).toEqual([
      'https://openidconnect.googleapis.com/v1/userinfo',
      expect.objectContaining({ headers: { Authorization: 'Bearer google-access-token' } }),
    ])
  })

  it('propagates cancellation through token and UserInfo fetches before account persistence', async () => {
    const googleUserId = `google-aborted-${createRandomString(12)}`
    const authorizationId = await insertTestOAuthAuthorization({ provider: 'google' })
    const authorizationClaimId = randomUUID()
    onTestFinished(() =>
      deleteTestOAuthAuthorizationFixtures({
        authorizationIds: [authorizationId],
        googleUserIds: [googleUserId],
      }),
    )
    await markTestOAuthAuthorizationExchanging(authorizationId, authorizationClaimId)
    const controller = new AbortController()
    const aborted = new Error('Google callback cancelled')
    fetchSpy
      .mockImplementationOnce(async (_input, init) => {
        expect(init?.signal).toBe(controller.signal)
        return {
          ok: true,
          status: 200,
          json: () => Promise.resolve({ access_token: 'google-access-token' }),
        } as Awaited<ReturnType<typeof undiciFetch>>
      })
      .mockImplementationOnce(async (_input, init) => {
        expect(init?.signal).toBe(controller.signal)
        controller.abort(aborted)
        return {
          ok: true,
          status: 200,
          json: () => Promise.resolve({ sub: googleUserId, email_verified: false }),
        } as Awaited<ReturnType<typeof undiciFetch>>
      })

    await expect(
      upsertGoogleAuthorizationCodeAccount(
        'authorization-code',
        'https://example.com/auth/callback/google/broker',
        'server-pkce-verifier',
        { authorizationId, authorizationClaimId, signal: controller.signal },
      ),
    ).rejects.toBe(aborted)

    expect(fetchSpy).toHaveBeenCalledTimes(2)
    expect(await getGoogleAccountByGoogleUserId(googleUserId)).toBeNull()
    expect(await getTestOAuthAuthorization(authorizationId)).toMatchObject({
      status: 'exchanging',
      google_account_id: null,
      exchange_claim_id: authorizationClaimId,
    })
  })

  it('rejects malformed token and UserInfo payloads before account persistence', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ access_token: 42 }),
    } as Awaited<ReturnType<typeof undiciFetch>>)
    await expect(
      upsertGoogleAuthorizationCodeAccount(
        'authorization-code',
        'https://example.com/auth/callback/google/broker',
        'server-pkce-verifier',
      ),
    ).rejects.toMatchObject({ status: 502 })

    fetchSpy.mockReset()
    fetchSpy
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ access_token: 'google-access-token' }),
      } as Awaited<ReturnType<typeof undiciFetch>>)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve(null),
      } as Awaited<ReturnType<typeof undiciFetch>>)
    await expect(
      upsertGoogleAuthorizationCodeAccount(
        'authorization-code',
        'https://example.com/auth/callback/google/broker',
        'server-pkce-verifier',
      ),
    ).rejects.toMatchObject({ status: 502 })
    expect(fetchSpy).toHaveBeenCalledTimes(2)
  })
})

function createSignedJwt(
  header: Record<string, unknown>,
  payload: Record<string, unknown>,
  stubFetch: (jwk: Record<string, string>) => void,
): string {
  stubFetch({
    kid: String(header.kid),
    alg: 'RS256',
    use: 'sig',
    kty: googleJwk.kty,
    n: googleJwk.n,
    e: googleJwk.e,
  })

  const encodedHeader = encodeJwtPart(header)
  const encodedPayload = encodeJwtPart(payload)
  const signer = createSign('RSA-SHA256')
  signer.update(`${encodedHeader}.${encodedPayload}`)
  signer.end()
  const signature = signer.sign(googlePrivateKey).toString('base64url')

  return `${encodedHeader}.${encodedPayload}.${signature}`
}

function createUnsignedJwt(
  header: Record<string, unknown>,
  payload: Record<string, unknown>,
): string {
  return `${encodeJwtPart(header)}.${encodeJwtPart(payload)}.signature`
}

function encodeJwtPart(value: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url')
}
