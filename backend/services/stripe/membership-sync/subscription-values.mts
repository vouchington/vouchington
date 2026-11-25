import { getSkuByStripePriceIdForLifecycle } from '@services/memberships'
import type { StripeMembershipSourceIdentity } from '@services/memberships/create-types'
import type { Membership, MembershipStatus } from '@services/memberships/types'
import { getStripeSubscription } from '@modules/stripe/subscriptions'
import { getStripeObjectTimestamp, getStripeSubscriptionPeriod } from '@vouchington/stripe'
import { mapStripeSubscriptionStatus } from '../event-utils.mts'
import { getStripeTerminalTimestamp } from './clocks.mts'

export type StripeSubscriptionMembershipValues = {
  status: MembershipStatus
  plan: Membership['plan']
  skuId: string
  expiresAt: Date | undefined
  effectiveAt: Date | undefined
  currentPeriodStart: Date | undefined
  terminalEffectiveAt: Date | undefined
  cancelAtPeriodEnd: boolean
}

export async function getStripeSubscriptionMembershipValues(
  subscription: Awaited<ReturnType<typeof getStripeSubscription>>,
  sourceIdentity: StripeMembershipSourceIdentity,
): Promise<StripeSubscriptionMembershipValues> {
  const priceId = subscription.items.data[0]?.price?.id
  if (!priceId)
    throw new Error(`Stripe subscription ${sourceIdentity.providerLineageId} is missing a price`)
  const sku = await getSkuByStripePriceIdForLifecycle(priceId, sourceIdentity)
  if (!sku) throw new Error(`Unmapped Stripe price ID: ${priceId}`)
  const { currentPeriodStart, currentPeriodEnd } = getStripeSubscriptionPeriod(subscription)
  return {
    status: mapStripeSubscriptionStatus(subscription.status),
    plan: sku.plan,
    skuId: sku.id,
    expiresAt: currentPeriodEnd ?? undefined,
    effectiveAt: getStripeObjectTimestamp(subscription.start_date) ?? undefined,
    currentPeriodStart: currentPeriodStart ?? undefined,
    terminalEffectiveAt: getStripeTerminalTimestamp(subscription),
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
  }
}
