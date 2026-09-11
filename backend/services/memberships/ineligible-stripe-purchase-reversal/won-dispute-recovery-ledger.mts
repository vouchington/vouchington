import { beginTransaction, type QueryExecutor } from '@data-stores/psql'
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
  getWonDisputeRecoveryAllocatedMinorUnits,
  getWonDisputeRecoveryOperation,
  type WonDisputeRecoveryOperation,
} from './won-dispute-recovery-operations.mts'
export async function claimWonStripeDisputeRecovery(
  expectedCase: IneligiblePurchaseReversalCase,
  disputeId: string,
  target: ReversalTarget,
): Promise<ClaimedReversal | null> {
  await using query = await beginTransaction()
  const reversalCase = await getLockedIneligiblePurchaseReversalCase(
    {
      originatingInvoiceId: expectedCase.originatingInvoiceId,
      providerApplicationId: expectedCase.providerApplicationId,
      providerEnvironment: expectedCase.providerEnvironment,
      subscriptionId: expectedCase.subscriptionId,
    },
    query,
  )
  if (!reversalCase || reversalCase.id !== expectedCase.id) {
    await query.commit()
    return null
  }
  const originalKey = createIneligiblePurchaseReversalIdempotencyKey(
    reversalCase.providerEnvironment,
    reversalCase.providerApplicationId,
    reversalCase.subscriptionId,
    target,
  )
  const { rows: originalRows } = await query(sql`/* claimWonStripeDisputeRecovery:original */
    SELECT operation.id,
      operation.qualifying_allocation_minor_units::TEXT AS "qualifyingAllocationMinorUnits",
      receipt.amount_minor_units::TEXT AS "receiptAmountMinorUnits"
    FROM membership_ineligible_purchase_reversal_case_operations case_operation
    INNER JOIN membership_operations operation
      ON operation.id = case_operation.membership_operation_id
    INNER JOIN membership_automatic_refund_receipts receipt
      ON receipt.membership_operation_id = operation.id
    WHERE case_operation.membership_ineligible_purchase_reversal_case_id = ${reversalCase.id}
      AND operation.idempotency_key = ${originalKey}
      AND operation.completed_at IS NOT NULL
    FOR UPDATE OF operation
  `)
  const original = originalRows[0] as
    | {
        id: string
        qualifyingAllocationMinorUnits: string
        receiptAmountMinorUnits: string
      }
    | undefined
  if (!original) {
    await query.commit()
    return null
  }
  const idempotencyKey = createWonDisputeRecoveryIdempotencyKey(original.id, disputeId)
  const existing = await getWonDisputeRecoveryOperation(reversalCase, idempotencyKey, query)
  if (existing) {
    const claim = await claimExistingRecovery(reversalCase, existing, idempotencyKey, target, query)
    await query.commit()
    return claim
  }
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
  if (amountMinorUnits === 0) {
    await query.commit()
    return null
  }
  await query(sql`/* claimWonStripeDisputeRecovery:insert */
    INSERT INTO membership_operations (
      membership_source_id, membership_provider_lineage_id, membership_lineage_binding_id,
      provider, environment, application_id, operation_kind, idempotency_key,
      qualifying_allocation_minor_units, remaining_refundable_minor_units, currency_code,
      period_started_at, period_ends_at, collision_at
    ) VALUES (
      ${reversalCase.membershipSourceId}, ${reversalCase.membershipProviderLineageId},
      ${reversalCase.membershipLineageBindingId}, 'stripe', ${reversalCase.providerEnvironment},
      ${reversalCase.providerApplicationId}, 'collision_resolution', ${idempotencyKey},
      ${amountMinorUnits}, ${amountMinorUnits}, ${reversalCase.currency},
      ${reversalCase.periodStartedAt}, ${reversalCase.periodEndsAt}, ${reversalCase.collisionAt}
    )
  `)
  const created = await getWonDisputeRecoveryOperation(reversalCase, idempotencyKey, query)
  if (!created) throw new Error('Could not create won-dispute reversal recovery')
  const claim = await claimExistingRecovery(reversalCase, created, idempotencyKey, target, query)
  await query.commit()
  return claim
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
      SET completed_at = CURRENT_TIMESTAMP, failed_at = NULL, failure_message = NULL,
        execution_claim_token = NULL, execution_claimed_at = NULL
      WHERE id = ${operation.id} AND completed_at IS NULL
    `)
  if (operation.completed || operation.hasReceipt)
    return {
      completed: true,
      executionClaimToken: null,
      hasReceipt: true,
      id: operation.id,
      idempotencyKey,
      providerRefundId: operation.providerRefundId,
      target: claimedTarget,
    }
  return {
    completed: false,
    executionClaimToken: await claimIneligiblePurchaseReversalExecution(operation.id, query),
    hasReceipt: false,
    id: operation.id,
    idempotencyKey,
    providerRefundId: operation.providerRefundId,
    target: claimedTarget,
  }
}
