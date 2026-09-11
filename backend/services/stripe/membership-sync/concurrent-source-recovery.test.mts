import { describe, expect, it } from 'vitest'
import {
  getStripeMembershipSourceIdentity,
  type StripeMembershipApplicationContext,
} from '@services/memberships/create-types'
import type { getMembershipByStripeSubscriptionId } from '@services/memberships'
import { recoverConcurrentStripeMembershipSource } from './concurrent-source-recovery.mts'
import type { syncMembershipFromStripeSubscription } from './sync-existing.mts'

const applicationContext: StripeMembershipApplicationContext = {
  applicationId: 'stripe-concurrent-source-recovery-test',
}
const sourceIdentity = getStripeMembershipSourceIdentity({
  stripeSubscriptionId: 'sub_concurrent_source_recovery',
  providerApplicationId: applicationContext.applicationId,
})

describe('recoverConcurrentStripeMembershipSource', () => {
  it('synchronizes the newly created source in its application context', async () => {
    let lookedUpIdentity: typeof sourceIdentity | undefined
    const syncCalls: Parameters<typeof syncMembershipFromStripeSubscription>[] = []

    await expect(
      recoverConcurrentStripeMembershipSource(
        Object.assign(new Error('duplicate'), { code: '23505' }),
        {
          eventId: 'evt_concurrent_source_recovery',
          subscriptionId: 'sub_concurrent_source_recovery',
          sourceIdentity,
          applicationContext,
          dependencies: {
            getMembershipByStripeSubscriptionId: async identity => {
              lookedUpIdentity = identity
              return {} as Awaited<ReturnType<typeof getMembershipByStripeSubscriptionId>>
            },
            syncMembershipFromStripeSubscription: async (...args) => {
              syncCalls.push(args)
              return null
            },
          },
        },
      ),
    ).resolves.toBe(true)

    expect(lookedUpIdentity).toEqual(sourceIdentity)
    expect(syncCalls).toEqual([
      ['evt_concurrent_source_recovery', 'sub_concurrent_source_recovery', applicationContext],
    ])
  })

  it('leaves unrelated and unresolved errors to the caller', async () => {
    const dependencies = {
      getMembershipByStripeSubscriptionId: async () => null,
      syncMembershipFromStripeSubscription: async () => null,
    }
    const options = {
      eventId: 'evt_concurrent_source_recovery',
      subscriptionId: 'sub_concurrent_source_recovery',
      sourceIdentity,
      applicationContext,
      dependencies,
    }

    await expect(
      recoverConcurrentStripeMembershipSource(new Error('other'), options),
    ).resolves.toBe(false)
    await expect(
      recoverConcurrentStripeMembershipSource(
        Object.assign(new Error('duplicate'), { code: '23505' }),
        options,
      ),
    ).resolves.toBe(false)
  })
})
