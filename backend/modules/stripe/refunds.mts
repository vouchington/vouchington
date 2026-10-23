import type Stripe from 'stripe'
import { buildRefundParams, buildRefundListParams, parseStripePage } from '@vouchington/stripe'
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
  metadata?: Record<string, string>
}): Promise<Stripe.Response<Stripe.Refund>> {
  const stripe = getStripeClient()
  return stripe.refunds.create(buildRefundParams(options), {
    idempotencyKey: options.idempotencyKey,
  })
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
  const page = await getStripeClient().refunds.list(
    buildRefundListParams({ ...options, limit: STRIPE_REFUND_PAGE_LIMIT }),
  )
  const parsed = parseStripePage(page, options.startingAfter, 'refund')
  return { refunds: parsed.items, hasMore: parsed.hasMore, nextCursor: parsed.nextCursor }
}
