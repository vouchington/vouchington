import type { QueryExecutor } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { getOrCreateProviderContextId } from '../provider-context.mts'
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
    INNER JOIN membership_provider_contexts provider_context
      ON provider_context.id = operation.membership_provider_context_id
    WHERE provider_context.provider = 'stripe' AND provider_context.environment = ${reversalCase.providerEnvironment}
      AND provider_context.application_id = ${reversalCase.providerApplicationId}
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
  lockOperation: boolean,
): Promise<WonDisputeRecoveryOperation | null> {
  const statement = sql`/* getWonDisputeRecoveryOperation */
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
    INNER JOIN membership_provider_contexts provider_context
      ON provider_context.id = operation.membership_provider_context_id
    WHERE provider_context.provider = 'stripe' AND provider_context.environment = ${reversalCase.providerEnvironment}
      AND provider_context.application_id = ${reversalCase.providerApplicationId}
      AND operation.membership_source_id = ${reversalCase.membershipSourceId}
      AND operation.membership_provider_lineage_id = ${reversalCase.membershipProviderLineageId}
      AND operation.membership_lineage_binding_id = ${reversalCase.membershipLineageBindingId}
      AND operation.operation_kind = 'collision_resolution'
      AND operation.idempotency_key = ${idempotencyKey}
  `
  if (lockOperation) statement.append(sql` FOR UPDATE OF operation`)
  const { rows } = await query(statement)
  return (rows[0] as WonDisputeRecoveryOperation | undefined) ?? null
}

export async function getOriginalReversalWithReceipt(
  reversalCaseId: string,
  originalKey: string,
  query: QueryExecutor,
) {
  const { rows } = await query(sql`/* claimWonStripeDisputeRecovery:original */
    SELECT operation.id,
      operation.qualifying_allocation_minor_units::TEXT AS "qualifyingAllocationMinorUnits",
      receipt.amount_minor_units::TEXT AS "receiptAmountMinorUnits"
    FROM membership_ineligible_purchase_reversal_case_operations case_operation
    INNER JOIN membership_operations operation
      ON operation.id = case_operation.membership_operation_id
    INNER JOIN membership_automatic_refund_receipts receipt
      ON receipt.membership_operation_id = operation.id
    WHERE case_operation.membership_ineligible_purchase_reversal_case_id = ${reversalCaseId}
      AND operation.idempotency_key = ${originalKey}
      AND operation.completed_at IS NOT NULL
  `)
  return rows[0] as
    | {
        id: string
        qualifyingAllocationMinorUnits: string
        receiptAmountMinorUnits: string
      }
    | undefined
}

export type RecoveryPayment = { paymentReference: string; chargeId: string }

export async function createRecoveryOperation(
  reversalCase: IneligiblePurchaseReversalCase,
  idempotencyKey: string,
  payment: RecoveryPayment | null,
  amountMinorUnits: number,
  query: QueryExecutor,
): Promise<WonDisputeRecoveryOperation> {
  if (!payment) throw new Error('Could not prepare payment for won-dispute reversal recovery')
  await insertRecoveryOperation(reversalCase, idempotencyKey, payment, amountMinorUnits, query)
  const created = await getWonDisputeRecoveryOperation(reversalCase, idempotencyKey, query, true)
  if (!created) throw new Error('Could not create won-dispute reversal recovery')
  return created
}

async function insertRecoveryOperation(
  reversalCase: IneligiblePurchaseReversalCase,
  idempotencyKey: string,
  payment: RecoveryPayment,
  amountMinorUnits: number,
  query: QueryExecutor,
): Promise<void> {
  const providerContextId = await getOrCreateProviderContextId(
    {
      provider: 'stripe',
      environment: reversalCase.providerEnvironment,
      applicationId: reversalCase.providerApplicationId,
    },
    query,
  )
  await query(sql`/* claimWonStripeDisputeRecovery:insert */
    INSERT INTO membership_operations (
      membership_source_id, membership_provider_lineage_id, membership_lineage_binding_id,
      membership_provider_context_id, operation_kind, idempotency_key, provider_payment_reference, provider_charge_id,
      qualifying_allocation_minor_units, remaining_refundable_minor_units, currency_code,
      period_started_at, period_ends_at, collision_at
    ) VALUES (
      ${reversalCase.membershipSourceId}, ${reversalCase.membershipProviderLineageId},
      ${reversalCase.membershipLineageBindingId}, ${providerContextId}, 'collision_resolution', ${idempotencyKey}, ${payment.paymentReference}, ${payment.chargeId},
      ${amountMinorUnits}, ${amountMinorUnits}, ${reversalCase.currency},
      ${reversalCase.periodStartedAt}, ${reversalCase.periodEndsAt}, ${reversalCase.collisionAt}
    )
  `)
}
