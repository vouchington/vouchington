import { consumeTestAccountChangeProof } from '@voucha/test-helpers/account-change'
import { createHash } from 'node:crypto'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createTestProviderReAuthCredential,
  createTestProviderReAuthIdentity,
} from '@voucha/test-helpers/entities/oauth-reauth'
import { getTestOAuthAccountRaw } from '@voucha/test-helpers/entities/oauth-account-raw'
import type { fetch as undiciFetch } from 'undici'
import {
  createSignedJwt,
  makeAppleJwk,
  makeFetchResponse,
} from '@voucha/test-helpers/services/oauth-apple/fixtures'

const clientId = 'synthetic-reauth-client'
const now = Date.now()
vi.stubEnv('APPLE_CLIENT_ID', clientId)
vi.stubEnv('GOOGLE_CLIENT_ID', clientId)
vi.resetModules()
const fetchSpy = vi.fn<typeof undiciFetch>()
vi.doMock<typeof import('undici')>(import('undici'), async () => {
  const actual = await vi.importActual<typeof import('undici')>('undici')
  return { ...actual, fetch: fetchSpy }
})
const { beginSdkProviderReAuth, completeSdkProviderReAuth } =
  await import('../provider-reauth-sdk.mts')
const { readProviderReAuthChallenge } = await import('../provider-reauth-challenge.mts')

describe('provider assertion reauthentication', () => {
  beforeEach(() => {
    fetchSpy.mockResolvedValue(makeFetchResponse(makeAppleJwk('reauth-key')))
  })
  afterEach(() => vi.restoreAllMocks())
  afterAll(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
    vi.doUnmock('undici')
  })

  describe.each(['google', 'apple'] as const)('%s linked-provider reauthentication', provider => {
    it('verifies a fresh signed nonce and exact subject once, without changing provider data', async () => {
      const identity = await createTestProviderReAuthIdentity(provider)
      const started = await beginSdkProviderReAuth(identity.userId, identity)
      const context = await readProviderReAuthChallenge({ ...identity, flowId: started.flow_id })
      const previous = await getTestOAuthAccountRaw(provider, context.providerUserId)
      const nonce =
        provider === 'apple'
          ? createHash('sha256').update(started.nonce).digest('hex')
          : started.nonce
      const credential = createTestProviderReAuthCredential(
        provider,
        context.providerUserId,
        nonce,
        clientId,
        now,
      )
      const request = { ...identity, flowId: started.flow_id, credential }
      const results = await Promise.allSettled([
        completeSdkProviderReAuth(identity.userId, request),
        completeSdkProviderReAuth(identity.userId, request),
      ])
      const accepted = results.filter(result => result.status === 'fulfilled')
      expect(accepted).toHaveLength(1)
      expect(results.filter(result => result.status === 'rejected')).toHaveLength(1)
      const token = accepted[0].value
      await expect(
        consumeTestAccountChangeProof(
          identity.userId,
          { sid: identity.sessionId, did: identity.deviceId },
          token,
        ),
      ).resolves.toBe(true)
      await expect(
        consumeTestAccountChangeProof(
          identity.userId,
          { sid: identity.sessionId, did: identity.deviceId },
          token,
        ),
      ).resolves.toBe(false)
      await expect(getTestOAuthAccountRaw(provider, context.providerUserId)).resolves.toEqual(
        previous,
      )
    })

    it.each([undefined, null, 'invalid-expiry', 0, Math.floor(now / 1000)])(
      'rejects a valid signed nonce assertion with invalid lifetime %s',
      async exp => {
        const identity = await createTestProviderReAuthIdentity(provider)
        const started = await beginSdkProviderReAuth(identity.userId, identity)
        const context = await readProviderReAuthChallenge({ ...identity, flowId: started.flow_id })
        const nonce =
          provider === 'apple'
            ? createHash('sha256').update(started.nonce).digest('hex')
            : started.nonce
        const credential = createSignedJwt(
          { kid: 'reauth-key', alg: 'RS256' },
          {
            iss: provider === 'apple' ? 'https://appleid.apple.com' : 'https://accounts.google.com',
            aud: clientId,
            sub: context.providerUserId,
            nonce,
            iat: Math.floor(now / 1000) - 1,
            exp,
          },
        )
        await expect(
          completeSdkProviderReAuth(identity.userId, {
            ...identity,
            flowId: started.flow_id,
            credential,
          }),
        ).rejects.toMatchObject({ status: 401 })
        // Malformed provider proof never consumes the outstanding nonce or mutates its account.
        await expect(
          readProviderReAuthChallenge({ ...identity, flowId: started.flow_id }),
        ).resolves.toEqual(context)
      },
    )

    it.each(['nonce', 'subject'] as const)(
      'rejects a signed assertion with a wrong %s',
      async mismatch => {
        const identity = await createTestProviderReAuthIdentity(provider)
        const started = await beginSdkProviderReAuth(identity.userId, identity)
        const context = await readProviderReAuthChallenge({ ...identity, flowId: started.flow_id })
        const nonce =
          provider === 'apple'
            ? createHash('sha256').update(started.nonce).digest('hex')
            : started.nonce
        const credential = createTestProviderReAuthCredential(
          provider,
          mismatch === 'subject' ? 'another-linked-user' : context.providerUserId,
          mismatch === 'nonce' ? 'cached-assertion-nonce' : nonce,
          clientId,
          now,
        )
        await expect(
          completeSdkProviderReAuth(identity.userId, {
            ...identity,
            flowId: started.flow_id,
            credential,
          }),
        ).rejects.toMatchObject({ status: mismatch === 'nonce' ? 401 : 403 })
      },
    )
  })
})
