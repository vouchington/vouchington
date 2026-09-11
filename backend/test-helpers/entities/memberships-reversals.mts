import { read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function getTestIneligiblePurchaseReversal(
  subscriptionId: string,
  environment: 'test' | 'production',
) {
  const { rows } = await read<{
    amount_minor_units: string
    receipt_amount_minor_units: string | null
    receipt_remaining_refundable_minor_units: string | null
    qualifying_amount_minor_units: string
    completed_at: Date | null
    operation_kind: 'ineligible_purchase_reversal'
    provider_refund_id: string | null
  }>(sql`/* getTestIneligiblePurchaseReversal */
    SELECT operation.remaining_refundable_minor_units AS amount_minor_units,
      receipt.amount_minor_units::TEXT AS receipt_amount_minor_units,
      receipt.remaining_refundable_minor_units::TEXT AS receipt_remaining_refundable_minor_units,
      operation.qualifying_allocation_minor_units AS qualifying_amount_minor_units,
      operation.completed_at, operation.operation_kind,
      COALESCE(receipt.provider_refund_id, operation.provider_refund_id) AS provider_refund_id
    FROM membership_operations operation
    INNER JOIN membership_sources source ON source.id = operation.membership_source_id
    INNER JOIN membership_provider_lineages lineage
      ON lineage.id = source.membership_provider_lineage_id
    LEFT JOIN membership_automatic_refund_receipts receipt
      ON receipt.membership_operation_id = operation.id
    WHERE lineage.provider = 'stripe'
      AND lineage.environment = ${environment}
      AND lineage.provider_lineage_id = ${subscriptionId}
      AND operation.operation_kind = 'ineligible_purchase_reversal'
    ORDER BY operation.id DESC
    LIMIT 1
  `)
  return rows[0] ?? null
}

export async function getTestWonDisputeRecovery(
  subscriptionId: string,
  environment: 'test' | 'production',
) {
  const { rows } = await read<{
    completed_at: Date | null
    has_execution_claim: boolean
    operation_kind: 'collision_resolution'
    receipt_amount_minor_units: string | null
  }>(sql`/* getTestWonDisputeRecovery */
    SELECT operation.completed_at, operation.operation_kind,
      operation.execution_claim_token IS NOT NULL AS has_execution_claim,
      receipt.amount_minor_units::TEXT AS receipt_amount_minor_units
    FROM membership_operations operation
    INNER JOIN membership_provider_lineages lineage
      ON lineage.id = operation.membership_provider_lineage_id
    LEFT JOIN membership_automatic_refund_receipts receipt
      ON receipt.membership_operation_id = operation.id
    WHERE lineage.provider = 'stripe'
      AND lineage.environment = ${environment}
      AND lineage.provider_lineage_id = ${subscriptionId}
      AND operation.operation_kind = 'collision_resolution'
    ORDER BY operation.id DESC
    LIMIT 1
  `)
  return rows[0] ?? null
}

export async function getTestIneligiblePurchaseReversalExecutionClaimCount(
  subscriptionId: string,
  environment: 'test' | 'production',
): Promise<number> {
  const { rows } = await read<{
    count: string
  }>(sql`/* getTestIneligiblePurchaseReversalExecutionClaimCount */
    SELECT COUNT(*)::TEXT AS count
    FROM membership_operations operation
    INNER JOIN membership_sources source ON source.id = operation.membership_source_id
    INNER JOIN membership_provider_lineages lineage
      ON lineage.id = source.membership_provider_lineage_id
    WHERE lineage.provider = 'stripe'
      AND lineage.environment = ${environment}
      AND lineage.provider_lineage_id = ${subscriptionId}
      AND operation.operation_kind IN ('ineligible_purchase_reversal', 'cancel_source')
      AND operation.execution_claim_token IS NOT NULL
  `)
  return Number(rows[0]!.count)
}

export async function getTestIneligiblePurchaseReversalCase(
  subscriptionId: string,
  environment: 'test' | 'production',
) {
  const { rows } = await read<{
    currency_code: string
    qualifying_amount_minor_units: string
    refund_cap_minor_units: string
    stripe_price_id: string
  }>(sql`/* getTestIneligiblePurchaseReversalCase */
    SELECT reversal_case.currency_code, reversal_case.qualifying_amount_minor_units,
      reversal_case.refund_cap_minor_units, reversal_case.stripe_price_id
    FROM membership_ineligible_purchase_reversal_cases reversal_case
    INNER JOIN membership_provider_lineages lineage
      ON lineage.id = reversal_case.membership_provider_lineage_id
    WHERE lineage.provider = 'stripe' AND lineage.environment = ${environment}
      AND lineage.provider_lineage_id = ${subscriptionId}
  `)
  return rows[0] ?? null
}

export async function getTestIneligiblePurchaseReversalCaseOperationCount(
  subscriptionId: string,
  environment: 'test' | 'production',
): Promise<number> {
  const { rows } = await read<{
    count: string
  }>(sql`/* getTestIneligiblePurchaseReversalCaseOperationCount */
    SELECT COUNT(*)::TEXT AS count
    FROM membership_ineligible_purchase_reversal_case_operations case_operation
    INNER JOIN membership_ineligible_purchase_reversal_cases reversal_case
      ON reversal_case.id = case_operation.membership_ineligible_purchase_reversal_case_id
    INNER JOIN membership_provider_lineages lineage
      ON lineage.id = reversal_case.membership_provider_lineage_id
    WHERE lineage.provider = 'stripe' AND lineage.environment = ${environment}
      AND lineage.provider_lineage_id = ${subscriptionId}
  `)
  return Number(rows[0]!.count)
}

export async function getTestIneligiblePurchaseReversalCaseContext(
  subscriptionId: string,
  environment: 'test' | 'production',
) {
  const { rows } = await read<{
    membership_lineage_binding_id: string
    membership_source_id: string
  }>(sql`/* getTestIneligiblePurchaseReversalCaseContext */
    SELECT reversal_case.membership_lineage_binding_id, reversal_case.membership_source_id
    FROM membership_ineligible_purchase_reversal_cases reversal_case
    INNER JOIN membership_provider_lineages lineage
      ON lineage.id = reversal_case.membership_provider_lineage_id
    WHERE lineage.provider = 'stripe' AND lineage.environment = ${environment}
      AND lineage.provider_lineage_id = ${subscriptionId}
  `)
  return rows[0] ?? null
}

export async function recordTestIneligiblePurchaseReversalReceipt(
  operationId: string,
  providerRefundId: string,
  amountMinorUnits: number,
): Promise<void> {
  await write(sql`/* recordTestIneligiblePurchaseReversalReceipt */
    INSERT INTO membership_automatic_refund_receipts (
      membership_operation_id, provider, environment, application_id, operation_kind,
      provider_refund_id, amount_minor_units, remaining_refundable_minor_units, currency_code
    ) SELECT
      operation.id, operation.provider, operation.environment, operation.application_id,
      operation.operation_kind, ${providerRefundId}, ${amountMinorUnits},
      operation.remaining_refundable_minor_units, operation.currency_code
    FROM membership_operations operation
    WHERE operation.id = ${operationId}
    ON CONFLICT (membership_operation_id) DO NOTHING
  `)
}
