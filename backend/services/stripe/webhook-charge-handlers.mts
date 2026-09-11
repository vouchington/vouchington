import { getStripeObjectNumber, getStripeObjectString } from './webhook-utils.mts'
import { getStripeInvoice, listStripeRefundsForCharge } from '@modules/stripe'
import {
  DEFAULT_STRIPE_MEMBERSHIP_APPLICATION_CONTEXT,
  type StripeMembershipApplicationContext,
} from '@services/memberships/create-types'
import {
  getMembershipRefundTargetByStripeSubscriptionId,
  recordMembershipRefundWebhook,
} from '@services/memberships'
import onError from '@modules/on-error'

export async function handleChargeRefunded(
  eventId: string,
  eventData: Record<string, unknown>,
  providerEnvironment: 'test' | 'production',
  applicationContext: StripeMembershipApplicationContext = DEFAULT_STRIPE_MEMBERSHIP_APPLICATION_CONTEXT,
): Promise<void> {
  const invoiceId = getStripeObjectString(eventData.invoice)
  if (!invoiceId) {
    onError(new Error('charge.refunded: no invoice on charge — skipping (non-membership charge)'))
    return
  }

  const chargeCreated = getStripeObjectNumber(eventData.created)
  const chargeOriginatedAt = new Date((chargeCreated ?? 0) * 1000)
  if (
    chargeCreated === null ||
    !Number.isSafeInteger(chargeCreated) ||
    chargeCreated < 1 ||
    !Number.isFinite(chargeOriginatedAt.getTime())
  ) {
    onError(new Error('charge.refunded: invalid charge creation time — skipping'))
    return
  }

  const invoice = await getStripeInvoice(invoiceId)
  const parent = invoice.parent as unknown as {
    subscription_details?: { subscription?: string }
  } | null
  const subscriptionId = parent?.subscription_details?.subscription ?? null
  if (!subscriptionId) {
    onError(
      new Error('charge.refunded: no subscription on invoice — skipping (non-subscription charge)'),
    )
    return
  }

  const refundTarget = await getMembershipRefundTargetByStripeSubscriptionId(
    subscriptionId,
    providerEnvironment,
    chargeOriginatedAt,
    applicationContext,
  )
  if (!refundTarget) {
    onError(
      new Error(`charge.refunded: no membership for subscription ${subscriptionId} — skipping`),
    )
    return
  }
  const { membershipId, membershipSourceId, userId } = refundTarget

  const chargeId = getStripeObjectString(eventData.id)
  if (!chargeId) return

  type EmbeddedRefundList = {
    data?: Array<{ id: string; amount: number; currency: string; payment_intent?: string | null }>
    has_more?: boolean
  }
  const embedded = eventData.refunds as EmbeddedRefundList | undefined
  const hasTruncated = embedded?.has_more === true || !embedded?.data

  const refunds = hasTruncated
    ? (await listStripeRefundsForCharge(chargeId)).data
    : (embedded?.data ?? [])

  const paymentIntentId = getStripeObjectString(eventData.payment_intent)

  const promises: Promise<void>[] = []
  for (const refund of refunds) {
    const amount = typeof refund.amount === 'number' ? refund.amount : 0
    if (amount <= 0) continue
    const currency = getStripeObjectString(refund.currency) ?? ''
    const piId = getStripeObjectString(refund.payment_intent) ?? paymentIntentId
    promises.push(
      recordMembershipRefundWebhook({
        membershipId,
        membershipSourceId,
        userId,
        stripeRefundId: refund.id,
        stripeChargeId: chargeId,
        stripePaymentIntentId: piId,
        amount: { amount, currency },
        stripeEventId: eventId,
      }),
    )
  }
  await Promise.all(promises)
}
