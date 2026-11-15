import type Stripe from 'stripe'
import { confirmStripeRefundRequestRejection } from './refund-request-errors.mts'
import { buildRefundParams, buildRefundListParams, parseStripePage } from '@vouchington/stripe'
import { getStripeClient } from './client.mts'

const refundRequestsInFlight = new WeakMap<
  Stripe,
  Map<string, { active: number; contended: boolean }>
>()

const STRIPE_REFUND_PAGE_LIMIT = 100

export interface StripeRefundPage {
  refunds: Stripe.Refund[]
  hasMore: boolean
  nextCursor: string | undefined
}

/* no-mistakes: integration=stripe */
export async function createStripeRefund(
  options: {
    chargeId?: string
    paymentIntentId?: string
    amountMinorUnits?: number
    idempotencyKey: string
    metadata?: Record<string, string>
  },
  stripe = getStripeClient(),
): Promise<Stripe.Response<Stripe.Refund>> {
  const requests =
    refundRequestsInFlight.get(stripe) ?? new Map<string, { active: number; contended: boolean }>()
  refundRequestsInFlight.set(stripe, requests)
  const concurrent = requests.get(options.idempotencyKey) ?? { active: 0, contended: false }
  concurrent.contended ||= concurrent.active > 0
  concurrent.active++
  requests.set(options.idempotencyKey, concurrent)
  let providerRequestCount = 0
  const observeRequest = (event: Stripe.RequestEvent) => {
    if (
      event.idempotency_key === options.idempotencyKey &&
      event.method === 'POST' &&
      event.path === '/v1/refunds'
    )
      providerRequestCount++
  }
  const events: {
    on(event: 'request', listener: (event: Stripe.RequestEvent) => void): void
    off(event: 'request', listener: (event: Stripe.RequestEvent) => void): void
  } = stripe
  events.on('request', observeRequest)
  try {
    return await stripe.refunds.create(buildRefundParams(options), {
      idempotencyKey: options.idempotencyKey,
    })
  } catch (err) {
    confirmStripeRefundRequestRejection(err, concurrent.contended ? 0 : providerRequestCount)
    throw err
  } finally {
    events.off('request', observeRequest)
    concurrent.active--
    if (concurrent.active === 0) requests.delete(options.idempotencyKey)
  }
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
