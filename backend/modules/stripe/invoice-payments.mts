import type Stripe from 'stripe'
import { getStripeClient } from './client.mts'

const MAX_STRIPE_INVOICE_PAYMENT_PAGES = 10

/* no-mistakes: integration=stripe */
export async function listAllStripeInvoicePayments(
  invoiceId: string,
): Promise<Stripe.InvoicePayment[]> {
  return listStripeInvoicePaymentPages(invoiceId, undefined, [], 0)
}

/* no-mistakes: integration=stripe */
export async function listAllStripeInvoicePaymentsForPaymentIntent(
  paymentIntentId: string,
): Promise<Stripe.InvoicePayment[]> {
  return listStripeInvoicePaymentIntentPages(paymentIntentId, undefined, [], 0)
}

async function listStripeInvoicePaymentIntentPages(
  paymentIntentId: string,
  startingAfter: string | undefined,
  payments: Stripe.InvoicePayment[],
  pageCount: number,
): Promise<Stripe.InvoicePayment[]> {
  if (pageCount >= MAX_STRIPE_INVOICE_PAYMENT_PAGES)
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
  )
}

async function listStripeInvoicePaymentPages(
  invoiceId: string,
  startingAfter: string | undefined,
  payments: Stripe.InvoicePayment[],
  pageCount: number,
): Promise<Stripe.InvoicePayment[]> {
  if (pageCount >= MAX_STRIPE_INVOICE_PAYMENT_PAGES)
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
  return listStripeInvoicePaymentPages(invoiceId, lastPayment.id, payments, pageCount + 1)
}
