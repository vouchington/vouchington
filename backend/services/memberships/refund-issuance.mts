import { beginTransaction, write, type QueryExecutor } from '@data-stores/psql'
import createHttpError from 'http-errors'
import { getStripePaymentIntentLatestCharge } from '@modules/stripe/disputes'
import sql from 'sql-template-strings'
import {
  mapAttempt,
  type ReconciliationAttemptRow,
} from './refund-reconciliation/ledger-mappers.mts'
import type { RefundReconciliationAttempt } from './refund-reconciliation/types.mts'

export const MAX_LOCAL_STRIPE_REFUND_ISSUANCES_PER_CHARGE = 10

/** Commits the real provider attempt before issuing a refund; webhook receipts never use admission. */
export async function recordRefundReconciliationAttempt(
  lease: { id: string; leaseToken: string | null; attemptOrdinal?: number },
  providerIdempotencyKey: string,
): Promise<RefundReconciliationAttempt> {
  try {
    await using query = await beginTransaction({ serializable: true })
    const existing = await getExistingAttempt(lease.id, providerIdempotencyKey, query)
    if (existing && !existing.rejectedAt) {
      if (!existing.providerRefundId)
        await query(sql`/* recordRefundReconciliationAttempt: unresolved replay */
          UPDATE membership_refund_operation_attempts SET outcome_unknown_at = ${new Date()}
          WHERE id = ${existing.id} AND outcome_unknown_at IS NULL AND rejected_at IS NULL AND provider_refund_id IS NULL`)
      await query.commit()
      return mapAttempt(existing)
    }
    const admittedAt = new Date()
    const { rows: targets } = await query<{
      context_id: string
      payment_reference: string
    }>(sql`/* recordRefundReconciliationAttempt: target */
      SELECT operation.membership_provider_context_id AS context_id,
        operation.provider_charge_id AS payment_reference
      FROM membership_operations operation
      INNER JOIN membership_operation_execution_work_items work ON work.membership_operation_id = operation.id
      WHERE operation.id = ${lease.id} AND operation.completed_at IS NULL
        AND work.lease_token = ${lease.leaseToken} AND work.lease_expires_at > ${admittedAt}
        AND operation.provider_charge_id IS NOT NULL`)
    const target = targets[0]
    if (!target)
      throw createHttpError(409, 'Refund operation is no longer executable', {
        code: 'MEMBERSHIP_REFUND_CONFLICT',
      })
    await assertLocalStripeRefundCapacity(target.context_id, target.payment_reference, query)
    if (lease.attemptOrdinal === undefined || existing?.rejectedAt)
      await query(sql`/* recordRefundReconciliationAttempt: automatic attempt ordinal */
        UPDATE membership_operations SET reconciliation_attempt_ordinal = reconciliation_attempt_ordinal + 1
        WHERE id = ${lease.id}`)
    const { rows } =
      await query<ReconciliationAttemptRow>(sql`/* recordRefundReconciliationAttempt: attempt */
      INSERT INTO membership_refund_operation_attempts (
        membership_operation_id, membership_provider_context_id, attempt_ordinal,
        provider_idempotency_key, provider_request_original_attempt_id, amount_minor_units, currency_code
      ) SELECT operation.id, operation.membership_provider_context_id, operation.reconciliation_attempt_ordinal,
        ${providerIdempotencyKey}, ${existing ? (existing.providerRequestOriginalAttemptId ?? existing.id) : null}::uuid, COALESCE(${existing?.amountMinorUnits ?? null}::bigint, operation.remaining_refundable_minor_units), operation.currency_code
      FROM membership_operations operation
      WHERE operation.id = ${lease.id}
        AND (${existing?.rejectedAt ? null : (lease.attemptOrdinal ?? null)}::integer IS NULL OR operation.reconciliation_attempt_ordinal = ${existing?.rejectedAt ? null : (lease.attemptOrdinal ?? null)})
      RETURNING id, provider_request_original_attempt_id AS "providerRequestOriginalAttemptId", rejected_at AS "rejectedAt", membership_operation_id AS "membershipOperationId", attempt_ordinal AS "attemptOrdinal",
        provider_idempotency_key AS "providerIdempotencyKey", provider_refund_id AS "providerRefundId",
        amount_minor_units::text AS "amountMinorUnits", currency_code AS currency`)
    if (!rows[0])
      throw createHttpError(409, 'Refund operation attempt changed', {
        code: 'MEMBERSHIP_REFUND_CONFLICT',
      })
    await query.commit()
    return mapAttempt(rows[0])
  } catch (err) {
    if (typeof err === 'object' && err !== null && 'code' in err && err.code === '40001')
      throw createHttpError(409, 'Concurrent refund issuance', {
        code: 'MEMBERSHIP_REFUND_CONFLICT',
        cause: err,
      })
    throw err
  }
}

