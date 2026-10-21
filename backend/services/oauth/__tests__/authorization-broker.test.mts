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
import { receiveOAuthAuthorizationCallback as receiveCallback } from '../authorization-broker.mts'
import { buildProviderAuthorizationUrl } from '../authorization-provider-url.mts'

describe('OAuth authorization broker callback', () => {
  it('persists an encrypted code before returning a stable completion handoff', async () => {
    const cleanup = registerCleanup()
    const state = randomBytes(32).toString('base64url')
    const flowId = await insertPendingAuthorization(state, cleanup)
    const code = `provider-code-${randomUUID()}`

    const first = await receiveCallback(
      {
        provider: 'github',
        state,
        code,
      },
      () => new Date(),
    )
    const replay = await receiveCallback(
      {
        provider: 'github',
        state,
        code,
      },
      () => new Date(),
    )

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

  it('accepts and replays a Google broker callback against the durable provider state', async () => {
    const cleanup = registerCleanup()
    const state = randomBytes(32).toString('base64url')
    const flowId = await insertTestOAuthAuthorization({ provider: 'google', state })
    cleanup.authorizationIds.push(flowId)
    const code = `google-code-${randomUUID()}`

    const first = await receiveCallback({ provider: 'google', state, code }, () => new Date())
    const replay = await receiveCallback({ provider: 'google', state, code }, () => new Date())

    expect(first).toMatchObject({ flowId, callbackMode: 'web', exchangeRequired: true })
    expect(replay).toEqual(first)
    expect(await getTestOAuthAuthorization(flowId)).toMatchObject({
      status: 'callback_received',
      callback_code_ciphertext: expect.any(String),
    })
    expect((await getTestOAuthAuthorization(flowId))?.callback_code_ciphertext).not.toContain(code)
  })

  it('uses exact provider scopes and PKCE only where the provider supports it', () => {
    const expectations = {
      facebook: { scope: 'email,user_friends', pkce: false },
      x: { scope: 'tweet.read users.read follows.read offline.access', pkce: true },
      github: { scope: 'read:user user:email', pkce: true },
      linkedin: { scope: 'openid profile email', pkce: false },
      microsoft: { scope: 'openid profile email User.Read', pkce: true },
      google: { scope: 'openid profile email', pkce: true },
    } as const

    for (const [provider, expected] of Object.entries(expectations)) {
      const redirectUri = `https://example.com/auth/callback/${provider}/broker`
      const url = new URL(
        buildProviderAuthorizationUrl({
          clientId: `${provider}-client-id`,
          provider: provider as keyof typeof expectations,
          callbackMode: 'web',
          redirectUri,
          state: 'opaque-state',
          codeChallenge: 'Z'.repeat(43),
        }),
      )
      expect(url.searchParams.get('scope')).toBe(expected.scope)
      expect(url.searchParams.get('redirect_uri')).toBe(redirectUri)
      expect(Boolean(url.searchParams.get('code_challenge'))).toBe(expected.pkce)
      expect(url.searchParams.get('code_challenge_method')).toBe(expected.pkce ? 'S256' : null)
      expect(url.searchParams.has('enable_extended_login')).toBe(false)
    }
  })

  it('persists provider denial as a terminal handoff without scheduling exchange', async () => {
    const cleanup = registerCleanup()
    const state = randomBytes(32).toString('base64url')
    const flowId = await insertPendingAuthorization(state, cleanup)

    const result = await receiveCallback(
      {
        provider: 'github',
        state,
        error: 'access denied by user',
      },
      () => new Date(),
    )

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

  it('persists and replays Google user cancellation without scheduling exchange', async () => {
    const cleanup = registerCleanup()
    const state = randomBytes(32).toString('base64url')
    const flowId = await insertTestOAuthAuthorization({ provider: 'google', state })
    cleanup.authorizationIds.push(flowId)

    const result = await receiveCallback(
      {
        provider: 'google',
        state,
        error: 'access_denied',
      },
      () => new Date(),
    )
    const replay = await receiveCallback(
      {
        provider: 'google',
        state,
        error: 'access_denied',
      },
      () => new Date(),
    )

    expect(result).toMatchObject({ flowId, callbackMode: 'web', exchangeRequired: false })
    expect(replay).toEqual(result)
    expect(await getTestOAuthAuthorization(flowId)).toMatchObject({
      status: 'rejected',
      callback_error: 'access_denied',
      callback_code_ciphertext: null,
    })
  })

  it('rejects malformed, unknown, expired, and non-resumable callbacks', async () => {
    const cleanup = registerCleanup()

    await expect(
      receiveCallback({ provider: 'github', state: '', code: 'code' }, () => new Date()),
    ).rejects.toMatchObject({ status: 400 })
    await expect(
      receiveCallback({ provider: 'github', state: randomUUID() }, () => new Date()),
    ).rejects.toMatchObject({ status: 400 })
    await expect(
      receiveCallback(
        {
          provider: 'github',
          state: randomUUID(),
          code: 'code',
        },
        () => new Date(),
      ),
    ).rejects.toMatchObject({ status: 400 })

    const nonResumableState = randomUUID()
    const nonResumableId = await insertTestOAuthAuthorization({
      state: nonResumableState,
      status: 'rejected',
    })
    cleanup.authorizationIds.push(nonResumableId)
    await expect(
      receiveCallback(
        {
          provider: 'github',
          state: nonResumableState,
          code: 'code',
        },
        () => new Date(),
      ),
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

    const account = await upsertOAuthAccount(
      'github',
      providerUserId,
      null,
      { login: providerUserId },
      undefined,
      {
        authorizationId: flowId,
        authorizationClaimId: claimId,
      },
    )

    const row = await getTestOAuthAuthorization(flowId)
    expect({
      status: row?.status,
      github_account_id: row?.github_account_id,
      callback_code_ciphertext: row?.callback_code_ciphertext,
      exchange_claim_id: row?.exchange_claim_id,
    }).toEqual({
      status: 'completion_ready',
      github_account_id: account.account_id,
      callback_code_ciphertext: null,
      exchange_claim_id: null,
    })
  })

  it('persists a LinkedIn account and fenced completion in one transaction', async () => {
    const cleanup = registerCleanup()
    const flowId = await insertTestOAuthAuthorization({ provider: 'linkedin' })
    cleanup.authorizationIds.push(flowId)
    const claimId = randomUUID()
    await markTestOAuthAuthorizationExchanging(flowId, claimId)
    const providerUserId = `broker-linkedin-${randomUUID()}`
    cleanup.linkedinUserIds.push(providerUserId)

    const account = await upsertOAuthAccount(
      'linkedin',
      providerUserId,
      null,
      { name: 'LinkedIn Member' },
      { accessToken: 'synthetic-access-token' },
      { authorizationId: flowId, authorizationClaimId: claimId },
    )
    expect(account.account_id).toMatch(/^[0-9a-f-]{36}$/)

    expect(await getTestOAuthAuthorization(flowId)).toMatchObject({
      status: 'completion_ready',
      linkedin_account_id: account.account_id,
      callback_code_ciphertext: null,
      exchange_claim_id: null,
    })
  })
})

type BrokerTestCleanup = {
  authorizationIds: string[]
  githubUserIds: string[]
  linkedinUserIds: string[]
  googleUserIds: string[]
}

function registerCleanup(): BrokerTestCleanup {
  const cleanup: BrokerTestCleanup = {
    authorizationIds: [],
    githubUserIds: [],
    linkedinUserIds: [],
    googleUserIds: [],
  }
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
