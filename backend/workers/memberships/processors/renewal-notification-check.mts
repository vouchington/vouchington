import { getMembershipWorkLimits } from '@services/memberships/work-limits'
import {
  getUsersApproachingRenewalWithPriceIncrease,
  prepareRenewalPriceIncreaseNotification,
} from '@services/memberships'
import {
  enqueueBulkSendRenewalPriceIncreaseEmail,
  enqueueRenewalNotificationCheck,
} from '@queues/memberships/enqueues'

export async function processRenewalNotificationCheckDispatcher(
  data: { afterId?: string } = {},
): Promise<{ hasMore: boolean }> {
  const { batchSize, maxBatches } = getMembershipWorkLimits()
  let afterId = data.afterId
  for (let batch = 0; batch < maxBatches; batch++) {
    // oxlint-disable-next-line no-await-in-loop -- keyset page advances only after its enqueue settles.
    const users = await getUsersApproachingRenewalWithPriceIncrease(afterId, batchSize)
    if (users.length === 0) return { hasMore: false }

    // oxlint-disable-next-line no-await-in-loop -- prepare one bounded page before enqueue.
    const prepared = await Promise.all(
      users.map(async user => {
        const generation = await prepareRenewalPriceIncreaseNotification(
          user.membership_id,
          user.user_id,
          user.membership_provider_observation_id,
        )
        return generation
          ? [
              {
                userId: user.user_id,
                membershipId: user.membership_id,
                membershipProviderObservationId: user.membership_provider_observation_id,
                generation,
              },
            ]
          : []
      }),
    )
    // oxlint-disable-next-line no-await-in-loop -- keyset progress waits for this page's admission.
    await enqueueBulkSendRenewalPriceIncreaseEmail(prepared.flat())
    if (users.length < batchSize) return { hasMore: false }
    afterId = users.at(-1)!.membership_id
  }
  await enqueueRenewalNotificationCheck({ afterId })
  return { hasMore: true }
}
