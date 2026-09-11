import { beginTransaction, write, type QueryExecutor } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { getIneligiblePurchaseReversalFailureMessage } from './ineligible-stripe-purchase-reversal-failure-message.mts'
import type { ClaimedReversal } from './ineligible-stripe-purchase-reversal-types.mts'

export class IneligiblePurchaseReversalInProgressError extends Error {
  constructor(operationId: string) {
    super(`Ineligible Stripe purchase reversal ${operationId} is already executing`)
    this.name = 'IneligiblePurchaseReversalInProgressError'
  }
}

export async function completeIneligiblePurchaseReversal(
  reversal: ClaimedReversal,
  receipt: { amountMinorUnits: number; providerRefundId: string | null },
): Promise<void> {
  await using transaction = await beginTransaction()
  await transaction(sql`/* completeIneligiblePurchaseReversal:receipt */
      INSERT INTO membership_automatic_refund_receipts (
        membership_operation_id, provider, environment, application_id, operation_kind,
        provider_refund_id, amount_minor_units, remaining_refundable_minor_units, currency_code
      ) SELECT
        operation.id, operation.provider, operation.environment, operation.application_id,
        operation.operation_kind, ${receipt.providerRefundId}, ${receipt.amountMinorUnits},
        operation.remaining_refundable_minor_units, operation.currency_code
      FROM membership_operations operation
      WHERE operation.id = ${reversal.id}
      ON CONFLICT (membership_operation_id) DO NOTHING
    `)
  await markIneligiblePurchaseReversalCompleted(reversal, transaction)
  await transaction.commit()
}

export async function recordIneligiblePurchaseReversalProviderRefund(
  reversal: Pick<ClaimedReversal, 'id' | 'executionClaimToken'>,
  providerRefundId: string,
): Promise<void> {
  const { rows } = await write(sql`/* recordIneligiblePurchaseReversalProviderRefund */
    UPDATE membership_operations
    SET provider_refund_id = ${providerRefundId}
    WHERE id = ${reversal.id} AND completed_at IS NULL
      AND execution_claim_token = ${reversal.executionClaimToken}
    RETURNING id
  `)
  if (rows.length === 0) throw new IneligiblePurchaseReversalInProgressError(reversal.id)
}

export async function markIneligiblePurchaseReversalCompleted(
  reversal: Pick<ClaimedReversal, 'id' | 'executionClaimToken'>,
  query?: QueryExecutor,
): Promise<void> {
  const run = query ?? write
  const { rows } = await run(sql`/* completeIneligiblePurchaseReversal:operation */
    UPDATE membership_operations
    SET completed_at = CURRENT_TIMESTAMP, failed_at = NULL, failure_message = NULL,
      execution_claim_token = NULL, execution_claimed_at = NULL
    WHERE id = ${reversal.id} AND completed_at IS NULL
      AND execution_claim_token = ${reversal.executionClaimToken}
    RETURNING id
  `)
  if (rows.length === 0) throw new IneligiblePurchaseReversalInProgressError(reversal.id)
}

export async function failIneligiblePurchaseReversal(
  reversal: Pick<ClaimedReversal, 'id' | 'executionClaimToken'>,
  error: unknown,
): Promise<void> {
  const failureMessage = getIneligiblePurchaseReversalFailureMessage(error)
  await write(sql`/* failIneligiblePurchaseReversal */
    UPDATE membership_operations
    SET failed_at = CURRENT_TIMESTAMP, failure_message = ${failureMessage},
      execution_claim_token = NULL, execution_claimed_at = NULL
    WHERE id = ${reversal.id} AND completed_at IS NULL
      AND execution_claim_token = ${reversal.executionClaimToken}
  `)
}
