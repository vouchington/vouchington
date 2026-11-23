import { resolveStripeRefundChargeId } from '../refund-issuance.mts'
import { beginTransaction, write, type QueryExecutor } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { reconcileFailedIneligiblePurchaseReversal } from '../ineligible-stripe-purchase-reversal-reconcile.mts'
import {
  createIneligiblePurchaseReversalIdempotencyKey,
  createWonDisputeRecoveryIdempotencyKey,
} from '../ineligible-stripe-purchase-reversal-idempotency.mts'
import type {
  ClaimedReversal,
  ReversalTarget,
} from '../ineligible-stripe-purchase-reversal-types.mts'
import {
  getLockedIneligiblePurchaseReversalCase,
  type IneligiblePurchaseReversalCase,
} from './case-ledger.mts'
import { claimIneligiblePurchaseReversalExecution } from './execution-claim.mts'
import { wasSucceededStripeRefundObserved } from './refund-scan.mts'
import {
  createRecoveryOperation,
  getOriginalReversalWithReceipt,
  getWonDisputeRecoveryAllocatedMinorUnits,
  getWonDisputeRecoveryOperation,
  type RecoveryPayment,
  type WonDisputeRecoveryOperation,
} from './won-dispute-recovery-operations.mts'

export async function claimWonStripeDisputeRecovery(
  expectedCase: IneligiblePurchaseReversalCase,
  disputeId: string,
  target: ReversalTarget,
): Promise<ClaimedReversal | null> {
  const paymentReference = target.chargeId ?? target.paymentIntentId
  if (!paymentReference?.startsWith('pi_'))
    return claimRecoveryInTransaction(
      expectedCase,
      disputeId,
      target,
      paymentReference ? { paymentReference, chargeId: paymentReference } : null,
    )

  const candidate = await getRecoveryCandidate(expectedCase, disputeId, target, write, false)
  if (!candidate) return null
  const payment = candidate.operation
    ? null
    : { paymentReference, chargeId: await resolveStripeRefundChargeId(paymentReference) }
  return claimRecoveryInTransaction(expectedCase, disputeId, target, payment)
}

async function claimRecoveryInTransaction(
  expectedCase: IneligiblePurchaseReversalCase,
  disputeId: string,
  target: ReversalTarget,
  payment: RecoveryPayment | null,
): Promise<ClaimedReversal | null> {
  await using query = await beginTransaction()
  const candidate = await getRecoveryCandidate(expectedCase, disputeId, target, query, true)
  if (!candidate) {
    await query.commit()
    return null
  }
  const { reversalCase, idempotencyKey } = candidate
  const operation =
    candidate.operation ??
    (await createRecoveryOperation(
      reversalCase,
      idempotencyKey,
      payment,
      candidate.amountMinorUnits,
      query,
    ))
  const claim = await claimExistingRecovery(reversalCase, operation, idempotencyKey, target, query)
  await query.commit()
  return claim
}

type RecoveryCandidate = {
  reversalCase: IneligiblePurchaseReversalCase
  idempotencyKey: string
} & (
  | { operation: WonDisputeRecoveryOperation; amountMinorUnits?: never }
  | { operation: null; amountMinorUnits: number }
)

async function getRecoveryCandidate(
  expectedCase: IneligiblePurchaseReversalCase,
  disputeId: string,
  target: ReversalTarget,
  query: QueryExecutor,
  lockOperation: boolean,
): Promise<RecoveryCandidate | null> {
  const reversalCase = await getLockedIneligiblePurchaseReversalCase(
    {
      originatingInvoiceId: expectedCase.originatingInvoiceId,
      providerApplicationId: expectedCase.providerApplicationId,
      providerEnvironment: expectedCase.providerEnvironment,
      subscriptionId: expectedCase.subscriptionId,
    },
    query,
  )
  if (!reversalCase || reversalCase.id !== expectedCase.id) return null
  const originalKey = createIneligiblePurchaseReversalIdempotencyKey(
    reversalCase.providerEnvironment,
    reversalCase.providerApplicationId,
    reversalCase.subscriptionId,
    target,
  )
  const original = await getOriginalReversalWithReceipt(reversalCase.id, originalKey, query)
  if (!original) return null
  const idempotencyKey = createWonDisputeRecoveryIdempotencyKey(original.id, disputeId)
  const operation = await getWonDisputeRecoveryOperation(
    reversalCase,
    idempotencyKey,
    query,
    lockOperation,
  )
  if (operation) return { reversalCase, idempotencyKey, operation }
  const allocatedMinorUnits = await getWonDisputeRecoveryAllocatedMinorUnits(
    reversalCase,
    original.id,
    query,
  )
  const amountMinorUnits = Math.min(
    target.amountMinorUnits,
    Math.max(
      0,
      Number(original.qualifyingAllocationMinorUnits) -
        Number(original.receiptAmountMinorUnits) -
        allocatedMinorUnits,
    ),
  )
  return amountMinorUnits === 0
    ? null
    : { reversalCase, idempotencyKey, operation: null, amountMinorUnits }
}

async function claimExistingRecovery(
  reversalCase: IneligiblePurchaseReversalCase,
  operation: WonDisputeRecoveryOperation,
  idempotencyKey: string,
  target: ReversalTarget,
  query: QueryExecutor,
): Promise<ClaimedReversal> {
  const amountMinorUnits = await reconcileFailedIneligiblePurchaseReversal(
    operation,
    target.providerObservedAmountMinorUnits ?? target.amountMinorUnits,
    {
      externallySatisfiedMinorUnits: undefined,
      providerRefundObservedSucceeded: operation.providerRefundId
        ? await wasSucceededStripeRefundObserved({
            query,
            reversalCaseId: reversalCase.id,
            stripeRefundId: operation.providerRefundId,
            target,
          })
        : false,
      query,
    },
  )
  const claimedTarget = {
    ...target,
    amountMinorUnits,
    qualifyingAmountMinorUnits: Number(operation.qualifyingAllocationMinorUnits),
  }
  if (operation.hasReceipt && !operation.completed)
    await query(sql`/* claimWonStripeDisputeRecovery:completeReceipt */
      UPDATE membership_operations
      SET completed_at = CURRENT_TIMESTAMP, failed_at = NULL, failure_message = NULL
      WHERE id = ${operation.id} AND completed_at IS NULL
    `)
  if (operation.completed || operation.hasReceipt)
    return {
      completed: true,
      leaseToken: null,
      hasReceipt: true,
      id: operation.id,
      idempotencyKey,
      providerRefundId: operation.providerRefundId,
      target: claimedTarget,
    }
  return {
    completed: false,
    leaseToken: await claimIneligiblePurchaseReversalExecution(operation.id, query),
    hasReceipt: false,
    id: operation.id,
    idempotencyKey,
    providerRefundId: operation.providerRefundId,
    target: claimedTarget,
  }
}
