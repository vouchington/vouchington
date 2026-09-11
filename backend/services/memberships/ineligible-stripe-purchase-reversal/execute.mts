import { mapWithConcurrency } from '@vouchington/utils/async'
import {
  completeIneligiblePurchaseReversal,
  failIneligiblePurchaseReversal,
  markIneligiblePurchaseReversalCompleted,
} from '../ineligible-stripe-purchase-reversal-execution.mts'
import {
  createOrRetrieveIneligiblePurchaseReversalRefund,
  getSucceededIneligiblePurchaseReversalRefund,
} from '../ineligible-stripe-purchase-reversal-provider.mts'
import { STRIPE_REVERSAL_CONCURRENCY } from '../ineligible-stripe-purchase-reversal-provider-policy.mts'
import { StripeReversalRefundDeferredError } from '../ineligible-stripe-purchase-reversal-targets.mts'
import type { ClaimedIneligiblePurchaseReversals } from '../ineligible-stripe-purchase-reversal-types.mts'
import type { IneligibleStripePurchaseOperations } from '../reverse-ineligible-stripe-purchase.mts'

export async function executeIneligibleStripePurchaseReversal(
  claim: ClaimedIneligiblePurchaseReversals,
  subscriptionId: string,
  operations: IneligibleStripePurchaseOperations,
): Promise<void> {
  const pending = claim.reversals.filter(reversal => !reversal.completed)
  const cancellation = claim.cancellation
  try {
    if (cancellation && !cancellation.completed) {
      await operations.cancelSubscriptionImmediately(subscriptionId)
      await markIneligiblePurchaseReversalCompleted(cancellation)
    }
    await mapWithConcurrency(pending, STRIPE_REVERSAL_CONCURRENCY, async reversal => {
      if (reversal.target.refundDeferred) throw new StripeReversalRefundDeferredError()
      if (reversal.target.amountMinorUnits === 0) {
        const refund = await getSucceededIneligiblePurchaseReversalRefund(reversal, operations)
        await completeIneligiblePurchaseReversal(
          reversal,
          refund
            ? { amountMinorUnits: refund.amount, providerRefundId: refund.id }
            : { amountMinorUnits: 0, providerRefundId: null },
        )
        return
      }
      const refund = await createOrRetrieveIneligiblePurchaseReversalRefund(reversal, operations)
      if (refund.status !== 'succeeded')
        throw new Error(`Stripe reversal ${reversal.id} refund is ${refund.status ?? 'unknown'}`)
      await completeIneligiblePurchaseReversal(reversal, {
        amountMinorUnits: refund.amount,
        providerRefundId: refund.id,
      })
    })
  } catch (error) {
    await Promise.all(
      [...pending, ...(cancellation && !cancellation.completed ? [cancellation] : [])].map(
        operation => failIneligiblePurchaseReversal(operation, error),
      ),
    )
    throw error
  }
}
