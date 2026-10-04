import type Stripe from 'stripe'
import { getStripeClient } from './client.mts'

/* no-mistakes: integration=stripe */
export async function listAllStripeInvoicePayments(
  invoiceId: string,
  maxPages: number,
): Promise<Stripe.InvoicePayment[]> {
  return listStripeInvoicePaymentPages(invoiceId, undefined, [], 0, maxPages)
}

/* no-mistakes: integration=stripe */
export async function listAllStripeInvoicePaymentsForPaymentIntent(
  paymentIntentId: string,
  maxPages: number,
): Promise<Stripe.InvoicePayment[]> {
  return listStripeInvoicePaymentIntentPages(paymentIntentId, undefined, [], 0, maxPages)
}

async function listStripeInvoicePaymentIntentPages(
  paymentIntentId: string,
  startingAfter: string | undefined,
  payments: Stripe.InvoicePayment[],
  pageCount: number,
  maxPages: number,
): Promise<Stripe.InvoicePayment[]> {
  if (pageCount >= maxPages)
    throw new Error(
      `Stripe payment intent ${paymentIntentId} exceeded the invoice payment page limit`,
    )
  const page = await getStripeClient().invoicePayments.list({
    payment: { payment_intent: paymentIntentId, type: 'payment_intent' },
    status: 'paid',
    limit: 100,
    ...(startingAfter ? { starting_after: startingAfter } : {}),
  })
  payments.push(...page.data)
  if (!page.has_more) return payments
  const lastPayment = page.data.at(-1)
  if (!lastPayment)
    throw new Error(
      `Stripe returned an empty invoice payment page for payment intent ${paymentIntentId}`,
    )
  return listStripeInvoicePaymentIntentPages(
    paymentIntentId,
    lastPayment.id,
    payments,
    pageCount + 1,
    maxPages,
  )
}

async function listStripeInvoicePaymentPages(
  invoiceId: string,
  startingAfter: string | undefined,
  payments: Stripe.InvoicePayment[],
  pageCount: number,
  maxPages: number,
): Promise<Stripe.InvoicePayment[]> {
  if (pageCount >= maxPages)
    throw new Error(`Stripe invoice ${invoiceId} exceeded the payment page limit`)
  const page = await getStripeClient().invoicePayments.list({
    invoice: invoiceId,
    status: 'paid',
    limit: 100,
    ...(startingAfter ? { starting_after: startingAfter } : {}),
  })
  payments.push(...page.data)
  if (!page.has_more) return payments
  const lastPayment = page.data.at(-1)
  if (!lastPayment)
    throw new Error(`Stripe returned an empty invoice payment page for invoice ${invoiceId}`)
  return listStripeInvoicePaymentPages(invoiceId, lastPayment.id, payments, pageCount + 1, maxPages)
}
