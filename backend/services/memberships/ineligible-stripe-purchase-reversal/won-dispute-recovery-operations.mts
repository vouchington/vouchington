import type { QueryExecutor } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { createWonDisputeRecoveryIdempotencyPrefix } from '../ineligible-stripe-purchase-reversal-idempotency.mts'
import type { IneligiblePurchaseReversalCase } from './case-ledger.mts'

export type WonDisputeRecoveryOperation = {
  completed: boolean
  failed: boolean
  hasReceipt: boolean
  id: string
  providerRefundId: string | null
  qualifyingAllocationMinorUnits: string
  remainingRefundableMinorUnits: string
}

export async function getWonDisputeRecoveryAllocatedMinorUnits(
  reversalCase: IneligiblePurchaseReversalCase,
  originalOperationId: string,
  query: QueryExecutor,
): Promise<number> {
  const { rows } = await query(sql`/* getWonDisputeRecoveryAllocatedMinorUnits */
    SELECT COALESCE(SUM(operation.qualifying_allocation_minor_units), 0)::TEXT AS "allocatedMinorUnits"
    FROM membership_operations operation
    WHERE operation.provider = 'stripe' AND operation.environment = ${reversalCase.providerEnvironment}
      AND operation.application_id = ${reversalCase.providerApplicationId}
      AND operation.membership_source_id = ${reversalCase.membershipSourceId}
      AND operation.membership_provider_lineage_id = ${reversalCase.membershipProviderLineageId}
      AND operation.membership_lineage_binding_id = ${reversalCase.membershipLineageBindingId}
      AND operation.operation_kind = 'collision_resolution'
      AND operation.idempotency_key LIKE ${`${createWonDisputeRecoveryIdempotencyPrefix(originalOperationId)}%`}
  `)
  return Number((rows[0] as { allocatedMinorUnits: string }).allocatedMinorUnits)
}

export async function getWonDisputeRecoveryOperation(
  reversalCase: IneligiblePurchaseReversalCase,
  idempotencyKey: string,
  query: QueryExecutor,
): Promise<WonDisputeRecoveryOperation | null> {
  const { rows } = await query(sql`/* getWonDisputeRecoveryOperation */
    SELECT operation.id, operation.completed_at IS NOT NULL AS completed,
      operation.failed_at IS NOT NULL AS failed,
      EXISTS (
        SELECT 1 FROM membership_automatic_refund_receipts receipt
        WHERE receipt.membership_operation_id = operation.id
      ) AS "hasReceipt",
      operation.provider_refund_id AS "providerRefundId",
      operation.qualifying_allocation_minor_units::TEXT AS "qualifyingAllocationMinorUnits",
      operation.remaining_refundable_minor_units::TEXT AS "remainingRefundableMinorUnits"
    FROM membership_operations operation
    WHERE operation.provider = 'stripe' AND operation.environment = ${reversalCase.providerEnvironment}
      AND operation.application_id = ${reversalCase.providerApplicationId}
      AND operation.membership_source_id = ${reversalCase.membershipSourceId}
      AND operation.membership_provider_lineage_id = ${reversalCase.membershipProviderLineageId}
      AND operation.membership_lineage_binding_id = ${reversalCase.membershipLineageBindingId}
      AND operation.operation_kind = 'collision_resolution'
      AND operation.idempotency_key = ${idempotencyKey}
    FOR UPDATE OF operation
  `)
  return (rows[0] as WonDisputeRecoveryOperation | undefined) ?? null
}
