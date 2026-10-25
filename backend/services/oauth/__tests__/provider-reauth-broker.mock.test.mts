import { consumeTestAccountChangeProof } from '@voucha/test-helpers/account-change'
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest'
import { v7 } from 'uuid'
import { Response, type fetch as undiciFetch } from 'undici'
import { createTestProviderReAuthIdentity } from '@voucha/test-helpers/entities/oauth-reauth'
import { getTestOAuthAccountRaw } from '@voucha/test-helpers/entities/oauth-account-raw'
import {
  insertTestOAuthAuthorization,
  markTestOAuthAuthorizationExchanging,
  getTestOAuthAuthorization,
} from '@voucha/test-helpers/entities/oauth-authorizations'
import {
  createSignedJwt,
  makeAppleJwk,
  makeFetchResponse,
} from '@voucha/test-helpers/services/oauth-apple/fixtures'

const provider = 'microsoft' as const
const clientId = 'synthetic-fresh-provider-client'
const tenantId = v7()
vi.stubEnv('MICROSOFT_CLIENT_ID', clientId)
vi.stubEnv('MICROSOFT_CLIENT_SECRET', 'synthetic-secret')
vi.stubEnv('MICROSOFT_TENANT_ID', 'common')
vi.resetModules()
const fetchSpy = vi.fn<typeof undiciFetch>()
vi.doMock<typeof import('undici')>(import('undici'), async importOriginal => ({
  ...(await importOriginal()),
  fetch: fetchSpy,
}))
const { upsertMicrosoftAccount } = await import('@services/oauth-microsoft')
const { createProviderReAuthChallenge, readProviderReAuthChallenge } =
  await import('../provider-reauth-challenge.mts')
const { completeOAuthAuthorizationTransaction } =
  await import('../authorization-completion-transaction.mts')
const { completeBrokerProviderReAuthProof } = await import('../provider-reauth-broker.mts')
const { readSessionDeviceAuthority } = await import('@services/jwt-session/device-authority')
const { getUserMfaStatus } = await import('@services/mfa')

type RejectedAssertion = 'wrong' | 'missing' | 'missing-token' | 'subject'

async function prepareConfirmation(mode: 'correct' | RejectedAssertion) {
  const identity = await createTestProviderReAuthIdentity(provider)
  const { nonce } = await createProviderReAuthChallenge(identity)
  const context = await readProviderReAuthChallenge(identity)
  const previousAccount = await getTestOAuthAccountRaw(provider, context.providerUserId)
  const previousSession = await readSessionDeviceAuthority(identity.sessionId)
  const completionToken = `synthetic-completion-${v7()}`
  const claimId = v7()
  await insertTestOAuthAuthorization({
    id: identity.flowId,
    provider,
    purpose: 're_auth',
    initiatingUserId: identity.userId,
    deviceId: identity.deviceId,
    sessionId: identity.sessionId,
    completionToken,
  })
  await markTestOAuthAuthorizationExchanging(identity.flowId, claimId)
  const subject = mode === 'subject' ? `other-${v7()}` : context.providerUserId
  const now = Math.floor(Date.now() / 1000)
  const credential = createSignedJwt(
    { kid: 'reauth-key', alg: 'RS256' },
    {
      aud: clientId,
      iss: `https://login.microsoftonline.com/${tenantId}/v2.0`,
      oid: subject,
      sub: subject,
      tid: tenantId,
      ...(mode !== 'missing' && { nonce: mode === 'wrong' ? 'old-cached-nonce' : nonce }),
      email: 'tests+changed-provider-data@voucha.ai',
      email_verified: true,
      xms_edov: true,
      iat: now,
      exp: now + 300,
    },
  )
  fetchSpy.mockImplementation(async url => {
    if (typeof url !== 'string') throw new Error('Expected the provider operation URL string')
    if (url.endsWith('/keys')) return makeFetchResponse(makeAppleJwk('reauth-key'))
    if (url.endsWith('/token'))
      return Response.json({
        access_token: 'fresh-access',
        ...(mode !== 'missing-token' && { id_token: credential }),
      })
    return Response.json({ id: context.providerUserId })
  })
  return {
    identity,
    context,
    previousAccount,
    previousSession,
    request: {
      provider,
      flowId: identity.flowId,
      deviceId: identity.deviceId,
      sessionId: identity.sessionId,
    },
    completion: {
      flowId: identity.flowId,
      completionToken,
      completionTokenSource: 'cookie' as const,
      currentUserId: identity.userId,
      deviceId: identity.deviceId,
      sessionId: identity.sessionId,
    },
    exchange: () =>
      upsertMicrosoftAccount('fresh-code', 'https://example.com/callback', 'fresh-pkce', {
        authorizationId: identity.flowId,
        authorizationClaimId: claimId,
        reAuth: context,
      }),
  }
}

async function expectOriginalAccountAndAssurance(
  fixture: Awaited<ReturnType<typeof prepareConfirmation>>,
) {
  expect(await getTestOAuthAccountRaw(provider, fixture.context.providerUserId)).toEqual(
    fixture.previousAccount,
  )
  expect(await getUserMfaStatus(fixture.identity.userId)).toMatchObject({ hasMfa: false })
  const session = await readSessionDeviceAuthority(fixture.identity.sessionId)
  expect(session?.device_token_binding).toEqual(fixture.previousSession?.device_token_binding)
  expect(session?.device_token_digest).toBe(fixture.previousSession?.device_token_digest)
}

describe('Microsoft nonce-bound broker confirmation', () => {
  afterEach(() => fetchSpy.mockReset())
  afterAll(() => {
    vi.unstubAllEnvs()
    vi.doUnmock('undici')
  })

  it('grants one settings proof for the fresh signed nonce and exact linked subject', async () => {
    const fixture = await prepareConfirmation('correct')
    await fixture.exchange()
    await expect(completeOAuthAuthorizationTransaction(fixture.completion)).resolves.toMatchObject({
      kind: 'reauthenticated',
    })
    const token = await completeBrokerProviderReAuthProof(fixture.identity.userId, fixture.request)
    await expect(
      consumeTestAccountChangeProof(
        fixture.identity.userId,
        {
          sid: fixture.identity.sessionId,
          did: fixture.identity.deviceId,
        },
        token,
      ),
    ).resolves.toBe(true)
    await expect(
      completeBrokerProviderReAuthProof(fixture.identity.userId, fixture.request),
    ).rejects.toMatchObject({ status: 401 })
    await expectOriginalAccountAndAssurance(fixture)
  })

  it.each(['wrong', 'missing', 'missing-token', 'subject'] as const)(
    'rejects %s proof before completing the exchange',
    async mode => {
      const fixture = await prepareConfirmation(mode)
      await expect(fixture.exchange()).rejects.toMatchObject({ status: 401 })
      expect(await getTestOAuthAuthorization(fixture.identity.flowId)).toMatchObject({
        status: 'exchanging',
      })
      await expect(
        completeBrokerProviderReAuthProof(fixture.identity.userId, fixture.request),
      ).rejects.toMatchObject({ status: 409 })
      await expectOriginalAccountAndAssurance(fixture)
    },
  )
})
