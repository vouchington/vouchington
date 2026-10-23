import { randomUUID } from 'node:crypto'
import { beginTransaction, read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { claimIneligiblePurchaseCancellationOperation } from '../../services/memberships/ineligible-stripe-purchase-cancellation.mts'
import { getTestCancellationClaimContext } from '../data-stores/psql/membership-ledger-immutability.mts'

export async function attemptYoungMembershipLedgerDeletion(id: string): Promise<void> {
  await using query = await beginTransaction()
  await query(sql`/* seedYoungMembershipReplayFence */
    INSERT INTO membership_operation_retained_identities
      (id, membership_provider_context_id, membership_lineage_binding_id,
        idempotency_key, operation_kind)
    SELECT id, membership_provider_context_id, membership_lineage_binding_id,
      idempotency_key, operation_kind FROM membership_operations WHERE id = ${id}`)
  await query(sql`/* enableYoungMembershipRetentionProbe */
    SET LOCAL app.billing_retention_delete = 'on'`)
  await query(sql`/* rejectYoungMembershipLedgerDeletion */
    DELETE FROM membership_operations WHERE id = ${id}`)
}

export async function claimTestCancellationReplay(
  context: Awaited<ReturnType<typeof getTestCancellationClaimContext>>,
  applicationId: string,
  subscriptionId: string,
) {
  await using query = await beginTransaction()
  const result = await claimIneligiblePurchaseCancellationOperation(
    context.membershipSourceId,
    context.membershipLineageBindingId,
    context.membershipProviderLineageId,
    'test',
    applicationId,
    subscriptionId,
    query,
  )
  await query.commit()
  return result
}

export async function getTestRefundReceiptIdForOperation(operationId: string): Promise<string> {
  const { rows } = await read<{ id: string }>(sql`/* getRefundReceiptBeforeRetention */
    SELECT id FROM membership_refunds WHERE membership_operation_id = ${operationId}`)
  const id = rows[0]?.id
  if (!id) throw new Error('Expected refund receipt for operation')
  return id
}

export async function seedAdditionalRefundAttemptsForRetention(operationId: string): Promise<void> {
  await write(sql`/* seedAdditionalRefundAttemptsForRetention */
    INSERT INTO membership_refund_operation_attempts (
      membership_operation_id, membership_provider_context_id, attempt_ordinal,
      provider_idempotency_key, amount_minor_units, currency_code
    )
    SELECT operation.id, operation.membership_provider_context_id, ordinal,
      ${`retention-attempt-${randomUUID()}`} || ordinal::text, 100, 'usd'
    FROM membership_operations operation
    CROSS JOIN generate_series(2, 3) ordinal
    WHERE operation.id = ${operationId}`)
}

export async function countRemainingRefundAttempts(operationId: string): Promise<number> {
  const { rows } = await read<{ count: number }>(sql`/* countRemainingRefundAttempts */
    SELECT count(*)::integer AS count FROM membership_refund_operation_attempts
    WHERE membership_operation_id = ${operationId}`)
  return rows[0]?.count ?? 0
}
