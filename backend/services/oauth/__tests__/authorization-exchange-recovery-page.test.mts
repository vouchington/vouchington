import { describe, expect, it, onTestFinished } from 'vitest'
import {
  deleteTestOAuthAuthorizationFixtures,
  getTestOAuthAuthorization,
  insertTestOAuthAuthorization,
} from '@voucha/test-helpers/entities/oauth-authorizations'
import { withTestOAuthAuthorizationRowLocked } from '@voucha/test-helpers/entities/oauth-authorization-recovery'
import { getRecoverableOAuthAuthorizationIds } from '../authorization-exchange.mts'

describe('OAuth authorization exchange bounded recovery', () => {
  it.each([0, 5])(
    'fills the recovery bucket past a locked first row at attempt count %s',
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
      await withTestOAuthAuthorizationRowLocked(firstId, async () => {
        const recovered = await getRecoverableOAuthAuthorizationIds(1, ids)
        expect(recovered).toEqual(exchangeAttempts === 0 ? [secondId] : [])
        expect(await getTestOAuthAuthorization(firstId)).toMatchObject({
          status: 'callback_received',
        })
        expect(await getTestOAuthAuthorization(secondId)).toMatchObject({
          status: exchangeAttempts === 0 ? 'callback_received' : 'rejected',
        })
      })
    },
  )
})
