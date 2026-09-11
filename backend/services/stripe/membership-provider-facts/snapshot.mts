import type { QueryExecutor } from '@data-stores/psql'
import type Stripe from 'stripe'
import sql from 'sql-template-strings'
import { getStripeObjectNumber, mapStripeWebhookStatus } from '../webhook-utils.mts'

export class StripeProviderFactVerdictError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'StripeProviderFactVerdictError'
  }
}

export type AuthoritativeStripeMembershipSnapshot = {
  membershipProviderProductId: string
  membershipProductId: string
  observedPriceMinorUnits: number
  observedPriceCurrencyCode: string
  effectiveAt: Date
  expiresAt: Date | null
  cancelledAt: Date | null
  expiredAt: Date | null
  pastDueAt: Date | null
  pausedAt: Date | null
  reconciliationAt: Date
  autoRenews: boolean
  terminal: boolean
  renewal: {
    id: string
    membership_product_id: string
    price: Stripe.Price
    effectiveAt: Date
  } | null
}

export async function getAuthoritativeStripeMembershipSnapshot(
  subscription: Stripe.Subscription,
  fact: {
    application_id: string
    membership_product_id: string
    effective_at: Date
    expires_at: Date | null
    cancelled_at: Date | null
    expired_at: Date | null
    past_due_at: Date | null
    paused_at: Date | null
    received_at: Date
  },
  observedAt: Date,
  query: QueryExecutor,
): Promise<AuthoritativeStripeMembershipSnapshot> {
  const item = subscription.items.data[0]
  const price = getFixedPrice(item?.price)
  if (!price)
    throw new StripeProviderFactVerdictError(
      `Stripe subscription ${subscription.id} is missing a fixed recurring price`,
    )
  const periodEnd =
    getTimestamp(subscription, 'current_period_end') ??
    (item ? getTimestamp(item, 'current_period_end') : null)
  const effectiveAt =
    getTimestamp(subscription, 'start_date') ??
    getTimestamp(subscription, 'current_period_start') ??
    fact.effective_at
  const status = mapStripeWebhookStatus(subscription.status)
  const recoverableCancellation = subscription.status === 'unpaid'
  const recoverableExpiration = subscription.status === 'incomplete'
  const cancelledAt =
    status === 'cancelled'
      ? (getTimestamp(subscription, 'canceled_at') ??
        fact.cancelled_at ??
        (recoverableCancellation ? observedAt : fact.received_at))
      : null
  const expiredAt =
    status === 'expired'
      ? (getTimestamp(subscription, 'ended_at') ??
        fact.expired_at ??
        (recoverableExpiration ? observedAt : fact.received_at))
      : null
  const pastDueAt = status === 'past_due' ? (fact.past_due_at ?? observedAt) : null
  const pausedAt = status === 'paused' ? (fact.paused_at ?? observedAt) : null
  const terminal =
    subscription.status === 'canceled' || subscription.status === 'incomplete_expired'
  const cancelAt = getTimestamp(subscription, 'cancel_at')
  const autoRenews =
    !terminal &&
    !subscription.cancel_at_period_end &&
    !(cancelAt !== null && periodEnd !== null && cancelAt <= periodEnd)
  const renewalPrice =
    autoRenews && periodEnd ? getScheduledRenewalPrice(subscription, periodEnd, price) : null
  const mappings = await getStripeProviderProductMappings(
    subscription,
    fact.application_id,
    price.id,
    renewalPrice?.id,
    query,
  )
  const mapping = mappings.get(price.id) ?? null
  const renewalMapping = renewalPrice ? (mappings.get(renewalPrice.id) ?? null) : null
  if (!mapping) throw new StripeProviderFactVerdictError(`Unmapped Stripe price ID: ${price.id}`)
  if (renewalPrice && periodEnd && renewalPrice.id !== price.id && !renewalMapping)
    throw new StripeProviderFactVerdictError(`Unmapped Stripe renewal price ID: ${renewalPrice.id}`)
  const renewal =
    renewalPrice && periodEnd
      ? createRenewalSnapshot(renewalPrice, price, mapping, renewalMapping, periodEnd)
      : null
  return {
    membershipProviderProductId: mapping.id,
    membershipProductId: mapping.membership_product_id,
    observedPriceMinorUnits: price.unit_amount,
    observedPriceCurrencyCode: price.currency,
    effectiveAt,
    expiresAt: periodEnd ?? fact.expires_at,
    cancelledAt,
    expiredAt,
    pastDueAt,
    pausedAt,
    reconciliationAt: cancelledAt ?? expiredAt ?? pastDueAt ?? pausedAt ?? fact.received_at,
    autoRenews,
    terminal,
    renewal,
  }
}

function createRenewalSnapshot(
  renewalPrice: Stripe.Price,
  currentPrice: Stripe.Price,
  currentMapping: StripeProviderProductMapping,
  renewalMapping: StripeProviderProductMapping | null,
  effectiveAt: Date,
): AuthoritativeStripeMembershipSnapshot['renewal'] {
  const mapping = renewalPrice.id === currentPrice.id ? currentMapping : renewalMapping
  return mapping ? { ...mapping, price: renewalPrice, effectiveAt } : null
}

function getScheduledRenewalPrice(
  subscription: Stripe.Subscription,
  periodEnd: Date,
  currentPrice: Stripe.Price,
): Stripe.Price | null {
  if (subscription.schedule == null) return currentPrice
  if (typeof subscription.schedule === 'string') return null
  const phase = subscription.schedule.phases.find(
    candidate => candidate.start_date === periodEnd.getTime() / 1000,
  )
  if (!phase) return currentPrice
  const price = getFixedPrice(phase.items[0]?.price)
  return price?.recurring ? price : null
}

async function getStripeProviderProductMappings(
  subscription: Stripe.Subscription,
  applicationId: string,
  currentPriceId: string,
  renewalPriceId: string | undefined,
  query: QueryExecutor,
): Promise<Map<string, StripeProviderProductMapping>> {
  const { rows } = await query(sql`/* getStripeProviderProductsForObservation */
    SELECT id, membership_product_id, provider_product_id FROM membership_provider_products
    WHERE provider = 'stripe' AND environment = ${subscription.livemode ? 'production' : 'test'}
      AND application_id = ${applicationId}
      AND (provider_product_id = ${currentPriceId} OR provider_product_id = ${renewalPriceId ?? currentPriceId})`)
  return new Map(
    (rows as StripeProviderProductMapping[]).map(mapping => [mapping.provider_product_id, mapping]),
  )
}

type StripeProviderProductMapping = {
  id: string
  membership_product_id: string
  provider_product_id: string
}

function getFixedPrice(
  price: Stripe.Price | Stripe.DeletedPrice | string | undefined,
): (Stripe.Price & { unit_amount: number }) | null {
  if (
    !price ||
    typeof price === 'string' ||
    ('deleted' in price && price.deleted) ||
    price.unit_amount === null
  )
    return null
  return price as Stripe.Price & { unit_amount: number }
}

function getTimestamp(object: object, name: string): Date | null {
  const value = getStripeObjectNumber((object as Record<string, unknown>)[name])
  return value ? new Date(value * 1000) : null
}
