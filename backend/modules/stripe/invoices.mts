import type Stripe from 'stripe'
import { collectStripePages } from '@vouchington/stripe'
import { mapWithConcurrency } from '@vouchington/utils/async'
import { getStripeClient } from './client.mts'
import { listAllStripeInvoicePayments } from './invoice-payments.mts'

const STRIPE_INVOICE_HYDRATION_CONCURRENCY = 3

export type StripeInvoiceLookupLimits = {
  invoicePages: number
  paymentPages: number
  linePages: number
}

export type StripeInvoiceWithAllPayments = Omit<Stripe.Invoice, 'payments'> & {
  lines: { data: Stripe.InvoiceLineItem[] }
  payments: { data: Stripe.InvoicePayment[] }
}

/* no-mistakes: integration=stripe */
export function getStripeInvoice(id: string): Promise<Stripe.Response<Stripe.Invoice>> {
  return getStripeClient().invoices.retrieve(id, { expand: ['payments'] })
}

/* no-mistakes: integration=stripe */
export function listStripeSubscriptionInvoices(
  subscriptionId: string,
  options: { limit?: number; startingAfter?: string } = {},
): Promise<Stripe.Response<Stripe.ApiList<Stripe.Invoice>>> {
  return getStripeClient().invoices.list({
    subscription: subscriptionId,
    limit: options.limit ?? 10,
    ...(options.startingAfter ? { starting_after: options.startingAfter } : {}),
    expand: ['data.payments'],
  })
}

/* no-mistakes: integration=stripe */
export async function listAllStripeSubscriptionInvoices(
  subscriptionId: string,
  limits: StripeInvoiceLookupLimits,
): Promise<StripeInvoiceWithAllPayments[]> {
  const invoices = await collectStripePages({
    fetchPage: startingAfter =>
      listStripeSubscriptionInvoices(subscriptionId, {
        limit: 100,
        startingAfter,
      }),
    maxPages: limits.invoicePages,
    label: 'invoice',
  })
  return mapWithConcurrency(invoices, STRIPE_INVOICE_HYDRATION_CONCURRENCY, invoice =>
    hydrateStripeInvoiceDetails(invoice, limits),
  )
}

async function hydrateStripeInvoiceDetails(
  invoice: Stripe.Invoice,
  limits: StripeInvoiceLookupLimits,
): Promise<StripeInvoiceWithAllPayments> {
  const [payments, lines] = await Promise.all([
    getCompleteStripeInvoicePayments(invoice, limits.paymentPages),
    getCompleteStripeInvoiceLines(invoice, limits.linePages),
  ])
  return {
    ...invoice,
    lines: { data: lines },
    payments: { data: payments },
  } as StripeInvoiceWithAllPayments
}

export async function getCompleteStripeInvoicePayments(
  invoice: Stripe.Invoice,
  maxPages: number,
): Promise<Stripe.InvoicePayment[]> {
  if (invoice.payments && !invoice.payments.has_more)
    return invoice.payments.data.filter(payment => payment.status === 'paid')
  return listAllStripeInvoicePayments(invoice.id, maxPages)
}

export function getCompleteStripeInvoiceLines(
  invoice: Stripe.Invoice,
  maxPages: number,
): Promise<Stripe.InvoiceLineItem[]> {
  return collectStripePages({
    fetchPage: startingAfter =>
      getStripeClient().invoices.listLineItems(invoice.id, {
        limit: 100,
        ...(startingAfter ? { starting_after: startingAfter } : {}),
      }),
    maxPages,
    label: 'invoice line',
  })
}
