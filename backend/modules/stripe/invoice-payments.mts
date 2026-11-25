import type Stripe from 'stripe'
import { collectStripePages } from '@vouchington/stripe'
import { getStripeClient } from './client.mts'

/* no-mistakes: integration=stripe */
export function listAllStripeInvoicePayments(
  invoiceId: string,
  maxPages: number,
): Promise<Stripe.InvoicePayment[]> {
  return collectStripePages({
    fetchPage: startingAfter =>
      getStripeClient().invoicePayments.list({
        invoice: invoiceId,
        status: 'paid',
        limit: 100,
        ...(startingAfter ? { starting_after: startingAfter } : {}),
      }),
    maxPages,
    label: 'invoice payment',
  })
}

/* no-mistakes: integration=stripe */
export function listAllStripeInvoicePaymentsForPaymentIntent(
  paymentIntentId: string,
  maxPages: number,
): Promise<Stripe.InvoicePayment[]> {
  return collectStripePages({
    fetchPage: startingAfter =>
      getStripeClient().invoicePayments.list({
        payment: { payment_intent: paymentIntentId, type: 'payment_intent' },
        status: 'paid',
        limit: 100,
        ...(startingAfter ? { starting_after: startingAfter } : {}),
      }),
    maxPages,
    label: 'invoice payment',
  })
}
