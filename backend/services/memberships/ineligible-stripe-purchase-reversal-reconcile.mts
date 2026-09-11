import type { QueryExecutor } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function reconcileFailedIneligiblePurchaseReversal(
  operation: {
    failed: boolean
    hasReceipt: boolean
    id: string
    providerRefundId?: string | null
    qualifyingAllocationMinorUnits?: string | null
    remainingRefundableMinorUnits: string | null
  },
  observedRemainingMinorUnits: number,
  options: {
    externallySatisfiedMinorUnits?: number
    providerRefundObservedSucceeded: boolean
    query: QueryExecutor
  },
): Promise<number> {
  if (operation.remainingRefundableMinorUnits === null)
    throw new Error(`Stripe reversal ${operation.id} is missing its refundable amount`)
  const currentRemainingMinorUnits = Number(operation.remainingRefundableMinorUnits)
  const observedRemaining = getObservedRemainingMinorUnits(
    operation,
    observedRemainingMinorUnits,
    options.externallySatisfiedMinorUnits,
  )
  if (
    observedRemaining === 0 &&
    operation.providerRefundId &&
    options.providerRefundObservedSucceeded
  )
    return currentRemainingMinorUnits
  if (!operation.failed || operation.hasReceipt || observedRemaining >= currentRemainingMinorUnits)
    return currentRemainingMinorUnits
  const { rows } = await options.query(sql`/* reconcileFailedIneligiblePurchaseReversal */
    UPDATE membership_operations
    SET remaining_refundable_minor_units = ${observedRemaining}
    WHERE id = ${operation.id}
      AND completed_at IS NULL
      AND failed_at IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM membership_automatic_refund_receipts receipt
        WHERE receipt.membership_operation_id = membership_operations.id
      )
    RETURNING remaining_refundable_minor_units::TEXT AS "remainingRefundableMinorUnits"
  `)
  const reconciled = rows[0] as { remainingRefundableMinorUnits: string } | undefined
  return reconciled ? Number(reconciled.remainingRefundableMinorUnits) : currentRemainingMinorUnits
}

export function getObservedRemainingMinorUnits(
  operation: { qualifyingAllocationMinorUnits?: string | null },
  providerObservedRemainingMinorUnits: number,
  externallySatisfiedMinorUnits: number | undefined,
): number {
  if (externallySatisfiedMinorUnits === undefined || !operation.qualifyingAllocationMinorUnits)
    return providerObservedRemainingMinorUnits
  return Math.max(
    0,
    Number(operation.qualifyingAllocationMinorUnits) - externallySatisfiedMinorUnits,
  )
}
