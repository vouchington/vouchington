import type { QueryExecutor } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { getOrCreateProviderContextId } from '../provider-context.mts'
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
  claimed: readonly ClaimedReversal[],
): Promise<ClaimedReversal[]> {
  if (!target) return [...claimed]
  const reversal = await claimIneligiblePurchaseReversal({ ...options, target })
  return claimIneligiblePurchaseReversalTargets(remainingTargets, options, [...claimed, reversal])
}

async function claimIneligiblePurchaseReversal(options: {
  collisionAt: Date
  membershipSourceId: string
  membershipLineageBindingId: string
  membershipProviderLineageId: string
  periodEndsAt: Date
  periodStartedAt: Date
  preparedCharges: ReadonlyMap<string, string> | undefined
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
  // ast-grep-ignore: no-three-sequential-awaits -- the context must exist before the operation insert, which must precede the locked claim reread
  const providerContextId = await getOrCreateProviderContextId(
    {
      provider: 'stripe',
      environment: options.providerEnvironment,
      applicationId: options.providerApplicationId,
    },
    options.query,
  )
  // An operation already found in preflight retains its immutable charge identity.
  const providerChargeId = options.target.chargeId ?? options.preparedCharges?.get(idempotencyKey)
  if (providerChargeId) {
    await options.query(sql`/* claimIneligiblePurchaseReversal:insert */
      INSERT INTO membership_operations (
        membership_source_id, membership_provider_lineage_id, membership_lineage_binding_id,
        membership_provider_context_id, operation_kind, idempotency_key, provider_payment_reference, provider_charge_id,
        qualifying_allocation_minor_units, remaining_refundable_minor_units, currency_code,
        period_started_at, period_ends_at, collision_at
      ) VALUES (
        ${options.membershipSourceId}, ${options.membershipProviderLineageId},
        ${options.membershipLineageBindingId}, ${providerContextId}, 'ineligible_purchase_reversal', ${idempotencyKey}, ${options.target.chargeId ?? options.target.paymentIntentId}, ${providerChargeId},
        ${options.target.qualifyingAmountMinorUnits}, ${options.target.amountMinorUnits},
        ${options.target.currency}, ${options.periodStartedAt}, ${options.periodEndsAt},
        ${options.collisionAt}
      ) ON CONFLICT (membership_provider_context_id, idempotency_key) DO NOTHING
    `)
  }
  // lock-reason: prevents: claiming a reversal using stale refund amounts or completion state during reconciliation; writer: reconcileFailedIneligiblePurchaseReversal
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
    WHERE operation.membership_provider_context_id = ${providerContextId}::UUID
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
  // Reallocation can expose an unprepared payment intent. Only a committed operation can satisfy it.
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
      SET completed_at = CURRENT_TIMESTAMP, failed_at = NULL, failure_message = NULL
      WHERE id = ${row.id} AND completed_at IS NULL
    `)
    return completedReversal(row, idempotencyKey, target)
  }
  return {
    completed: false,
    leaseToken: await claimIneligiblePurchaseReversalExecution(row.id, options.query),
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
    leaseToken: null,
    hasReceipt: true,
    id: row.id,
    idempotencyKey,
    providerRefundId: row.providerRefundId,
    target,
  }
}
