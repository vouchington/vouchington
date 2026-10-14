import type { RenewalBusinessTime } from '../services/memberships/renewal-business-time.mts'
import {
  claimRenewalPriceIncreaseNotification,
  prepareRenewalPriceIncreaseNotification,
} from '../services/memberships/renewal-check.mts'

export async function claimTestRenewalPriceIncreaseNotification(
  membershipId: string,
  userId: string,
  membershipProviderObservationId: string,
  time?: RenewalBusinessTime,
) {
  const generation = await prepareRenewalPriceIncreaseNotification(
    membershipId,
    userId,
    membershipProviderObservationId,
    time,
  )
  return generation
    ? claimRenewalPriceIncreaseNotification(
        membershipId,
        userId,
        membershipProviderObservationId,
        generation,
        time,
      )
    : null
}
