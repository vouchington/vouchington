import { describe, expect, it, onTestFinished } from 'vitest'
import {
  deleteTestOAuthAuthorizationFixtures,
  getTestOAuthAuthorization,
  insertTestOAuthAuthorization,
} from '@voucha/test-helpers/entities/oauth-authorizations'
import { getTestOAuthExchangeAttempts } from '@voucha/test-helpers/entities/oauth-exchange-attempts'
import { captureTestOAuthExchangeMutationFailure } from '@voucha/test-helpers/oauth-exchange-failure'

describe('OAuth exchange failure and durable ownership', () => {
  it('retains actual decrypt failure before rejection write failure and never releases uncertain durable state', async () => {
    const flowId = await fixture(4)
    const result = await captureTestOAuthExchangeMutationFailure(flowId, 'rejection')
    expect(result.hasFailed).toBe(true)
    expect(result.error).toBeInstanceOf(AggregateError)
    if (!(result.error instanceof AggregateError)) throw new Error('Expected both actual failures')
    expect(result.primary).toBeInstanceOf(Error)
    expect(result.secondary).toBe(result.injectedError)
    expect(result.error.errors).toEqual([result.primary, result.secondary])
    expect(result.error.cause).toBe(result.primary)
    expect(result.releaseCalls).toBe(0)
    if (!result.claimId) throw new Error('Expected the actual durable claim')
    expect(await getTestOAuthAuthorization(flowId)).toMatchObject({
      exchange_claim_id: result.claimId,
    })
    expect(await getTestOAuthExchangeAttempts(flowId)).toHaveLength(5)
  })

  it('retains actual decrypt failure before release write failure after a successful nonexhausted decision', async () => {
    const flowId = await fixture(0)
    const result = await captureTestOAuthExchangeMutationFailure(flowId, 'release')
    expect(result.hasFailed).toBe(true)
    expect(result.error).toBeInstanceOf(AggregateError)
    if (!(result.error instanceof AggregateError)) throw new Error('Expected both actual failures')
    expect(result.primary).toBeInstanceOf(Error)
    expect(result.secondary).toBe(result.injectedError)
    expect(result.error.errors).toEqual([result.primary, result.secondary])
    expect(result.error.cause).toBe(result.primary)
    expect(result.releaseCalls).toBe(1)
    if (!result.claimId) throw new Error('Expected the actual durable claim')
    expect(await getTestOAuthAuthorization(flowId)).toMatchObject({
      exchange_claim_id: result.claimId,
    })
    expect(await getTestOAuthExchangeAttempts(flowId)).toHaveLength(1)
  })
})

async function fixture(exchangeAttempts: number): Promise<string> {
  const flowId = await insertTestOAuthAuthorization({
    provider: 'github',
    status: 'callback_received',
    callbackCodeCiphertext: 'invalid-ciphertext-native-failure-control',
    callbackReceivedAt: new Date(),
    exchangeAttempts,
  })
  onTestFinished(() => deleteTestOAuthAuthorizationFixtures({ authorizationIds: [flowId] }))
  return flowId
}
