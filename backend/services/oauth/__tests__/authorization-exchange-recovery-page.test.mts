import { v7 as uuidv7 } from 'uuid'
import { describe, expect, it, onTestFinished } from 'vitest'
import {
  deleteTestOAuthAuthorizationFixtures,
  getTestOAuthAuthorization,
  insertTestOAuthAuthorization,
} from '@voucha/test-helpers/entities/oauth-authorizations'
import { getRecoverableOAuthAuthorizationIds } from '../authorization-exchange.mts'

describe('OAuth authorization exchange bounded recovery', () => {
  it('terminalizes only owned stale unknown claims while leaving live claims and foreign rows intact', async () => {
    const staleId = uuidv7()
    const foreignId = uuidv7()
    const liveId = uuidv7()
    const ids = [staleId, foreignId, liveId]
    onTestFinished(() => deleteTestOAuthAuthorizationFixtures({ authorizationIds: ids }))
    for (const id of ids) {
      await insertTestOAuthAuthorization({
        id,
        provider: 'github',
        status: 'exchanging',
        exchangeClaimId: uuidv7(),
        callbackCodeCiphertext: 'test-code-ciphertext',
        callbackReceivedAt: new Date(),
        updatedAt: new Date(Date.now() - (id === liveId ? 0 : 61_000)),
      })
    }
    expect(await getRecoverableOAuthAuthorizationIds(1, [staleId, liveId])).toEqual({
      ids: [],
      hasMore: true,
    })
    expect(await getTestOAuthAuthorization(staleId)).toMatchObject({
      status: 'rejected',
      callback_error: 'provider_exchange_outcome_unknown',
      callback_code_ciphertext: null,
      exchange_claim_id: null,
    })
    for (const id of [foreignId, liveId]) {
      expect(await getTestOAuthAuthorization(id)).toMatchObject({
        status: 'exchanging',
        callback_code_ciphertext: 'test-code-ciphertext',
      })
    }
  })

  it.each([0, 5])(
    'processes the first bounded candidate at attempt count %s',
    async exchangeAttempts => {
      const ids: string[] = []
      onTestFinished(() => deleteTestOAuthAuthorizationFixtures({ authorizationIds: ids }))
      const insertOwned = async () => {
        const id = await insertTestOAuthAuthorization({
          provider: 'github',
          status: 'callback_received',
          callbackCodeCiphertext: 'test-code-ciphertext',
          callbackReceivedAt: new Date(),
          exchangeAttempts,
        })
        ids.push(id)
      }
      await insertOwned()
      await insertOwned()
      const [firstId, secondId] = ids.toSorted()
      if (!firstId || !secondId) throw new Error('Expected two owned recovery candidates')
      const recovered = await getRecoverableOAuthAuthorizationIds(1, ids)
      expect(recovered.ids).toEqual(exchangeAttempts === 0 ? [firstId] : [])
      expect(recovered.hasMore).toBe(true)
      expect(await getTestOAuthAuthorization(firstId)).toMatchObject({
        status: exchangeAttempts === 0 ? 'callback_received' : 'rejected',
      })
      expect(await getTestOAuthAuthorization(secondId)).toMatchObject({
        status: 'callback_received',
      })
    },
  )
})
