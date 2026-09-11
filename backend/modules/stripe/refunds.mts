import type Stripe from 'stripe'
import { getStripeClient } from './client.mts'

const STRIPE_REFUND_PAGE_LIMIT = 100

export interface StripeRefundPage {
  refunds: Stripe.Refund[]
  hasMore: boolean
  nextCursor: string | undefined
}

/* no-mistakes: integration=stripe */
export function createStripeRefund(options: {
  chargeId?: string
  paymentIntentId?: string
  amountMinorUnits?: number
  idempotencyKey: string
}): Promise<Stripe.Response<Stripe.Refund>> {
  const stripe = getStripeClient()
  return stripe.refunds.create(
    {
      ...(options.chargeId ? { charge: options.chargeId } : {}),
      ...(options.paymentIntentId ? { payment_intent: options.paymentIntentId } : {}),
      ...(options.amountMinorUnits !== undefined ? { amount: options.amountMinorUnits } : {}),
    },
    { idempotencyKey: options.idempotencyKey },
  )
}

/* no-mistakes: integration=stripe */
export function getStripeRefund(refundId: string): Promise<Stripe.Response<Stripe.Refund>> {
  return getStripeClient().refunds.retrieve(refundId)
}

/* no-mistakes: integration=stripe */
export function listStripeRefundsForCharge(
  chargeId: string,
): Promise<Stripe.Response<Stripe.ApiList<Stripe.Refund>>> {
  const stripe = getStripeClient()
  return stripe.refunds.list({ charge: chargeId })
}

/* no-mistakes: integration=stripe */
export async function listStripeRefundsForPaymentPage(options: {
  chargeId: string | null
  paymentIntentId: string | null
  startingAfter?: string
}): Promise<StripeRefundPage> {
  if (!options.chargeId && !options.paymentIntentId)
    throw new Error('Stripe refund lookup requires a charge or payment intent')
  if (options.chargeId && options.paymentIntentId)
    throw new Error('Stripe refund lookup cannot use both charge and payment intent')
  const page = await getStripeClient().refunds.list({
    ...(options.chargeId ? { charge: options.chargeId } : {}),
    ...(options.paymentIntentId ? { payment_intent: options.paymentIntentId } : {}),
    limit: STRIPE_REFUND_PAGE_LIMIT,
    ...(options.startingAfter ? { starting_after: options.startingAfter } : {}),
  })
  if (!page.has_more) {
    return { refunds: page.data, hasMore: false, nextCursor: undefined }
  }
  const lastRefund = page.data.at(-1)
  if (!lastRefund?.id) throw new Error('Stripe returned has_more without a refund cursor')
  if (lastRefund.id === options.startingAfter)
    throw new Error('Stripe returned has_more without advancing the refund cursor')
  return { refunds: page.data, hasMore: true, nextCursor: lastRefund.id }
}
