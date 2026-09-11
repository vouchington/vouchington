import {
  DEFAULT_STRIPE_MEMBERSHIP_APPLICATION_CONTEXT,
  getStripeMembershipSourceIdentity as getMembershipSourceIdentity,
  type StripeMembershipApplicationContext,
  type StripeMembershipSourceIdentity,
} from '@services/memberships/create-types'

export function getStripeMembershipSourceIdentity(
  subscriptionId: string,
  livemode: boolean | undefined,
  applicationContext: StripeMembershipApplicationContext = DEFAULT_STRIPE_MEMBERSHIP_APPLICATION_CONTEXT,
): StripeMembershipSourceIdentity {
  return getMembershipSourceIdentity({
    stripeSubscriptionId: subscriptionId,
    providerEnvironment: livemode === false ? 'test' : 'production',
    providerApplicationId: applicationContext.applicationId,
  })
}
