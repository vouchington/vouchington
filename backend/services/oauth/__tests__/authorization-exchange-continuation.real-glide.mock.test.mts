import { randomUUID } from 'node:crypto'
import { v7 as uuidv7 } from 'uuid'
import { createTestUserWithId, createTestUsername } from '@voucha/test-helpers/entities/users'
import { describe, expect, it, onTestFinished, vi } from 'vitest'
import {
  deleteTestOAuthAuthorizationFixtures,
  getTestOAuthAuthorization,
  insertTestOAuthAuthorization,
  markTestOAuthAuthorizationExchanging,
} from '@voucha/test-helpers/entities/oauth-authorizations'
import { getTestOAuthExchangeAttempts } from '@voucha/test-helpers/entities/oauth-exchange-attempts'
import { runTestOAuthExchangeContinuation } from '@voucha/test-helpers/oauth-exchange-continuation'
import {
  insertTestOAuthAccount,
  connectTestOAuthAccount,
} from '@voucha/test-helpers/entities/oauth-accounts'
import { settleOAuthAuthorizationExchangeClaim } from '../authorization-exchange-disposition.mts'
import {
  claimOAuthAuthorizationExchange,
  releaseOAuthAuthorizationExchangeClaim,
} from '../authorization-exchange-state.mts'

vi.mock<typeof import('glide-mq')>(import('glide-mq'), async importOriginal => importOriginal())

