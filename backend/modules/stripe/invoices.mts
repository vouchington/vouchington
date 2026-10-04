import type Stripe from 'stripe'
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
  const invoices = await listStripeSubscriptionInvoicePages(
    subscriptionId,
    undefined,
    [],
    0,
    limits.invoicePages,
  )
  return mapWithConcurrency(invoices, STRIPE_INVOICE_HYDRATION_CONCURRENCY, invoice =>
    hydrateStripeInvoiceDetails(invoice, limits),
  )
}

async function listStripeSubscriptionInvoicePages(
  subscriptionId: string,
  startingAfter: string | undefined,
  invoices: Stripe.Invoice[],
  pageCount: number,
  maxPages: number,
): Promise<Stripe.Invoice[]> {
  if (pageCount >= maxPages)
    throw new Error(`Stripe subscription ${subscriptionId} exceeded the invoice page limit`)
  const page = await listStripeSubscriptionInvoices(subscriptionId, {
    limit: 100,
    startingAfter,
  })
  invoices.push(...page.data)
  if (!page.has_more) return invoices
  const lastInvoice = page.data.at(-1)
  if (!lastInvoice)
    throw new Error(`Stripe returned an empty invoice page for subscription ${subscriptionId}`)
  return listStripeSubscriptionInvoicePages(
    subscriptionId,
    lastInvoice.id,
    invoices,
    pageCount + 1,
    maxPages,
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

export async function getCompleteStripeInvoiceLines(
  invoice: Stripe.Invoice,
  maxPages: number,
): Promise<Stripe.InvoiceLineItem[]> {
  return listAllStripeInvoiceLinePages(invoice.id, undefined, [], 0, maxPages)
}

async function listAllStripeInvoiceLinePages(
  invoiceId: string,
  startingAfter: string | undefined,
  lines: Stripe.InvoiceLineItem[],
  pageCount: number,
  maxPages: number,
): Promise<Stripe.InvoiceLineItem[]> {
  if (pageCount >= maxPages)
    throw new Error(`Stripe invoice ${invoiceId} exceeded the line page limit`)
  const page = await getStripeClient().invoices.listLineItems(invoiceId, {
    limit: 100,
    ...(startingAfter ? { starting_after: startingAfter } : {}),
  })
  lines.push(...page.data)
  if (!page.has_more) return lines
  const lastLine = page.data.at(-1)
  if (!lastLine)
    throw new Error(`Stripe returned an empty invoice line page for invoice ${invoiceId}`)
  return listAllStripeInvoiceLinePages(invoiceId, lastLine.id, lines, pageCount + 1, maxPages)
}
