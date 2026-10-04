import { getMembershipWorkLimits } from '@services/memberships/work-limits'
import { getUsersApproachingRenewalWithPriceIncrease } from '@services/memberships'
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

    // oxlint-disable-next-line no-await-in-loop -- bounds concurrent fan-out to one page.
    await enqueueBulkSendRenewalPriceIncreaseEmail(
      users.map(u => ({
        userId: u.user_id,
        membershipId: u.membership_id,
        membershipProviderObservationId: u.membership_provider_observation_id,
      })),
    )
    if (users.length < batchSize) return { hasMore: false }
    afterId = users.at(-1)!.membership_id
  }
  await enqueueRenewalNotificationCheck({ afterId })
  return { hasMore: true }
}
