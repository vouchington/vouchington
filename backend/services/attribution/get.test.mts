import { beforeAll, describe, expect, it } from 'vitest'
import { createTestUserDirect } from '@voucha/test-helpers'
import { setUserReferrerId } from '@voucha/test-helpers/entities/attributions'
import { v7 as uuidv7 } from 'uuid'
import { getReferrerIdForSession, getSignupCountByReferrerId } from './get.mts'
import { createSessionReferralAttribution } from './create.mts'

describe('get', () => {
  let referrerId: string

  beforeAll(async () => {
    const referrer = await createTestUserDirect()
    referrerId = referrer!.id

    const [user1, user2] = await Promise.all([createTestUserDirect(), createTestUserDirect()])
    await Promise.all([
      setUserReferrerId(user1!.id, referrerId),
      setUserReferrerId(user2!.id, referrerId),
    ])
  })

  describe('getSignupCountByReferrerId', () => {
    it('returns 0 for a user with no referrals', async () => {
      const noReferralUser = await createTestUserDirect()
      const count = await getSignupCountByReferrerId(noReferralUser!.id)
      expect(count).toBe(0)
    })

    it('returns the count of users referred by the given user', async () => {
      const count = await getSignupCountByReferrerId(referrerId)
      expect(count).toBeGreaterThanOrEqual(2)
    })
  })

  describe('getReferrerIdForSession', () => {
    it('returns null when the session has no attribution rows', async () => {
      const sessionId = uuidv7()
      expect(await getReferrerIdForSession(sessionId)).toBeNull()
    })

    it('returns the referrer for a session with a single click', async () => {
      const sessionId = uuidv7()
      const singleReferrer = await createTestUserDirect()
      await createSessionReferralAttribution({
        sessionId,
        referrer: singleReferrer.id,
        landingUrl: 'https://example.com/single-click',
      })

      expect(await getReferrerIdForSession(sessionId)).toBe(singleReferrer.id)
    })

    it('preserves the earliest referrer when that referrer is clicked again', async () => {
      const sessionId = uuidv7()
      const [referrerA, referrerB, referrerC] = await Promise.all([
        createTestUserDirect(),
        createTestUserDirect(),
        createTestUserDirect(),
      ])
      if (!referrerA || !referrerB || !referrerC) throw new Error('Failed to create referrers')

      await createSessionReferralAttribution({
        sessionId,
        referrer: referrerA.id,
        landingUrl: 'https://example.com/first-touch-a',
      })
      await createSessionReferralAttribution({
        sessionId,
        referrer: referrerB.id,
        landingUrl: 'https://example.com/first-touch-b',
      })
      await createSessionReferralAttribution({
        sessionId,
        referrer: referrerC.id,
        landingUrl: 'https://example.com/first-touch-c',
      })

      // True first touch was A — confirmed before the re-click.
      expect(await getReferrerIdForSession(sessionId)).toBe(referrerA.id)

      await createSessionReferralAttribution({
        sessionId,
        referrer: referrerA.id,
        landingUrl: 'https://example.com/first-touch-a-again',
      })

      expect(await getReferrerIdForSession(sessionId)).toBe(referrerA.id)
    })
  })
})
