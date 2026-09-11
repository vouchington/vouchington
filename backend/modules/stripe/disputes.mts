import type Stripe from 'stripe'
import { getStripeClient } from './client.mts'
import { listAllStripeInvoicePaymentsForPaymentIntent } from './invoice-payments.mts'

const MAX_STRIPE_DISPUTE_PAGES = 10

export type StripeDisputeSettlement = {
  lostDisputeAmountMinorUnits: number
  refundDeferred: boolean
}

export type WonStripeDisputeInvoice = {
  chargeId: string
  invoiceIds: string[]
  paymentIntentId: string
}

/* no-mistakes: integration=stripe */
export async function getWonStripeDisputeInvoice(
  disputeId: string,
): Promise<WonStripeDisputeInvoice | null> {
  const stripe = getStripeClient()
  const dispute = await stripe.disputes.retrieve(disputeId)
  if (dispute.status !== 'won') return null
  const chargeId = getStripeExpandableId(dispute.charge)
  if (!chargeId) return null
  const charge = await stripe.charges.retrieve(chargeId)
  const paymentIntentId = getStripeExpandableId(charge.payment_intent)
  if (!paymentIntentId) return null
  const payments = await listAllStripeInvoicePaymentsForPaymentIntent(paymentIntentId)
  const invoiceIds = [
    ...new Set(payments.map(payment => getStripeExpandableId(payment.invoice))),
  ].filter((invoiceId): invoiceId is string => invoiceId !== null)
  if (invoiceIds.length === 0) return null
  return {
    chargeId: charge.id,
    invoiceIds,
    paymentIntentId,
  }
}

/* no-mistakes: integration=stripe */
export async function getStripeDisputeSettlementForPayment(options: {
  chargeId: string | null
  currency: string
  paymentIntentId: string | null
}): Promise<StripeDisputeSettlement> {
  if (options.chargeId) return getStripeChargeDisputeSettlement(options.chargeId, options.currency)
  if (!options.paymentIntentId)
    throw new Error('Stripe dispute lookup requires a charge or payment intent')
  const charge = await getStripePaymentIntentLatestCharge(options.paymentIntentId)
  if (!charge) return { lostDisputeAmountMinorUnits: 0, refundDeferred: false }
  return getStripeChargeDisputeSettlement(
    typeof charge === 'string' ? charge : charge.id,
    options.currency,
  )
}

/* no-mistakes: integration=stripe */
async function getStripeChargeDisputeSettlement(
  chargeId: string,
  currency: string,
): Promise<StripeDisputeSettlement> {
  return listStripeDisputePages(
    chargeId,
    currency,
    undefined,
    { lostDisputeAmountMinorUnits: 0, refundDeferred: false },
    0,
  )
}

async function listStripeDisputePages(
  chargeId: string,
  currency: string,
  startingAfter: string | undefined,
  settlement: StripeDisputeSettlement,
  pageCount: number,
): Promise<StripeDisputeSettlement> {
  if (pageCount >= MAX_STRIPE_DISPUTE_PAGES)
    throw new Error(`Stripe charge ${chargeId} exceeded the dispute page limit`)
  const page = await getStripeClient().disputes.list({
    charge: chargeId,
    limit: 100,
    ...(startingAfter ? { starting_after: startingAfter } : {}),
  })
  let nextSettlement = settlement
  for (const dispute of page.data) {
    nextSettlement = getStripeDisputeSettlement(nextSettlement, dispute, currency)
  }
  if (!page.has_more) return nextSettlement
  const lastDispute = page.data.at(-1)
  if (!lastDispute) throw new Error(`Stripe returned an empty dispute page for charge ${chargeId}`)
  return listStripeDisputePages(chargeId, currency, lastDispute.id, nextSettlement, pageCount + 1)
}

/* no-mistakes: integration=stripe */
async function getStripePaymentIntentLatestCharge(
  paymentIntentId: string,
): Promise<Stripe.PaymentIntent['latest_charge']> {
  const paymentIntent = await getStripeClient().paymentIntents.retrieve(paymentIntentId, {
    expand: ['latest_charge'],
  })
  return paymentIntent.latest_charge
}

function getStripeDisputeSettlement(
  settlement: StripeDisputeSettlement,
  dispute: Stripe.Dispute,
  currency: string,
): StripeDisputeSettlement {
  switch (dispute.status) {
    case 'lost':
      if (dispute.currency !== currency)
        throw new Error(`Stripe dispute currency ${dispute.currency} did not match ${currency}`)
      return {
        ...settlement,
        lostDisputeAmountMinorUnits: settlement.lostDisputeAmountMinorUnits + dispute.amount,
      }
    case 'needs_response':
    case 'under_review':
    case 'warning_needs_response':
    case 'warning_under_review':
      return { ...settlement, refundDeferred: true }
    case 'prevented':
    case 'warning_closed':
    case 'won':
      return settlement
    default:
      throw new Error(`Unsupported Stripe dispute status: ${String(dispute.status)}`)
  }
}

function getStripeExpandableId(value: string | { id: string } | null | undefined): string | null {
  return typeof value === 'string' ? value : (value?.id ?? null)
}
