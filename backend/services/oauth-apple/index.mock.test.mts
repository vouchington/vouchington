import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createHash } from 'node:crypto'
import { createRandomString } from '@voucha/test-helpers'
import { createSignedJwt, makeAppleJwk, makeFetchResponse } from './test-helpers.mts'
import type { fetch as undiciFetch } from 'undici'

const fetchSpy = vi.fn<typeof undiciFetch>()
const appleClientId = 'test-apple-client'
const nativeAppleClientId = 'ai.voucha.test-native'
const originalAppleClientId = process.env.APPLE_CLIENT_ID
const originalAppleNativeClientIds = process.env.APPLE_NATIVE_CLIENT_IDS
process.env.APPLE_CLIENT_ID = appleClientId
process.env.APPLE_NATIVE_CLIENT_IDS = nativeAppleClientId

let upsertAppleAccount: typeof import('./index.mts').upsertAppleAccount
let getAppleAccountByAppleUserId: typeof import('./index.mts').getAppleAccountByAppleUserId

describe('apple oauth', () => {
  beforeEach(async () => {
    fetchSpy.mockReset()
    vi.resetModules()
    vi.doMock<typeof import('undici')>(import('undici'), async () => {
      const actual = await vi.importActual<typeof import('undici')>('undici')
      return { ...actual, fetch: fetchSpy }
    })
    const service = await import('./index.mts')
    upsertAppleAccount = service.upsertAppleAccount
    getAppleAccountByAppleUserId = service.getAppleAccountByAppleUserId
  })

  afterAll(() => {
    if (originalAppleClientId === undefined) {
      delete process.env.APPLE_CLIENT_ID
    } else {
      process.env.APPLE_CLIENT_ID = originalAppleClientId
    }
    if (originalAppleNativeClientIds === undefined) {
      delete process.env.APPLE_NATIVE_CLIENT_IDS
    } else {
      process.env.APPLE_NATIVE_CLIENT_IDS = originalAppleNativeClientIds
    }
  })

  describe('functional', () => {
    const appleUserId = `apple-${createRandomString(10)}`
    const email = `tests+${createRandomString(8)}@voucha.ai`

    it('upserts an apple account and validates the nonce claim', async () => {
      const nonce = createRandomString(12)
      const credential = createSignedJwt(
        { kid: 'apple-kid', alg: 'RS256' },
        {
          iss: 'https://appleid.apple.com',
          aud: appleClientId,
          sub: appleUserId,
          email,
          email_verified: 'true',
          nonce: createHash('sha256').update(nonce).digest('hex'),
          iat: Math.floor(Date.now() / 1000) - 60,
          exp: Math.floor(Date.now() / 1000) + 300,
        },
        jwks => {
          fetchSpy.mockResolvedValueOnce(makeFetchResponse(jwks))
        },
      )

      const account = await upsertAppleAccount(credential, { name: 'Apple Test User' }, nonce)

      expect(account.provider_user_id).toBe(appleUserId)
      expect(account.provider_user_email_address).toBe(email)
      expect(fetchSpy).toHaveBeenCalledWith(
        'https://appleid.apple.com/auth/keys',
        expect.objectContaining({ dispatcher: expect.anything(), signal: expect.any(AbortSignal) }),
      )

      const byId = await getAppleAccountByAppleUserId(appleUserId)
      expect(byId?.provider_user_id).toBe(appleUserId)
    })

    it('preserves one-time profile data when distinct tokens converge on one subject', async () => {
      const subject = `apple-distinct-tokens-${createRandomString(10)}`
      const subjectEmail = `tests+${createRandomString(8)}@voucha.ai`
      const firstNonce = createRandomString(12)
      const secondNonce = createRandomString(12)
      const issuedAt = Math.floor(Date.now() / 1000)
      const firstCredential = createSignedJwt(
        { kid: 'apple-kid', alg: 'RS256' },
        {
          iss: 'https://appleid.apple.com',
          aud: appleClientId,
          sub: subject,
          email: subjectEmail,
          email_verified: 'true',
          nonce: createHash('sha256').update(firstNonce).digest('hex'),
          iat: issuedAt - 60,
          exp: issuedAt + 300,
        },
        jwks => {
          fetchSpy.mockResolvedValueOnce(makeFetchResponse(jwks))
        },
      )
      const secondCredential = createSignedJwt(
        { kid: 'apple-kid', alg: 'RS256' },
        {
          iss: 'https://appleid.apple.com',
          aud: appleClientId,
          sub: subject,
          email: subjectEmail,
          email_verified: 'true',
          nonce: createHash('sha256').update(secondNonce).digest('hex'),
          iat: issuedAt - 60,
          exp: issuedAt + 300,
        },
      )

      const firstAccount = await upsertAppleAccount(
        firstCredential,
        { name: 'Apple Recovery User' },
        firstNonce,
      )
      const secondAccount = await upsertAppleAccount(secondCredential, undefined, secondNonce)

      expect(secondCredential).not.toBe(firstCredential)
      expect(secondAccount).toEqual(firstAccount)
      expect(secondAccount.provider_user_data.name).toBe('Apple Recovery User')
      expect(fetchSpy).toHaveBeenCalledTimes(1)
      expect(fetchSpy).toHaveBeenCalledWith(
        'https://appleid.apple.com/auth/keys',
        expect.objectContaining({ dispatcher: expect.anything() }),
      )
    })

    it('rejects tokens whose nonce does not match', async () => {
      const credential = createSignedJwt(
        { kid: 'apple-kid', alg: 'RS256' },
        {
          iss: 'https://appleid.apple.com',
          aud: appleClientId,
          sub: 'apple-bad-nonce',
          nonce: createHash('sha256').update('expected').digest('hex'),
          iat: Math.floor(Date.now() / 1000) - 60,
          exp: Math.floor(Date.now() / 1000) + 300,
        },
        jwks => {
          fetchSpy.mockResolvedValueOnce(makeFetchResponse(jwks))
        },
      )

      await expect(upsertAppleAccount(credential, undefined, 'different')).rejects.toThrow(
        'nonce is invalid',
      )
    })

    it('accepts configured native apple audiences', async () => {
      const credential = createSignedJwt(
        { kid: 'apple-kid', alg: 'RS256' },
        {
          iss: 'https://appleid.apple.com',
          aud: nativeAppleClientId,
          sub: 'apple-native-audience',
          email: `native+${createRandomString(8)}@voucha.ai`,
          email_verified: 'true',
          iat: Math.floor(Date.now() / 1000) - 60,
          exp: Math.floor(Date.now() / 1000) + 300,
        },
        jwks => {
          fetchSpy.mockResolvedValueOnce(makeFetchResponse(jwks))
        },
      )

      const account = await upsertAppleAccount(credential)

      expect(account.provider_user_id).toBe('apple-native-audience')
    })

    it('rejects first apple sign-in without a verified email', async () => {
      const credential = createSignedJwt(
        { kid: 'apple-kid', alg: 'RS256' },
        {
          iss: 'https://appleid.apple.com',
          aud: appleClientId,
          sub: `apple-email-missing-${createRandomString(8)}`,
          iat: Math.floor(Date.now() / 1000) - 60,
          exp: Math.floor(Date.now() / 1000) + 300,
        },
        jwks => {
          fetchSpy.mockResolvedValueOnce(makeFetchResponse(jwks))
        },
      )

      await expect(upsertAppleAccount(credential)).rejects.toThrow('must include a verified email')
    })

    it('allows authenticated apple connect without a repeated email claim', async () => {
      const appleUserId = `apple-connect-${createRandomString(8)}`
      const credential = createSignedJwt(
        { kid: 'apple-kid', alg: 'RS256' },
        {
          iss: 'https://appleid.apple.com',
          aud: appleClientId,
          sub: appleUserId,
          iat: Math.floor(Date.now() / 1000) - 60,
          exp: Math.floor(Date.now() / 1000) + 300,
        },
        jwks => {
          fetchSpy.mockResolvedValueOnce(makeFetchResponse(jwks))
        },
      )

      const account = await upsertAppleAccount(credential, undefined, undefined, {
        requireVerifiedEmail: false,
      })

      expect(account.provider_user_id).toBe(appleUserId)
      expect(account.provider_user_email_address).toBeNull()
    })

    it('allows existing apple accounts to sign in without a repeated email claim', async () => {
      const appleUserId = `apple-existing-${createRandomString(8)}`
      fetchSpy.mockResolvedValueOnce(makeFetchResponse(makeAppleJwk('apple-kid')))
      await upsertAppleAccount(createCredentialForSubject(appleUserId))

      const credential = createSignedJwt(
        { kid: 'apple-kid', alg: 'RS256' },
        {
          iss: 'https://appleid.apple.com',
          aud: appleClientId,
          sub: appleUserId,
          iat: Math.floor(Date.now() / 1000) - 60,
          exp: Math.floor(Date.now() / 1000) + 300,
        },
      )

      const account = await upsertAppleAccount(credential)

      expect(account.provider_user_id).toBe(appleUserId)
      expect(account.provider_user_email_address).toContain('@voucha.ai')
    })

    it('maps Apple JWKS timeouts to 502 and does not cache the failed fetch', async () => {
      const credential = createSignedJwt(
        { kid: 'apple-kid', alg: 'RS256' },
        {
          iss: 'https://appleid.apple.com',
          aud: appleClientId,
          sub: 'apple-fetch-failure',
          iat: Math.floor(Date.now() / 1000) - 60,
          exp: Math.floor(Date.now() / 1000) + 300,
        },
        () => {
          fetchSpy.mockRejectedValueOnce(new DOMException('request timed out', 'TimeoutError'))
        },
      )

      await expect(upsertAppleAccount(credential)).rejects.toMatchObject({ status: 502 })
      expect(fetchSpy).toHaveBeenCalledTimes(1)
    })
  })

  describe('cache', () => {
    it('caches apple keys for the production undici fetch dependency', async () => {
      fetchSpy.mockResolvedValueOnce(makeFetchResponse(makeAppleJwk('apple-kid')))

      await upsertAppleAccount(createCredential('apple-cache-user-a'))
      await upsertAppleAccount(createCredential('apple-cache-user-b'))

      expect(fetchSpy).toHaveBeenCalledTimes(1)
    })

    it('force-refreshes production apple keys when the cached key misses the token kid', async () => {
      fetchSpy
        .mockResolvedValueOnce(makeFetchResponse(makeAppleJwk('stale-apple-kid')))
        .mockResolvedValueOnce(makeFetchResponse(makeAppleJwk('rotated-apple-kid')))

      await upsertAppleAccount(createCredential('apple-cache-refresh-user', 'rotated-apple-kid'))

      expect(fetchSpy).toHaveBeenCalledTimes(2)
    })
  })
})

function createCredential(subjectPrefix: string, kid = 'apple-kid'): string {
  const subject = `${subjectPrefix}-${createRandomString(8)}`
  return createCredentialForSubject(subject, kid)
}

function createCredentialForSubject(subject: string, kid = 'apple-kid'): string {
  return createSignedJwt(
    { kid, alg: 'RS256' },
    {
      iss: 'https://appleid.apple.com',
      aud: appleClientId,
      sub: subject,
      email: `${subject}@voucha.ai`,
      email_verified: 'true',
      iat: Math.floor(Date.now() / 1000) - 60,
      exp: Math.floor(Date.now() / 1000) + 300,
    },
  )
}
