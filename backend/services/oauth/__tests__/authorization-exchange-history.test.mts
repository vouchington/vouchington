import { randomUUID } from 'node:crypto'
import { describe, expect, it, onTestFinished } from 'vitest'
import {
  deleteTestOAuthAuthorizationFixtures,
  getTestOAuthAuthorization,
  insertTestOAuthAuthorization,
} from '@voucha/test-helpers/entities/oauth-authorizations'
import {
  getTestOAuthExchangeAttempts,
  rewriteTestOAuthExchangeAttempt,
} from '@voucha/test-helpers/entities/oauth-exchange-attempts'
import {
  claimOAuthAuthorizationExchange,
  releaseOAuthAuthorizationExchangeClaim,
} from '../authorization-exchange-state.mts'

describe('OAuth authorization exchange history', () => {
  it('retains a superseded attempt and fences its release from the successor', async () => {
    const oldClaimId = randomUUID()
    const flowId = await insertTestOAuthAuthorization({
      status: 'exchanging',
      callbackReceivedAt: new Date(),
      callbackCodeCiphertext: 'test-code',
      exchangeAttempts: 1,
      exchangeClaimId: oldClaimId,
      updatedAt: new Date(Date.now() - 120_000),
    })
    onTestFinished(() => deleteTestOAuthAuthorizationFixtures({ authorizationIds: [flowId] }))

    const successor = await claimOAuthAuthorizationExchange(flowId)
    expect(successor).not.toBeNull()
    expect(successor!.exchange_claim_id).not.toBe(oldClaimId)
    await releaseOAuthAuthorizationExchangeClaim(flowId, oldClaimId)
    expect(await getTestOAuthAuthorization(flowId)).toMatchObject({
      status: 'exchanging',
      exchange_claim_id: successor!.exchange_claim_id,
    })
    expect(await getTestOAuthExchangeAttempts(flowId)).toMatchObject([
      { attempt_number: 1, exchange_claim_id: oldClaimId, abandoned_at: expect.any(Date) },
      { attempt_number: 2, exchange_claim_id: successor!.exchange_claim_id, abandoned_at: null },
    ])
    await expect(rewriteTestOAuthExchangeAttempt(flowId)).rejects.toThrow(
      'oauth_authorization_exchange_attempts rows are append-only',
    )
  })
})
