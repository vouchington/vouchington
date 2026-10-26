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

export type StripeInvoiceForReversal = {
  created: number
  currency: string
  id: string
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
  return [...targets.values()].toSorted((left, right) =>
    getReversalTargetId(left).localeCompare(getReversalTargetId(right)),
  )
}

function getReversalTargetId(target: Pick<ReversalTarget, 'chargeId' | 'paymentIntentId'>): string {
  if (target.chargeId && !target.paymentIntentId) return `charge:${target.chargeId}`
  if (target.paymentIntentId && !target.chargeId) return `payment_intent:${target.paymentIntentId}`
  return ''
}
