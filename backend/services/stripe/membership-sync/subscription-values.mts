import { getSkuByStripePriceIdForLifecycle } from '@services/memberships'
import type { StripeMembershipSourceIdentity } from '@services/memberships/create-types'
import type { Membership, MembershipStatus } from '@services/memberships/types'
import { getStripeSubscription } from '@modules/stripe/subscriptions'
import { getStripeObjectNumber, mapStripeSubscriptionStatus } from '../event-utils.mts'
import { getStripeTerminalTimestamp, getStripeTimestamp } from './clocks.mts'

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
  const currentPeriodEnd =
    getStripeObjectNumber(
      (subscription as unknown as Record<string, unknown>).current_period_end,
    ) ?? subscription.items.data[0]?.current_period_end
  const currentPeriodStart =
    getStripeObjectNumber(
      (subscription as unknown as Record<string, unknown>).current_period_start,
    ) ?? subscription.items.data[0]?.current_period_start
  return {
    status: mapStripeSubscriptionStatus(subscription.status),
    plan: sku.plan,
    skuId: sku.id,
    expiresAt: currentPeriodEnd ? new Date(currentPeriodEnd * 1000) : undefined,
    effectiveAt: getStripeTimestamp(subscription, 'start_date'),
    currentPeriodStart: currentPeriodStart ? new Date(currentPeriodStart * 1000) : undefined,
    terminalEffectiveAt: getStripeTerminalTimestamp(subscription),
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
  }
}
