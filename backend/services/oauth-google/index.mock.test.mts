import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRandomString } from '@voucha/test-helpers'
import { createSign, generateKeyPairSync } from 'node:crypto'
import type { fetch as undiciFetch } from 'undici'

const googleClientId = 'google-oauth-test-client'
const fetchSpy = vi.fn<typeof undiciFetch>()

vi.resetModules()
vi.doMock<typeof import('undici')>(import('undici'), async () => {
  const actual = await vi.importActual<typeof import('undici')>('undici')
  return { ...actual, fetch: fetchSpy }
})

const { getGoogleAccountByGoogleUserId, upsertGoogleAccount } = await import('./index.mts')

const { privateKey: googlePrivateKey, publicKey: googlePublicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
})
const googleJwk = googlePublicKey.export({ format: 'jwk' }) as Record<string, string>

describe('google oauth', () => {
  const googleUserId = `google-${createRandomString(10)}`
  const email = `tests+${createRandomString(8)}@voucha.ai`

  beforeEach(() => {
    vi.stubEnv('GOOGLE_CLIENT_ID', googleClientId)
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

    const account = await upsertGoogleAccount(credential)

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

    await expect(upsertGoogleAccount(credential)).rejects.toThrow('unsupported algorithm')
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
