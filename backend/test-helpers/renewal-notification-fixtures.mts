import { decodeUuidCursor, isSimpleCursor } from '@modules/pagination'
import { encodeUuidCursorBefore } from './modules/pagination/uuid-cursors.mts'
import { getUsersApproachingRenewalWithPriceIncrease } from '../services/memberships/renewal-check.mts'
import type { RenewalBusinessTime } from '../services/memberships/renewal-business-time.mts'
import { randomUUID } from 'node:crypto'
import { createTestSku, attachTestStripeProductionProviderObservation } from './index.mts'
import { createMembership } from '../services/memberships/create.mts'

export function createPlusSku(
  priceMinorUnits: number,
  options: {
    currency_code?: string
    provider_application_id: string
    stripe_price_id?: string
  },
) {
  return createTestSku({
    plan: 'plus',
    price_minor_units: priceMinorUnits,
    interval: 'monthly',
    ...options,
  })
}

export async function createObservedRenewingMembership(
  userId: string,
  currentSku: { id: string; membership_provider_product_id: string },
  renewalSku: { membership_provider_product_id: string },
  providerApplicationId: string,
  renewalEffectiveAt: Date,
  membershipExpiresAt = renewalEffectiveAt,
) {
  const membership = await createMembership({
    userId,
    plan: 'plus',
    skuId: currentSku.id,
    expiresAt: membershipExpiresAt,
    stripeSubscriptionId: `sub_renewal_${randomUUID()}`,
    providerEnvironment: 'production',
    providerApplicationId,
  })
  const observation = await attachTestStripeProductionProviderObservation({
    membership_id: membership.id,
    membership_provider_product_id: currentSku.membership_provider_product_id,
    renewal_membership_provider_product_id: renewalSku.membership_provider_product_id,
    renewal_effective_at: renewalEffectiveAt,
  })
  return { membership, ...observation }
}

/** Seek to exactly the owned membership; an excluded row's foreign lookahead is never asserted. */
export async function readOwnedRenewalCandidates(membershipId: string, time: RenewalBusinessTime) {
  const afterId = decodeUuidCursor(
    encodeUuidCursorBefore(membershipId),
    isSimpleCursor,
    'Invalid owned renewal cursor',
  ).id
  return getUsersApproachingRenewalWithPriceIncrease(afterId, 1, time)
}
