import { randomUUID } from 'node:crypto'
import { v7 as uuidv7 } from 'uuid'
import { describe, expect, it, onTestFinished } from 'vitest'
import {
  deleteTestOAuthAuthorizationFixtures,
  expireTestOAuthAuthorization,
  getTestOAuthAuthorization,
  insertTestOAuthAuthorization,
  markTestOAuthAuthorizationExchanging,
} from '@voucha/test-helpers/entities/oauth-authorizations'
import { withTestOAuthAuthorizationRowLocked } from '@voucha/test-helpers/entities/oauth-authorization-recovery'
import {
  claimOAuthAuthorizationExchange,
  releaseOAuthAuthorizationExchangeClaim,
  validateOAuthAuthorizationExchangeClaim,
} from '../authorization-exchange-state.mts'
import { getRecoverableOAuthAuthorizationIds } from '../authorization-exchange-recovery.mts'

/** Real mutation boundary after queue persistence; no timer or native SQL is replaced. */
describe('OAuth native provider admission authority', () => {
  it('validates its current claim and reports actual NOWAIT contention without weakening the holder', async () => {
    const id = await fixture()
    const claimed = await claimOAuthAuthorizationExchange(id)
    if (!claimed) throw new Error('Expected an actual durable claim')
    await expect(
      validateOAuthAuthorizationExchangeClaim(id, claimed.exchange_claim_id),
    ).resolves.toBeUndefined()
    await withTestOAuthAuthorizationRowLocked(id, async () => {
      await expect(
        validateOAuthAuthorizationExchangeClaim(id, claimed.exchange_claim_id),
      ).rejects.toMatchObject({ code: '55P03' })
    })
    await expect(
      validateOAuthAuthorizationExchangeClaim(id, claimed.exchange_claim_id),
    ).resolves.toBeUndefined()
  })

  it('expires the owned authorization before rejecting admission after a persistence boundary', async () => {
    const id = await fixture()
    const claimed = await claimOAuthAuthorizationExchange(id)
    if (!claimed) throw new Error('Expected an actual durable claim')
    await expireTestOAuthAuthorization(id)
    await expect(
      validateOAuthAuthorizationExchangeClaim(id, claimed.exchange_claim_id),
    ).rejects.toThrow('lost its current unexpired claim')
    expect(await getTestOAuthAuthorization(id)).toMatchObject({
      status: 'expired',
      exchange_claim_id: null,
      callback_code_ciphertext: null,
    })
  })

  it('rejects stale terminalization and a released successor while preserving exact successor identity', async () => {
    const staleClaim = randomUUID()
    const staleId = await fixture(staleClaim)
    await expect(getRecoverableOAuthAuthorizationIds(1, [staleId])).resolves.toEqual({
      ids: [],
      hasMore: true,
    })
    await expect(validateOAuthAuthorizationExchangeClaim(staleId, staleClaim)).rejects.toThrow(
      'lost its current unexpired claim',
    )
    expect(await getTestOAuthAuthorization(staleId)).toMatchObject({
      status: 'rejected',
      callback_error: 'provider_exchange_outcome_unknown',
    })
    const id = await fixture()
    const claimed = await claimOAuthAuthorizationExchange(id)
    if (!claimed) throw new Error('Expected an actual durable claim')
    await releaseOAuthAuthorizationExchangeClaim(id, claimed.exchange_claim_id)
    const successor = randomUUID()
    await markTestOAuthAuthorizationExchanging(id, successor)
    await expect(
      validateOAuthAuthorizationExchangeClaim(id, claimed.exchange_claim_id),
    ).rejects.toThrow('lost its current unexpired claim')
    expect(await getTestOAuthAuthorization(id)).toMatchObject({
      status: 'exchanging',
      exchange_claim_id: successor,
    })
  })
})

async function fixture(claimId?: string) {
  const id = uuidv7()
  onTestFinished(() => deleteTestOAuthAuthorizationFixtures({ authorizationIds: [id] }))
  await insertTestOAuthAuthorization({
    id,
    provider: 'github',
    status: claimId ? 'exchanging' : 'callback_received',
    callbackCodeCiphertext: 'owned-admission-code',
    callbackReceivedAt: new Date(),
    ...(claimId
      ? { exchangeClaimId: claimId, exchangeAttempts: 5, updatedAt: new Date(Date.now() - 61_000) }
      : {}),
  })
  return id
}
