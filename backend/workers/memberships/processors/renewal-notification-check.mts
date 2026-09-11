import { getUsersApproachingRenewalWithPriceIncrease } from '@services/memberships'
import { enqueueBulkSendRenewalPriceIncreaseEmail } from '@queues/memberships/enqueues'

export async function processRenewalNotificationCheckDispatcher(): Promise<void> {
  const users = await getUsersApproachingRenewalWithPriceIncrease()
  if (users.length === 0) return

  await enqueueBulkSendRenewalPriceIncreaseEmail(
    users.map(u => ({
      userId: u.user_id,
      membershipId: u.membership_id,
      membershipProviderObservationId: u.membership_provider_observation_id,
    })),
  )
}
