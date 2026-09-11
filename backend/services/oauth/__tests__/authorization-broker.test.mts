import { randomBytes, randomUUID } from 'node:crypto'
import { describe, expect, it, onTestFinished } from 'vitest'
import { hashToken } from '@modules/token-secrets'
import { upsertOAuthAccount } from '@services/oauth-accounts'
import {
  deleteTestOAuthAuthorizationFixtures,
  getTestOAuthAuthorization,
  insertTestOAuthAuthorization,
  markTestOAuthAuthorizationExchanging,
} from '@voucha/test-helpers/entities/oauth-authorizations'
import {
  buildProviderAuthorizationUrl,
  receiveOAuthAuthorizationCallback,
} from '../authorization-broker.mts'

describe('OAuth authorization broker callback', () => {
  it('persists an encrypted code before returning a stable completion handoff', async () => {
    const cleanup = registerCleanup()
    const state = randomBytes(32).toString('base64url')
    const flowId = await insertPendingAuthorization(state, cleanup)
    const code = `provider-code-${randomUUID()}`

    const first = await receiveOAuthAuthorizationCallback({
      provider: 'github',
      state,
      code,
    })
    const replay = await receiveOAuthAuthorizationCallback({
      provider: 'github',
      state,
      code,
    })

    expect(first).toMatchObject({
      flowId,
      callbackMode: 'web',
      exchangeRequired: true,
    })
    expect(replay).toEqual(first)

    const row = await getTestOAuthAuthorization(flowId)
    expect(row).toMatchObject({
      status: 'callback_received',
      completion_token_hash: hashToken(
        `oauth-authorization-broker:completion:${flowId}`,
        first.completionToken,
      ),
    })
    expect(row?.callback_code_ciphertext).not.toContain(code)
    expect(row?.completion_token_ciphertext).not.toContain(first.completionToken)
  })

  it('uses exact provider scopes and PKCE only where the provider supports it', () => {
    const expectations = {
      facebook: { scope: 'email,user_friends', pkce: false },
      x: { scope: 'tweet.read users.read follows.read offline.access', pkce: true },
      github: { scope: 'read:user user:email', pkce: true },
    } as const

    for (const [provider, expected] of Object.entries(expectations)) {
      const redirectUri = `https://example.com/auth/callback/${provider}/broker`
      const url = new URL(
        buildProviderAuthorizationUrl({
          clientId: `${provider}-client-id`,
          provider: provider as keyof typeof expectations,
          redirectUri,
          state: 'opaque-state',
          codeChallenge: 'Z'.repeat(43),
        }),
      )
      expect(url.searchParams.get('scope')).toBe(expected.scope)
      expect(url.searchParams.get('redirect_uri')).toBe(redirectUri)
      expect(Boolean(url.searchParams.get('code_challenge'))).toBe(expected.pkce)
      expect(url.searchParams.get('code_challenge_method')).toBe(expected.pkce ? 'S256' : null)
    }
  })

  it('persists provider denial as a terminal handoff without scheduling exchange', async () => {
    const cleanup = registerCleanup()
    const state = randomBytes(32).toString('base64url')
    const flowId = await insertPendingAuthorization(state, cleanup)

    const result = await receiveOAuthAuthorizationCallback({
      provider: 'github',
      state,
      error: 'access denied by user',
    })

    expect(result).toMatchObject({
      flowId,
      callbackMode: 'web',
      exchangeRequired: false,
    })
    const row = await getTestOAuthAuthorization(flowId)
    expect({
      status: row?.status,
      callback_error: row?.callback_error,
    }).toEqual({
      status: 'rejected',
      callback_error: 'access_denied_by_user',
    })
  })

  it('rejects malformed, unknown, expired, and non-resumable callbacks', async () => {
    const cleanup = registerCleanup()

    await expect(
      receiveOAuthAuthorizationCallback({ provider: 'github', state: '', code: 'code' }),
    ).rejects.toMatchObject({ status: 400 })
    await expect(
      receiveOAuthAuthorizationCallback({ provider: 'github', state: randomUUID() }),
    ).rejects.toMatchObject({ status: 400 })
    await expect(
      receiveOAuthAuthorizationCallback({
        provider: 'github',
        state: randomUUID(),
        code: 'code',
      }),
    ).rejects.toMatchObject({ status: 400 })

    const nonResumableState = randomUUID()
    const nonResumableId = await insertTestOAuthAuthorization({
      state: nonResumableState,
      status: 'rejected',
    })
    cleanup.authorizationIds.push(nonResumableId)
    await expect(
      receiveOAuthAuthorizationCallback({
        provider: 'github',
        state: nonResumableState,
        code: 'code',
      }),
    ).rejects.toMatchObject({ status: 409 })
  })

  it('commits provider-account persistence and completion readiness atomically', async () => {
    const cleanup = registerCleanup()
    const state = randomBytes(32).toString('base64url')
    const flowId = await insertPendingAuthorization(state, cleanup)
    const claimId = randomUUID()
    await markTestOAuthAuthorizationExchanging(flowId, claimId)
    const providerUserId = `broker-exchange-${randomUUID()}`
    cleanup.githubUserIds.push(providerUserId)

    await upsertOAuthAccount('github', providerUserId, null, { login: providerUserId }, undefined, {
      authorizationId: flowId,
      authorizationClaimId: claimId,
    })

    const row = await getTestOAuthAuthorization(flowId)
    expect({
      status: row?.status,
      github_user_id: row?.github_user_id,
      callback_code_ciphertext: row?.callback_code_ciphertext,
      exchange_claim_id: row?.exchange_claim_id,
    }).toEqual({
      status: 'completion_ready',
      github_user_id: providerUserId,
      callback_code_ciphertext: null,
      exchange_claim_id: null,
    })
  })
})

type BrokerTestCleanup = {
  authorizationIds: string[]
  githubUserIds: string[]
}

function registerCleanup(): BrokerTestCleanup {
  const cleanup: BrokerTestCleanup = { authorizationIds: [], githubUserIds: [] }
  onTestFinished(async () => {
    await deleteTestOAuthAuthorizationFixtures(cleanup)
  })
  return cleanup
}

async function insertPendingAuthorization(
  state: string,
  cleanup: BrokerTestCleanup,
): Promise<string> {
  const flowId = await insertTestOAuthAuthorization({ state })
  cleanup.authorizationIds.push(flowId)
  return flowId
}
