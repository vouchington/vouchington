import { isCurrencyCode } from '@ts-shared/money'
import type { ReversalTarget } from './ineligible-stripe-purchase-reversal-types.mts'

type StripeInvoicePayment = {
  amount_paid: number | null
  payment?: {
    charge?: string | { id: string } | null
    payment_intent?: string | { id: string } | null
    type: string
  } | null
}

type StripeInvoiceLine = {
  amount: number
  currency: string
  pricing?: {
    price_details?: { price: string | { id: string } }
  } | null
  taxes?: Array<{
    amount: number
    tax_behavior: string
  }> | null
}

export type StripeInvoiceForReversal = {
  created: number
  currency: string
  id: string
  lines?: { data: StripeInvoiceLine[] }
  payments?: { data: StripeInvoicePayment[] }
  status: string | null
}

export function getInvoicePaymentTargets(invoice: StripeInvoiceForReversal): ReversalTarget[] {
  if (!isCurrencyCode(invoice.currency)) return []
  const targets = new Map<string, ReversalTarget>()
  for (const payment of invoice.payments?.data ?? []) {
    if (payment.amount_paid === null || payment.amount_paid <= 0) continue
    const paymentSource = payment.payment
    const target = {
      amountMinorUnits: payment.amount_paid,
      chargeId:
        paymentSource?.type === 'charge'
          ? typeof paymentSource.charge === 'string'
            ? paymentSource.charge
            : (paymentSource.charge?.id ?? null)
          : null,
      currency: invoice.currency,
      invoiceId: invoice.id,
      paymentIntentId:
        paymentSource?.type === 'payment_intent'
          ? typeof paymentSource.payment_intent === 'string'
            ? paymentSource.payment_intent
            : (paymentSource.payment_intent?.id ?? null)
          : null,
      qualifyingAmountMinorUnits: payment.amount_paid,
    }
    if (!target.chargeId && !target.paymentIntentId)
      throw new Error(`Stripe invoice ${invoice.id} has a paid payment without a refund target`)
    const targetId = getReversalTargetId(target)
    const existing = targets.get(targetId)
    if (existing) {
      existing.amountMinorUnits += target.amountMinorUnits
      existing.qualifyingAmountMinorUnits += target.qualifyingAmountMinorUnits
    } else targets.set(targetId, target)
  }
  return [...targets.values()].sort((left, right) =>
    getReversalTargetId(left).localeCompare(getReversalTargetId(right)),
  )
}

export function getQualifyingInvoiceLineAmount(
  invoice: StripeInvoiceForReversal,
  stripePriceId: string,
): number {
  if (!invoice.lines)
    throw new Error(`Stripe invoice ${invoice.id} is missing hydrated invoice lines`)
  const total = invoice.lines.data.reduce((amount, line) => {
    if (line.currency !== invoice.currency)
      throw new Error(
        `Stripe invoice line currency ${line.currency} did not match ${invoice.currency}`,
      )
    const price = line.pricing?.price_details?.price
    const priceId = typeof price === 'string' ? price : price?.id
    if (priceId !== stripePriceId) return amount
    const exclusiveTaxAmount =
      line.taxes?.reduce((taxAmount, tax) => {
        if (tax.tax_behavior === 'inclusive') return taxAmount
        if (tax.tax_behavior === 'exclusive') return taxAmount + tax.amount
        throw new Error(`Unsupported Stripe invoice line tax behavior: ${String(tax.tax_behavior)}`)
      }, 0) ?? 0
    return amount + line.amount + exclusiveTaxAmount
  }, 0)
  return Math.max(0, total)
}

function getReversalTargetId(target: Pick<ReversalTarget, 'chargeId' | 'paymentIntentId'>): string {
  if (target.chargeId && !target.paymentIntentId) return `charge:${target.chargeId}`
  if (target.paymentIntentId && !target.chargeId) return `payment_intent:${target.paymentIntentId}`
  return ''
}
