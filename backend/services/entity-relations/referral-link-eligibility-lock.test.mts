import { describe, expect, it } from 'vitest'
import { beginTransaction } from '@voucha/test-helpers'
import { lockReferralLinkEligibility } from './referral-link-eligibility-lock.mts'

describe('referral link eligibility lock', () => {
  it('serializes rule mutations after an in-flight eligibility decision', async () => {
    const sharedAcquired = Promise.withResolvers<void>()
    const releaseShared = Promise.withResolvers<void>()
    const sharedTransaction = holdReferralEligibilityLock('shared', sharedAcquired, releaseShared)
    await sharedAcquired.promise

    await expect(lockReferralEligibilityWithTimeout('exclusive')).rejects.toMatchObject({
      code: '55P03',
    })

    releaseShared.resolve()
    await sharedTransaction
    await lockReferralEligibilityWithTimeout('exclusive')
  })
})

async function lockReferralEligibilityWithTimeout(mode: 'shared' | 'exclusive'): Promise<void> {
  await using query = await beginTransaction()
  await query(`/* referral eligibility lock timeout */ SET LOCAL lock_timeout = '50ms'`)
  await lockReferralLinkEligibility(query, mode)
  await query.commit()
}

async function holdReferralEligibilityLock(
  mode: 'shared' | 'exclusive',
  acquired: PromiseWithResolvers<void>,
  release: PromiseWithResolvers<void> | undefined,
): Promise<void> {
  await using query = await beginTransaction()
  await lockReferralLinkEligibility(query, mode)
  acquired.resolve()
  if (release) await release.promise
  await query.commit()
}
