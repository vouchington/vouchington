import { describe, expect, it, vi } from 'vitest'
import { beginTransaction, isTestPostgresQueryWaitingForLock } from '@voucha/test-helpers'
import { lockReferralLinkEligibility } from './referral-link-eligibility-lock.mts'

describe('referral link eligibility lock', () => {
  it('serializes rule mutations after an in-flight eligibility decision', async () => {
    const sharedAcquired = Promise.withResolvers<void>()
    const releaseShared = Promise.withResolvers<void>()
    const exclusiveAcquired = Promise.withResolvers<void>()
    const sharedTransaction = holdReferralEligibilityLock('shared', sharedAcquired, releaseShared)
    await sharedAcquired.promise
    const exclusiveTransaction = holdReferralEligibilityLock(
      'exclusive',
      exclusiveAcquired,
      undefined,
    )

    try {
      await vi.waitFor(expectReferralEligibilityLockWait, { timeout: 5_000 })
    } finally {
      releaseShared.resolve()
    }

    await Promise.all([sharedTransaction, exclusiveTransaction])
    await expect(exclusiveAcquired.promise).resolves.toBeUndefined()
  })
})

async function expectReferralEligibilityLockWait(): Promise<void> {
  expect(await isTestPostgresQueryWaitingForLock('lockReferralLinkEligibility')).toBe(true)
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