export async function assertLocalStripeRefundCapacity(
  providerContextId: string,
  providerPaymentReference: string,
  query: QueryExecutor,
): Promise<void> {
  const { rows } = await query(sql`/* assertLocalStripeRefundCapacity */
    SELECT attempt.id
    FROM membership_operations operation
    INNER JOIN membership_refund_operation_attempts attempt ON attempt.membership_operation_id = operation.id
    WHERE operation.membership_provider_context_id = ${providerContextId}
      AND operation.provider_charge_id = ${providerPaymentReference}
      AND attempt.rejected_at IS NULL
    LIMIT ${MAX_LOCAL_STRIPE_REFUND_ISSUANCES_PER_CHARGE}`)
  if (rows.length >= MAX_LOCAL_STRIPE_REFUND_ISSUANCES_PER_CHARGE)
    throw createHttpError(409, 'Local Stripe refund issuance limit reached', {
      code: 'MEMBERSHIP_REFUND_LIMIT_REACHED',
    })
}

async function getExistingAttempt(
  operationId: string,
  providerIdempotencyKey: string,
  query: QueryExecutor,
): Promise<ReconciliationAttemptRow | undefined> {
  const { rows } =
    await query<ReconciliationAttemptRow>(sql`/* recordRefundReconciliationAttempt: replay */
    SELECT attempt.id, attempt.provider_request_original_attempt_id AS "providerRequestOriginalAttemptId", attempt.rejected_at AS "rejectedAt", attempt.membership_operation_id AS "membershipOperationId",
      attempt.attempt_ordinal AS "attemptOrdinal", attempt.provider_idempotency_key AS "providerIdempotencyKey",
      attempt.provider_refund_id AS "providerRefundId", attempt.amount_minor_units::text AS "amountMinorUnits",
      attempt.currency_code AS currency
    FROM membership_refund_operation_attempts attempt
    INNER JOIN membership_operations operation ON operation.id = attempt.membership_operation_id
    WHERE operation.id = ${operationId} AND attempt.provider_idempotency_key = ${providerIdempotencyKey}
    ORDER BY attempt.attempt_ordinal DESC LIMIT 1`)
  return rows[0]
}

export async function resolveStripeRefundChargeId(
  providerPaymentReference: string,
): Promise<string> {
  if (!providerPaymentReference.startsWith('pi_')) return providerPaymentReference
  const charge = await getStripePaymentIntentLatestCharge(providerPaymentReference)
  if (!charge)
    throw createHttpError(409, 'Stripe payment intent has no refundable charge', {
      code: 'MEMBERSHIP_REFUND_CHARGE_UNAVAILABLE',
    })
  return typeof charge === 'string' ? charge : charge.id
}

export async function getRefundOperationPaymentReference(operationId: string): Promise<string> {
  const { rows } = await write<{
    charge_id: string | null
  }>(sql`/* getRefundOperationPaymentReference */
    SELECT provider_payment_reference AS charge_id FROM membership_operations WHERE id = ${operationId}`)
  const chargeId = rows[0]?.charge_id
  if (!chargeId)
    throw createHttpError(409, 'Refund operation has no charge target', {
      code: 'MEMBERSHIP_REFUND_CHARGE_UNAVAILABLE',
    })
  return chargeId
}