describe('OAuth authorization exchange durable queue continuation', () => {
  it.each(['rejection', 'release'] as const)(
    'resumes native %s contention on the second real queue attempt without another provider attempt',
    async fault => {
      const id = await fixture(fault === 'rejection' ? 4 : 0)
      const result = await runTestOAuthExchangeContinuation(id, fault)
      expect(result.attempts).toHaveLength(2)
      expect(result.attempts[0]?.claimId).toBeUndefined()
      expect(result.attempts[1]?.claimId).toEqual(expect.any(String))
      expect(Object.keys(result.attempts[1]?.data ?? {}).toSorted()).toEqual([
        'authorizationId',
        'exchangeClaimId',
      ])
      expect(result.decryptCalls).toBe(1)
      expect(result.providerCalls).toBe(0)
      expect(result.firstFailure).toBeInstanceOf(AggregateError)
      if (!(result.firstFailure instanceof AggregateError))
        throw new Error('Expected actual primary and native contention')
      expect(result.firstFailure.cause).toBe(result.primary)
      expect(result.firstFailure.errors[1]).toMatchObject({ code: '55P03' })
      expect(result.state).toBe(fault === 'rejection' ? 'completed' : 'failed')
      expect(await getTestOAuthAuthorization(id)).toMatchObject({
        status: fault === 'rejection' ? 'rejected' : 'callback_received',
        exchange_claim_id: null,
      })
    },
  )

  it('settles an armed provider outcome after native contention without admitting a third attempt', async () => {
    const id = await fixture(0)
    const claim = await claimOAuthAuthorizationExchange(id)
    if (!claim) throw new Error('Expected the actual committed claim')
    const result = await runTestOAuthExchangeContinuation(
      id,
      'provider-outcome',
      claim.exchange_claim_id,
    )
    expect(result.attempts).toHaveLength(2)
    expect(result.firstFailure).toMatchObject({ code: '55P03' })
    expect(result.attempts[1]?.data).toEqual({
      authorizationId: id,
      exchangeClaimId: claim.exchange_claim_id,
      exchangeProviderRequestArmed: true,
    })
    expect(result.decryptCalls).toBe(0)
    expect(result.providerCalls).toBe(0)
    expect(result.state).toBe('completed')
    expect(result.data).toEqual({ authorizationId: id })
    expect(await getTestOAuthExchangeAttempts(id)).toHaveLength(1)
    expect(await getTestOAuthAuthorization(id)).toMatchObject({
      status: 'rejected',
      callback_error: 'provider_exchange_outcome_unknown',
      callback_code_ciphertext: null,
      exchange_claim_id: null,
    })
  })

  it('releases the unused claim before an ID-only retry after ownership storage fails', async () => {
    const id = await fixture(0, 'callback_received', 'x')
    const result = await runTestOAuthExchangeContinuation(id, 'ownership-write')
    expect(result.attempts).toHaveLength(2)
    expect(result.decryptCalls).toBe(1)
    expect(result.providerCalls).toBe(0)
    expect(result.firstFailure).toBe(result.injectedError)
    expect(result.state).toBe('failed')
    expect(result.terminalError).toMatchObject({
      message: expect.stringContaining('Invalid encrypted secret format'),
    })
    expect(await getTestOAuthExchangeAttempts(id)).toHaveLength(2)
    expect(await getTestOAuthAuthorization(id)).toMatchObject({
      status: 'callback_received',
      exchange_claim_id: null,
    })
  })

  it('observes the released claim when the initial job update commits but its response fails', async () => {
    const id = await fixture(0)
    const result = await runTestOAuthExchangeContinuation(id, 'ownership-response')
    expect(result.attempts).toHaveLength(2)
    expect(result.attempts[1]?.data.exchangeClaimId).toEqual(expect.any(String))
    expect(result.firstFailure).toBe(result.injectedError)
    expect(result.decryptCalls).toBe(0)
    expect(result.providerCalls).toBe(0)
    expect(result.state).toBe('failed')
    expect(result.terminalError).toMatchObject({
      message: expect.stringContaining('continuation disposed as released'),
    })
    expect(await getTestOAuthExchangeAttempts(id)).toHaveLength(1)
    expect(await getTestOAuthAuthorization(id)).toMatchObject({
      status: 'callback_received',
      exchange_claim_id: null,
    })
  })

  it('terminalizes a stale unknown claim when a rebuilt real queue job has only its authorization ID', async () => {
    const id = uuidv7()
    const claimId = uuidv7()
    onTestFinished(() => deleteTestOAuthAuthorizationFixtures({ authorizationIds: [id] }))
    await insertTestOAuthAuthorization({
      id,
      provider: 'github',
      status: 'exchanging',
      exchangeClaimId: claimId,
      callbackCodeCiphertext: 'invalid-owned-continuation-ciphertext',
      callbackReceivedAt: new Date(),
      updatedAt: new Date(Date.now() - 61_000),
    })
    const result = await runTestOAuthExchangeContinuation(id, 'lost-provider-marker')
    expect(result.attempts).toHaveLength(1)
    expect(result.attempts[0]?.data).toEqual({ authorizationId: id })
    expect(result.decryptCalls).toBe(0)
    expect(result.providerCalls).toBe(0)
    expect(result.state).toBe('completed')
    expect(await getTestOAuthExchangeAttempts(id)).toHaveLength(1)
    expect(await getTestOAuthAuthorization(id)).toMatchObject({
      status: 'rejected',
      callback_error: 'provider_exchange_outcome_unknown',
      callback_code_ciphertext: null,
      exchange_claim_id: null,
    })
  })

  it('expires the ID-only second attempt after actual ownership storage failure and clears its secrets', async () => {
    const id = await fixture(0)
    const result = await runTestOAuthExchangeContinuation(id, 'ownership-write', undefined, true)
    expect(result.attempts).toHaveLength(2)
    expect(result.firstFailure).toBe(result.injectedError)
    expect(result.attempts[1]?.data).toEqual({ authorizationId: id })
    expect(result.decryptCalls).toBe(0)
    expect(result.providerCalls).toBe(0)
    expect(result.state).toBe('completed')
    expect(await getTestOAuthExchangeAttempts(id)).toHaveLength(1)
    expect(await getTestOAuthAuthorization(id)).toMatchObject({
      status: 'expired',
      exchange_claim_id: null,
      callback_code_ciphertext: null,
      completion_token_ciphertext: null,
    })
  })

  it.each([0, 4])(
    'retains the provider primary when clearing committed disposition fails at prior count %s',
    async priorAttempts => {
      const id = await fixture(priorAttempts)
      const result = await runTestOAuthExchangeContinuation(id, 'clear-write')
      expect(result.firstFailure).toBeInstanceOf(AggregateError)
      if (!(result.firstFailure instanceof AggregateError))
        throw new Error('Expected ordered primary and ownership failure')
      expect(result.firstFailure.errors).toEqual([result.primary, result.injectedError])
      expect(result.firstFailure.cause).toBe(result.primary)
      expect(result.attempts).toHaveLength(2)
      expect(result.decryptCalls).toBe(1)
      expect(result.providerCalls).toBe(0)
      expect(result.data).toEqual({ authorizationId: id })
      expect(await getTestOAuthExchangeAttempts(id)).toHaveLength(priorAttempts + 1)
    },
  )

  it('does not clear or reject a successor claim when an old job resumes', async () => {
    const id = await fixture(0)
    const oldClaim = randomUUID()
    await markTestOAuthAuthorizationExchanging(id, oldClaim)
    await releaseOAuthAuthorizationExchangeClaim(id, oldClaim)
    const successor = randomUUID()
    await markTestOAuthAuthorizationExchanging(id, successor)
    await expect(settleOAuthAuthorizationExchangeClaim(id, oldClaim)).resolves.toBe('superseded')
    expect(await getTestOAuthAuthorization(id)).toMatchObject({
      status: 'exchanging',
      exchange_claim_id: successor,
    })
  })

  it('preserves an already terminal authorization when a recorded claim resumes', async () => {
    const id = await fixture(5, 'rejected')
    const before = await getTestOAuthAuthorization(id)
    await expect(settleOAuthAuthorizationExchangeClaim(id, randomUUID())).resolves.toBe('terminal')
    expect(await getTestOAuthAuthorization(id)).toEqual(before)
  })

  it.each(['completion_ready', 'completed'] as const)(
    'preserves %s authorization and account identity when recorded ownership resumes',
    async status => {
      const accountId = `oauth-continuation-${randomUUID()}`
      const userId = uuidv7()
      const ids: string[] = []
      onTestFinished(async () => {
        await deleteTestOAuthAuthorizationFixtures({
          authorizationIds: ids,
          githubUserIds: [accountId],
          userIds: [userId],
        })
      })
      await createTestUserWithId(userId, createTestUsername())
      await insertTestOAuthAccount('github', accountId)
      await connectTestOAuthAccount('github', userId, accountId)
      const id = await insertTestOAuthAuthorization({
        provider: 'github',
        status,
        providerUserId: accountId,
        purpose: 'connect',
        initiatingUserId: userId,
        callbackReceivedAt: new Date(),
        completionReadyAt: new Date(),
        ...(status === 'completed'
          ? { completedAt: new Date(), resultKind: 'connected', resultUserId: userId }
          : {}),
      })
      ids.push(id)
      const before = await getTestOAuthAuthorization(id)
      expect(before).toMatchObject({ status, github_user_id: accountId })
      await expect(settleOAuthAuthorizationExchangeClaim(id, randomUUID())).resolves.toBe(
        'terminal',
      )
      expect(await getTestOAuthAuthorization(id)).toEqual(before)
    },
  )
})

async function fixture(
  exchangeAttempts: number,
  status: 'callback_received' | 'rejected' = 'callback_received',
  provider: 'github' | 'x' = 'github',
) {
  const id = await insertTestOAuthAuthorization({
    provider,
    status,
    callbackCodeCiphertext: 'invalid-owned-continuation-ciphertext',
    callbackReceivedAt: new Date(),
    exchangeAttempts,
  })
  onTestFinished(() => deleteTestOAuthAuthorizationFixtures({ authorizationIds: [id] }))
  return id
}
