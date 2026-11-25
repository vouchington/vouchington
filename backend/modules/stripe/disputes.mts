import type Stripe from 'stripe'
import { collectStripePages, getStripeObjectId, summarizeStripeDisputes } from '@vouchington/stripe'
import { getStripeClient } from './client.mts'
import { listAllStripeInvoicePaymentsForPaymentIntent } from './invoice-payments.mts'

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
  paymentPages: number,
): Promise<WonStripeDisputeInvoice | null> {
  const stripe = getStripeClient()
  const dispute = await stripe.disputes.retrieve(disputeId)
  if (dispute.status !== 'won') return null
  const chargeId = getStripeObjectId(dispute.charge)
  if (!chargeId) return null
  const charge = await stripe.charges.retrieve(chargeId)
  const paymentIntentId = getStripeObjectId(charge.payment_intent)
  if (!paymentIntentId) return null
  const payments = await listAllStripeInvoicePaymentsForPaymentIntent(paymentIntentId, paymentPages)
  const invoiceIds = [
    ...new Set(payments.map(payment => getStripeObjectId(payment.invoice))),
  ].filter((invoiceId): invoiceId is string => invoiceId !== null)
  if (invoiceIds.length === 0) return null
  return {
    chargeId: charge.id,
    invoiceIds,
    paymentIntentId,
  }
}

/* no-mistakes: integration=stripe */
export async function getStripeDisputeSettlementForPayment(
  options: {
    chargeId: string | null
    currency: string
    paymentIntentId: string | null
  },
  maxPages: number,
): Promise<StripeDisputeSettlement> {
  if (options.chargeId)
    return getStripeChargeDisputeSettlement(options.chargeId, options.currency, maxPages)
  if (!options.paymentIntentId)
    throw new Error('Stripe dispute lookup requires a charge or payment intent')
  const charge = await getStripePaymentIntentLatestCharge(options.paymentIntentId)
  if (!charge) return { lostDisputeAmountMinorUnits: 0, refundDeferred: false }
  return getStripeChargeDisputeSettlement(
    typeof charge === 'string' ? charge : charge.id,
    options.currency,
    maxPages,
  )
}

/* no-mistakes: integration=stripe */
async function getStripeChargeDisputeSettlement(
  chargeId: string,
  currency: string,
  maxPages: number,
): Promise<StripeDisputeSettlement> {
  const disputes = await collectStripePages({
    fetchPage: startingAfter =>
      getStripeClient().disputes.list({
        charge: chargeId,
        limit: 100,
        ...(startingAfter ? { starting_after: startingAfter } : {}),
      }),
    maxPages,
    label: 'dispute',
  })
  const summary = summarizeStripeDisputes(disputes, currency)
  return {
    lostDisputeAmountMinorUnits: summary.lostDisputeAmountMinorUnits,
    refundDeferred: summary.hasOpenDispute,
  }
}

/* no-mistakes: integration=stripe */
export async function getStripePaymentIntentLatestCharge(
  paymentIntentId: string,
): Promise<Stripe.PaymentIntent['latest_charge']> {
  const paymentIntent = await getStripeClient().paymentIntents.retrieve(paymentIntentId, {
    expand: ['latest_charge'],
  })
  return paymentIntent.latest_charge
}
