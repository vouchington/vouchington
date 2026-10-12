import { randomUUID } from 'node:crypto'
import { v7 as uuidv7 } from 'uuid'
import { createTestUserWithId, createTestUsername } from '@voucha/test-helpers/entities/users'
import {
  insertTestOAuthAccount,
  connectTestOAuthAccount,
} from '@voucha/test-helpers/entities/oauth-accounts'
import { describe, expect, it, onTestFinished } from 'vitest'
import {
  deleteTestOAuthAuthorizationFixtures,
  getTestOAuthAuthorization,
  insertTestOAuthAuthorization,
} from '@voucha/test-helpers/entities/oauth-authorizations'
import { claimOAuthAuthorizationExchange } from '../authorization-exchange-state.mts'
import { settleOAuthAuthorizationExchangeClaim } from '../authorization-exchange-disposition.mts'

describe('OAuth recorded claim temporal disposition', () => {
  it('expires an ID-only retry with an unrecorded committed claim instead of reporting unresolved ownership', async () => {
    const claimId = randomUUID()
    const ids: string[] = []
    onTestFinished(() => deleteTestOAuthAuthorizationFixtures({ authorizationIds: ids }))
    const id = await insertTestOAuthAuthorization({
      provider: 'github',
      status: 'exchanging',
      exchangeClaimId: claimId,
      exchangeAttempts: 1,
      callbackReceivedAt: new Date(),
      callbackCodeCiphertext: 'owned-expired-code',
      completionToken: 'owned-expired-completion',
      completionTokenCiphertext: 'owned-expired-completion-ciphertext',
      expiresAt: new Date(Date.now() - 60_000),
    })
    ids.push(id)
    await expect(claimOAuthAuthorizationExchange(id)).resolves.toBeNull()
    expect(await getTestOAuthAuthorization(id)).toMatchObject({
      status: 'expired',
      exchange_claim_id: null,
      callback_code_ciphertext: null,
      completion_token_ciphertext: null,
    })
  })

  it.each([
    {
      label: 'authorization expiry before exhaustion',
      provider: 'github' as const,
      attempts: 1,
      expired: true,
      oldCode: false,
      status: 'expired',
      error: null,
    },
    {
      label: 'authorization expiry at exhaustion',
      provider: 'github' as const,
      attempts: 5,
      expired: true,
      oldCode: false,
      status: 'expired',
      error: null,
    },
    {
      label: 'authorization expiry before X code expiry',
      provider: 'x' as const,
      attempts: 5,
      expired: true,
      oldCode: true,
      status: 'expired',
      error: null,
    },
    {
      label: 'X code expiry before exhaustion',
      provider: 'x' as const,
      attempts: 1,
      expired: false,
      oldCode: true,
      status: 'rejected',
      error: 'provider_code_expired',
    },
    {
      label: 'X code expiry at exhaustion',
      provider: 'x' as const,
      attempts: 5,
      expired: false,
      oldCode: true,
      status: 'rejected',
      error: 'provider_code_expired',
    },
    {
      label: 'live code exhausted',
      provider: 'github' as const,
      attempts: 5,
      expired: false,
      oldCode: false,
      status: 'rejected',
      error: 'provider_exchange_failed',
    },
    {
      label: 'armed fifth attempt remains an unknown outcome',
      provider: 'github' as const,
      attempts: 5,
      expired: false,
      oldCode: false,
      armed: true,
      status: 'rejected',
      error: 'provider_exchange_outcome_unknown',
    },
    {
      label: 'armed fifth attempt still obeys X code expiry',
      provider: 'x' as const,
      attempts: 5,
      expired: false,
      oldCode: true,
      armed: true,
      status: 'rejected',
      error: 'provider_code_expired',
    },
    {
      label: 'live retryable claim',
      provider: 'github' as const,
      attempts: 1,
      expired: false,
      oldCode: false,
      status: 'callback_received',
      error: null,
    },
  ])('$label', async scenario => {
    const claimId = randomUUID()
    const ids: string[] = []
    onTestFinished(() => deleteTestOAuthAuthorizationFixtures({ authorizationIds: ids }))
    const now = Date.now()
    const id = await insertTestOAuthAuthorization({
      provider: scenario.provider,
      status: 'exchanging',
      exchangeAttempts: scenario.attempts,
      exchangeClaimId: claimId,
      callbackCodeCiphertext: 'test-code-ciphertext',
      callbackReceivedAt: new Date(now - (scenario.oldCode ? 60_000 : 0)),
      expiresAt: new Date(now + (scenario.expired ? -60_000 : 600_000)),
      completionToken: 'test-completion-token',
      completionTokenCiphertext: 'test-completion-ciphertext',
    })
    ids.push(id)
    await expect(settleOAuthAuthorizationExchangeClaim(id, claimId, scenario.armed)).resolves.toBe(
      scenario.status === 'callback_received' ? 'released' : 'terminal',
    )
    expect(await getTestOAuthAuthorization(id)).toMatchObject({
      status: scenario.status,
      callback_error: scenario.error,
      exchange_claim_id: null,
      callback_code_ciphertext:
        scenario.status === 'callback_received' ? 'test-code-ciphertext' : null,
      completion_token_ciphertext: scenario.expired ? null : 'test-completion-ciphertext',
    })
  })
  it.each(['completion_ready', 'completed'] as const)(
    'settles past-expiry %s ownership without changing consumed account results',
    async status => {
      const accountId = `oauth-expiry-${randomUUID()}`
      const userId = uuidv7()
      const id = uuidv7()
      onTestFinished(() =>
        deleteTestOAuthAuthorizationFixtures({
          authorizationIds: [id],
          githubUserIds: [accountId],
          userIds: [userId],
        }),
      )
      await createTestUserWithId(userId, createTestUsername())
      await insertTestOAuthAccount('github', accountId)
      await connectTestOAuthAccount('github', userId, accountId)
      await insertTestOAuthAuthorization({
        id,
        provider: 'github',
        status,
        providerUserId: accountId,
        purpose: 'connect',
        initiatingUserId: userId,
        callbackReceivedAt: new Date(),
        completionReadyAt: new Date(),
        completionToken: 'owned-expired-token',
        completionTokenCiphertext: 'owned-expired-ciphertext',
        expiresAt: new Date(Date.now() - 60_000),
        ...(status === 'completed'
          ? { completedAt: new Date(), resultKind: 'connected', resultUserId: userId }
          : {}),
      })
      const before = await getTestOAuthAuthorization(id)
      await expect(settleOAuthAuthorizationExchangeClaim(id, randomUUID(), true)).resolves.toBe(
        'terminal',
      )
      const expected =
        status === 'completed'
          ? before
          : {
              ...before,
              status: 'expired',
              callback_code_ciphertext: null,
              completion_token_ciphertext: null,
              exchange_claim_id: null,
            }
      const after = await getTestOAuthAuthorization(id)
      expect(after).toEqual(expected)
      expect(after?.github_user_id).toBe(accountId)
      const retainedCiphertext = status === 'completed' ? before?.completion_token_ciphertext : null
      expect(after?.completion_token_ciphertext).toBe(retainedCiphertext)
    },
  )
})
