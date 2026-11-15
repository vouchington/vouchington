import {
  getRefundOperationPaymentReference,
  recordRefundReconciliationAttempt,
} from './refund-issuance.mts'
import { enrichRefundReconciliationAttemptProviderRefund } from './refund-reconciliation/ledger.mts'
import { recordRefundRequestRejection } from './refund-request-rejection.mts'
import * as stripeRefunds from '@modules/stripe/refunds'
import { recordIneligiblePurchaseReversalProviderRefund } from './ineligible-stripe-purchase-reversal-execution.mts'
import { createIneligiblePurchaseReversalRetryIdempotencyKey } from './ineligible-stripe-purchase-reversal-idempotency.mts'
import type { ClaimedReversal } from './ineligible-stripe-purchase-reversal-types.mts'

type IneligiblePurchaseReversalRefundOperations = {
  createRefund: typeof stripeRefunds.createStripeRefund
  retrieveRefund?: typeof stripeRefunds.getStripeRefund
}

export async function createOrRetrieveIneligiblePurchaseReversalRefund(
  reversal: ClaimedReversal,
  operations: IneligiblePurchaseReversalRefundOperations,
): Promise<StripeRefund> {
  if (reversal.providerRefundId) {
    if (!operations.retrieveRefund)
      throw new Error(`Stripe reversal ${reversal.id} requires a refund retrieval operation`)
    const existingRefund = await operations.retrieveRefund(reversal.providerRefundId)
    if (existingRefund.status !== 'failed' && existingRefund.status !== 'canceled')
      return existingRefund
    return createIneligiblePurchaseReversalRefund(
      reversal,
      operations,
      createIneligiblePurchaseReversalRetryIdempotencyKey(existingRefund.id),
    )
  }
  return createIneligiblePurchaseReversalRefund(reversal, operations, reversal.idempotencyKey)
}

export async function getSucceededIneligiblePurchaseReversalRefund(
  reversal: ClaimedReversal,
  operations: IneligiblePurchaseReversalRefundOperations,
): Promise<StripeRefund | null> {
  if (!reversal.providerRefundId) return null
  if (!operations.retrieveRefund)
    throw new Error(`Stripe reversal ${reversal.id} requires a refund retrieval operation`)
  const refund = await operations.retrieveRefund(reversal.providerRefundId)
  if (refund.status === 'succeeded') return refund
  if (refund.status === 'failed' || refund.status === 'canceled') return null
  throw new Error(`Stripe reversal ${reversal.id} refund is ${refund.status ?? 'unknown'}`)
}

async function createIneligiblePurchaseReversalRefund(
  reversal: ClaimedReversal,
  operations: IneligiblePurchaseReversalRefundOperations,
  idempotencyKey: string,
): Promise<StripeRefund> {
  const paymentReference = await getRefundOperationPaymentReference(reversal.id)
  const attempt = await recordRefundReconciliationAttempt(reversal, idempotencyKey)
  let refund: StripeRefund
  try {
    refund = await operations.createRefund({
      ...(paymentReference.startsWith('pi_')
        ? { paymentIntentId: paymentReference }
        : { chargeId: paymentReference }),
      amountMinorUnits: attempt.amount.amount,
      idempotencyKey,
    })
  } catch (err) {
    await recordRefundRequestRejection(attempt.id, err)
    throw err
  }
  if (!attempt.providerRefundId)
    await enrichRefundReconciliationAttemptProviderRefund(attempt.id, refund.id)
  await recordIneligiblePurchaseReversalProviderRefund(reversal, refund.id)
  return refund
}

type StripeRefund = {
  amount: number
  currency: string
  id: string
  status: string | null
}
