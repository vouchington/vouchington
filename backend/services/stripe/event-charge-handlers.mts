import { getStripeObjectNumber, getStripeObjectString } from './event-utils.mts'
import { getStripeInvoice, listStripeRefundsForCharge } from '@modules/stripe'
import {
  DEFAULT_STRIPE_MEMBERSHIP_APPLICATION_CONTEXT,
  type StripeMembershipApplicationContext,
} from '@services/memberships/create-types'
import {
  getMembershipRefundTargetByStripeSubscriptionId,
  leaseDueRefundReconciliation,
  recordMembershipRefundEvent,
} from '@services/memberships'
import { enqueueReconcileMembershipRefundOperationBestEffort } from '@queues/memberships/enqueues'
import onError from '@modules/on-error'

export async function handleChargeRefunded(
  eventId: string,
  eventData: Record<string, unknown>,
  providerEnvironment: 'test' | 'production',
  applicationContext: StripeMembershipApplicationContext = DEFAULT_STRIPE_MEMBERSHIP_APPLICATION_CONTEXT,
  wakeRefundReconciliations: (
    operationIds: readonly string[],
  ) => Promise<void> | void = wakeRefundReconciliationsBestEffort,
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
      recordMembershipRefundEvent({
        membershipId,
        membershipSourceId,
        userId,
        stripeRefundId: refund.id,
        stripeChargeId: chargeId,
        stripePaymentIntentId: piId,
        amount: { amount, currency },
        stripeEventId: eventId,
        stripeRefundMetadata: getStripeRefundMetadata(refund),
        providerApplicationId: applicationContext.applicationId,
        providerEnvironment,
      }).then(async receipt => await wakeRefundReconciliations(receipt.operationIds)),
    )
  }
  await Promise.all(promises)
}

function getStripeRefundMetadata(refund: unknown): Record<string, string> | null {
  const metadata = (refund as { metadata?: unknown }).metadata
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null
  const operationId = (metadata as Record<string, unknown>).membership_refund_operation_id
  const attemptId = (metadata as Record<string, unknown>).membership_refund_attempt_id
  return typeof operationId === 'string' && typeof attemptId === 'string'
    ? { membership_refund_operation_id: operationId, membership_refund_attempt_id: attemptId }
    : null
}

function wakeRefundReconciliationsBestEffort(operationIds: readonly string[]): void {
  void Promise.all(
    operationIds.map(async operationId => {
      const lease = await leaseDueRefundReconciliation(operationId)
      if (lease)
        void enqueueReconcileMembershipRefundOperationBestEffort({
          operationId: lease.id,
          leaseToken: lease.leaseToken,
        })
    }),
  ).catch(onError)
}
