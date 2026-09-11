import { mapWithConcurrency } from '@vouchington/utils/async'
import type { StripeDisputeSettlement } from '@modules/stripe/disputes'
import {
  getInvoicePaymentTargets,
  getQualifyingInvoiceLineAmount,
  type StripeInvoiceForReversal,
} from './ineligible-stripe-purchase-reversal-target-allocation.mts'
import { STRIPE_REVERSAL_CONCURRENCY } from './ineligible-stripe-purchase-reversal-provider-policy.mts'
import { type StripeRefundHistory } from './ineligible-stripe-purchase-reversal/refund-history.mts'
import type { ReversalTarget } from './ineligible-stripe-purchase-reversal-types.mts'

export { getQualifyingInvoiceLineAmount, type StripeInvoiceForReversal }

type GetStripeRefundHistoryForPayment = (options: {
  chargeId: string | null
  currency: string
  invoiceId: string
  paymentIntentId: string | null
}) => Promise<StripeRefundHistory>

type GetStripeDisputeSettlementForPayment = (options: {
  chargeId: string | null
  currency: string
  paymentIntentId: string | null
}) => Promise<StripeDisputeSettlement>

export class StripeReversalRefundDeferredError extends Error {
  constructor() {
    super('Stripe reversal refund is deferred until Stripe reaches a terminal state')
    this.name = 'StripeReversalRefundDeferredError'
  }
}

export async function getRefundableReversalTargets(
  invoices: readonly StripeInvoiceForReversal[],
  getStripeRefundHistoryForPayment: GetStripeRefundHistoryForPayment,
  getStripeDisputeSettlementForPayment: GetStripeDisputeSettlementForPayment = missingStripeDisputeLookup,
): Promise<ReversalTarget[]> {
  const invoicePaymentTargets = invoices.flatMap(invoice =>
    getInvoicePaymentTargets(invoice).map(target => ({ invoice, target })),
  )
  const observedTargets = await mapWithConcurrency(
    invoicePaymentTargets,
    STRIPE_REVERSAL_CONCURRENCY,
    async ({ invoice, target }) => {
      const { alreadyRefundedMinorUnits, refundDeferred } =
        await getStripeRefundHistoryForPayment(target)
      const disputeSettlement = await getStripeDisputeSettlementForPayment(target)
      const externallySatisfiedMinorUnits = Math.min(
        target.amountMinorUnits,
        alreadyRefundedMinorUnits + disputeSettlement.lostDisputeAmountMinorUnits,
      )
      const providerObservedAmountMinorUnits = Math.max(
        0,
        target.amountMinorUnits - externallySatisfiedMinorUnits,
      )
      return {
        externallySatisfiedMinorUnits: externallySatisfiedMinorUnits,
        invoice,
        ...target,
        amountMinorUnits: providerObservedAmountMinorUnits,
        providerObservedAmountMinorUnits,
        ...(disputeSettlement.refundDeferred || refundDeferred
          ? { refundDeferred: true as const }
          : {}),
      }
    },
  )
  return coalesceReversalTargets(
    observedTargets.map(target => {
      const { invoice: _invoice, ...fields } = target
      return {
        ...fields,
        qualifyingAmountMinorUnits: target.amountMinorUnits + target.externallySatisfiedMinorUnits,
      }
    }),
  )
}

async function missingStripeDisputeLookup(): Promise<StripeDisputeSettlement> {
  throw new Error('Stripe reversal requires an open dispute lookup')
}

export function getInvoicesInReversalWindow(
  invoices: readonly StripeInvoiceForReversal[],
  window: {
    billingStartedAt: Date | undefined
    billingEndsAt: Date | undefined
    bindingBoundAt: Date | null
    bindingReleasedAt: Date | null
    originatingInvoiceId: string | undefined
  },
): StripeInvoiceForReversal[] {
  const billingStartedAt = window.billingStartedAt?.getTime()
  const billingEndsAt = window.billingEndsAt?.getTime()
  const bindingBoundAt = window.bindingBoundAt?.getTime()
  const bindingReleasedAt = window.bindingReleasedAt?.getTime()
  return invoices.filter(invoice => {
    const invoiceCreatedAt = invoice.created * 1000
    if (window.originatingInvoiceId !== undefined) return invoice.id === window.originatingInvoiceId
    if (billingStartedAt !== undefined && invoiceCreatedAt < billingStartedAt) return false
    if (billingEndsAt !== undefined && invoiceCreatedAt >= billingEndsAt) return false
    if (billingStartedAt === undefined) return false
    if (bindingBoundAt !== undefined && invoiceCreatedAt < bindingBoundAt) return false
    return bindingReleasedAt === undefined || invoiceCreatedAt < bindingReleasedAt
  })
}

function coalesceReversalTargets(targets: readonly ReversalTarget[]): ReversalTarget[] {
  const coalesced = new Map<string, ReversalTarget>()
  for (const target of targets) {
    const targetKind = target.chargeId ? 'charge' : 'payment_intent'
    const targetId = target.chargeId ?? target.paymentIntentId
    if (!targetId || (target.chargeId && target.paymentIntentId))
      throw new Error('Stripe reversal target must have exactly one payment identifier')
    const key = `${target.currency}:${target.invoiceId}:${targetKind}:${targetId}`
    const existing = coalesced.get(key)
    if (!existing) {
      coalesced.set(key, target)
      continue
    }
    existing.amountMinorUnits += target.amountMinorUnits
    existing.qualifyingAmountMinorUnits += target.qualifyingAmountMinorUnits
    existing.providerObservedAmountMinorUnits =
      (existing.providerObservedAmountMinorUnits ?? 0) +
      (target.providerObservedAmountMinorUnits ?? 0)
    existing.externallySatisfiedMinorUnits =
      (existing.externallySatisfiedMinorUnits ?? 0) + (target.externallySatisfiedMinorUnits ?? 0)
    existing.refundDeferred ||= target.refundDeferred
  }
  return [...coalesced.values()]
}
