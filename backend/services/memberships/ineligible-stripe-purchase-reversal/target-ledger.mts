import type { QueryExecutor } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { createIneligiblePurchaseReversalIdempotencyKey } from '../ineligible-stripe-purchase-reversal-idempotency.mts'
import { reconcileFailedIneligiblePurchaseReversal } from '../ineligible-stripe-purchase-reversal-reconcile.mts'
import type {
  ClaimedReversal,
  ReversalTarget,
} from '../ineligible-stripe-purchase-reversal-types.mts'
import { recordReversalCaseOperation } from './case-ledger.mts'
import { claimIneligiblePurchaseReversalExecution } from './execution-claim.mts'
import { wasSucceededStripeRefundObserved } from './refund-scan.mts'

export async function claimIneligiblePurchaseReversalTargets(
  [target, ...remainingTargets]: readonly ReversalTarget[],
  options: Omit<Parameters<typeof claimIneligiblePurchaseReversal>[0], 'target'>,
  claimed: ClaimedReversal[],
): Promise<ClaimedReversal[]> {
  if (!target) return claimed
  const reversal = await claimIneligiblePurchaseReversal({ ...options, target })
  claimed.push(reversal)
  return claimIneligiblePurchaseReversalTargets(remainingTargets, options, claimed)
}

async function claimIneligiblePurchaseReversal(options: {
  collisionAt: Date
  membershipSourceId: string
  membershipLineageBindingId: string
  membershipProviderLineageId: string
  periodEndsAt: Date
  periodStartedAt: Date
  providerEnvironment: 'test' | 'production'
  providerApplicationId: string
  query: QueryExecutor
  reversalCaseId: string
  subscriptionId: string
  target: ReversalTarget
}): Promise<ClaimedReversal> {
  const idempotencyKey = createIneligiblePurchaseReversalIdempotencyKey(
    options.providerEnvironment,
    options.providerApplicationId,
    options.subscriptionId,
    options.target,
  )
  await options.query(sql`/* claimIneligiblePurchaseReversal:insert */
    INSERT INTO membership_operations (
      membership_source_id, membership_provider_lineage_id, membership_lineage_binding_id,
      provider, environment, application_id, operation_kind, idempotency_key,
      qualifying_allocation_minor_units, remaining_refundable_minor_units, currency_code,
      period_started_at, period_ends_at, collision_at
    ) VALUES (
      ${options.membershipSourceId}, ${options.membershipProviderLineageId},
      ${options.membershipLineageBindingId}, 'stripe', ${options.providerEnvironment},
      ${options.providerApplicationId}, 'ineligible_purchase_reversal', ${idempotencyKey},
      ${options.target.qualifyingAmountMinorUnits}, ${options.target.amountMinorUnits},
      ${options.target.currency}, ${options.periodStartedAt}, ${options.periodEndsAt},
      ${options.collisionAt}
    ) ON CONFLICT (provider, environment, application_id, idempotency_key) DO NOTHING
  `)
  const { rows } = await options.query(sql`/* claimIneligiblePurchaseReversal:lock */
    SELECT operation.id,
      EXISTS (
        SELECT 1 FROM membership_automatic_refund_receipts receipt
        WHERE receipt.membership_operation_id = operation.id
      ) AS "hasReceipt",
      operation.completed_at IS NOT NULL AS completed,
      operation.failed_at IS NOT NULL AS failed,
      operation.provider_refund_id AS "providerRefundId",
      operation.qualifying_allocation_minor_units::TEXT AS "qualifyingAllocationMinorUnits",
      operation.remaining_refundable_minor_units::TEXT AS "remainingRefundableMinorUnits"
    FROM membership_operations operation
    WHERE operation.provider = 'stripe' AND operation.environment = ${options.providerEnvironment}
      AND operation.application_id = ${options.providerApplicationId}
      AND operation.idempotency_key = ${idempotencyKey}
      AND operation.membership_lineage_binding_id = ${options.membershipLineageBindingId}
    FOR UPDATE
  `)
  const row = rows[0] as
    | {
        completed: boolean
        failed: boolean
        hasReceipt: boolean
        id: string
        providerRefundId: string | null
        qualifyingAllocationMinorUnits: string
        remainingRefundableMinorUnits: string
      }
    | undefined
  if (!row) throw new Error(`Could not claim Stripe reversal ${idempotencyKey}`)
  await recordReversalCaseOperation(options.reversalCaseId, row.id, options.query)
  row.remainingRefundableMinorUnits = String(
    await reconcileFailedIneligiblePurchaseReversal(
      row,
      options.target.providerObservedAmountMinorUnits ?? options.target.amountMinorUnits,
      {
        externallySatisfiedMinorUnits: options.target.externallySatisfiedMinorUnits,
        providerRefundObservedSucceeded: row.providerRefundId
          ? await wasSucceededStripeRefundObserved({
              query: options.query,
              reversalCaseId: options.reversalCaseId,
              stripeRefundId: row.providerRefundId,
              target: options.target,
            })
          : false,
        query: options.query,
      },
    ),
  )
  const target = {
    ...options.target,
    amountMinorUnits: Number(row.remainingRefundableMinorUnits),
  }
  if (row.completed) return completedReversal(row, idempotencyKey, target)
  if (row.hasReceipt) {
    await options.query(sql`/* claimIneligiblePurchaseReversal:completeReceipt */
      UPDATE membership_operations
      SET completed_at = CURRENT_TIMESTAMP, failed_at = NULL, failure_message = NULL,
        execution_claim_token = NULL, execution_claimed_at = NULL
      WHERE id = ${row.id} AND completed_at IS NULL
    `)
    return completedReversal(row, idempotencyKey, target)
  }
  return {
    completed: false,
    executionClaimToken: await claimIneligiblePurchaseReversalExecution(row.id, options.query),
    hasReceipt: false,
    id: row.id,
    idempotencyKey,
    providerRefundId: row.providerRefundId,
    target,
  }
}

function completedReversal(
  row: { id: string; providerRefundId: string | null },
  idempotencyKey: string,
  target: ReversalTarget,
): ClaimedReversal {
  return {
    completed: true,
    executionClaimToken: null,
    hasReceipt: true,
    id: row.id,
    idempotencyKey,
    providerRefundId: row.providerRefundId,
    target,
  }
}
