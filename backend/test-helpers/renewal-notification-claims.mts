import {
  claimRenewalPriceIncreaseNotification,
  prepareRenewalPriceIncreaseNotification,
} from '../services/memberships/renewal-check.mts'

export async function claimTestRenewalPriceIncreaseNotification(
  membershipId: string,
  userId: string,
  membershipProviderObservationId: string,
) {
  const generation = await prepareRenewalPriceIncreaseNotification(
    membershipId,
    userId,
    membershipProviderObservationId,
  )
  return generation
    ? claimRenewalPriceIncreaseNotification(
        membershipId,
        userId,
        membershipProviderObservationId,
        generation,
      )
    : null
}
