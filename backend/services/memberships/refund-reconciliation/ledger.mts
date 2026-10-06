import { beginTransaction, write, type QueryExecutor } from '@data-stores/psql'
import sql from 'sql-template-strings'
import {
  mapAttempt,
  mapLease,
  type ReconciliationAttemptRow,
  type ReconciliationLeaseRow,
} from './ledger-mappers.mts'
import type { RefundReconciliationAttempt, RefundReconciliationLease } from './types.mts'

import { claimMembershipOperationExecutionWork } from '../operation-execution-work.mts'

export class RefundReconciliationInProgressError extends Error {
  constructor(operationId: string) {
    super(`Refund reconciliation ${operationId} is already leased`)
    this.name = 'RefundReconciliationInProgressError'
  }
}

export async function leaseDueRefundReconciliation(
  operationId: string,
  query?: QueryExecutor,
): Promise<RefundReconciliationLease | null> {
  if (!query) {
    await using transaction = await beginTransaction()
    const lease = await leaseDueRefundReconciliation(operationId, transaction)
    await transaction.commit()
    return lease
  }
  const leaseToken = await claimMembershipOperationExecutionWork(operationId, query, true)
  if (!leaseToken) return null
  const { rows } = await query(sql`/* leaseDueRefundReconciliation */
    SELECT operation.id, work.lease_token AS "leaseToken",
      reconciliation_attempt_ordinal AS "attemptOrdinal",
      provider, environment AS "providerEnvironment", application_id AS "providerApplicationId",
      provider_refund_id AS "providerRefundId",
      remaining_refundable_minor_units::TEXT AS "amountMinorUnits", currency_code AS currency
    FROM membership_operations operation
    JOIN membership_operation_execution_work_items work ON work.membership_operation_id = operation.id
    WHERE operation.id = ${operationId} AND work.lease_token = ${leaseToken}
  `)
  const row = rows[0] as ReconciliationLeaseRow | undefined
  return row ? mapLease(row) : null
}

export async function recordRefundReconciliationAttempt(
  lease: RefundReconciliationLease,
  providerIdempotencyKey: string,
): Promise<RefundReconciliationAttempt> {
  const { rows: insertedRows } = await write(sql`/* recordRefundReconciliationAttempt:insert */
    INSERT INTO membership_refund_operation_attempts (
      membership_operation_id, provider, environment, application_id,
      attempt_ordinal, provider_idempotency_key,
      amount_minor_units, currency_code
    ) SELECT operation.id, provider, environment, application_id,
      reconciliation_attempt_ordinal, ${providerIdempotencyKey},
      remaining_refundable_minor_units, currency_code
    FROM membership_operations operation
    JOIN membership_operation_execution_work_items work ON work.membership_operation_id = operation.id
    WHERE operation.id = ${lease.id} AND work.lease_token = ${lease.leaseToken}
      AND work.lease_expires_at > clock_timestamp() AND operation.completed_at IS NULL
      AND reconciliation_attempt_ordinal = ${lease.attemptOrdinal}
    ORDER BY operation.id ASC NULLS LAST, reconciliation_attempt_ordinal ASC NULLS LAST
    ON CONFLICT (membership_operation_id, attempt_ordinal) DO NOTHING
    RETURNING id, membership_operation_id AS "membershipOperationId",
      attempt_ordinal AS "attemptOrdinal", provider_idempotency_key AS "providerIdempotencyKey",
      provider_refund_id AS "providerRefundId", amount_minor_units::TEXT AS "amountMinorUnits",
      currency_code AS currency
  `)
  const inserted = insertedRows[0] as ReconciliationAttemptRow | undefined
  if (inserted) return mapAttempt(inserted)

  const { rows } = await write(sql`/* recordRefundReconciliationAttempt:existing */
    SELECT id, membership_operation_id AS "membershipOperationId",
      attempt_ordinal AS "attemptOrdinal", provider_idempotency_key AS "providerIdempotencyKey",
      provider_refund_id AS "providerRefundId", amount_minor_units::TEXT AS "amountMinorUnits",
      currency_code AS currency
    FROM membership_refund_operation_attempts
    WHERE membership_operation_id = ${lease.id}
      AND provider = ${lease.provider}
      AND environment = ${lease.providerEnvironment}
      AND application_id = ${lease.providerApplicationId}
      AND provider_idempotency_key = ${providerIdempotencyKey}
  `)
  const existing = rows[0] as ReconciliationAttemptRow | undefined
  if (!existing || existing.attemptOrdinal !== lease.attemptOrdinal)
    throw new RefundReconciliationInProgressError(lease.id)
  return mapAttempt(existing)
}

export async function getLatestRefundReconciliationAttempt(
  operationId: string,
): Promise<RefundReconciliationAttempt | null> {
  const { rows } = await write(sql`/* getLatestRefundReconciliationAttempt */
    SELECT id, membership_operation_id AS "membershipOperationId",
      attempt_ordinal AS "attemptOrdinal", provider_idempotency_key AS "providerIdempotencyKey",
      provider_refund_id AS "providerRefundId", amount_minor_units::TEXT AS "amountMinorUnits",
      currency_code AS currency
    FROM membership_refund_operation_attempts
    WHERE membership_operation_id = ${operationId}
    ORDER BY attempt_ordinal DESC
    LIMIT 1
  `)
  const row = rows[0] as ReconciliationAttemptRow | undefined
  return row ? mapAttempt(row) : null
}

export async function enrichRefundReconciliationAttemptProviderRefund(
  attemptId: string,
  providerRefundId: string,
): Promise<RefundReconciliationAttempt> {
  const { rows } = await write(sql`/* enrichRefundReconciliationAttemptProviderRefund */
    UPDATE membership_refund_operation_attempts
    SET provider_refund_id = ${providerRefundId}
    WHERE id = ${attemptId} AND provider_refund_id IS NULL
    RETURNING id, membership_operation_id AS "membershipOperationId",
      attempt_ordinal AS "attemptOrdinal", provider_idempotency_key AS "providerIdempotencyKey",
      provider_refund_id AS "providerRefundId", amount_minor_units::TEXT AS "amountMinorUnits",
      currency_code AS currency
  `)
  const row = rows[0] as ReconciliationAttemptRow | undefined
  if (!row) throw new Error(`Refund reconciliation attempt ${attemptId} cannot be enriched`)
  return mapAttempt(row)
}

export async function scheduleRefundReconciliationRetry(
  lease: Pick<RefundReconciliationLease, 'id' | 'leaseToken'>,
  dueAt: Date,
  failureMessage: string,
): Promise<void> {
  const { rows } = await write(sql`/* scheduleRefundReconciliationRetry */
    WITH candidate AS (
      SELECT id FROM membership_operations WHERE id = ${lease.id} AND completed_at IS NULL FOR UPDATE
    ), scheduled AS (
      UPDATE membership_operation_execution_work_items work SET available_at = ${dueAt}
      FROM candidate
      WHERE work.membership_operation_id = candidate.id AND work.lease_token = ${lease.leaseToken}
        AND work.lease_expires_at > clock_timestamp()
      RETURNING work.membership_operation_id
    )
    UPDATE membership_operations operation
    SET failed_at = clock_timestamp(), failure_message = ${failureMessage}
    FROM scheduled WHERE operation.id = scheduled.membership_operation_id
    RETURNING operation.id
  `)
  if (rows.length === 0) throw new RefundReconciliationInProgressError(lease.id)
}

export async function completeRefundReconciliation(
  lease: Pick<RefundReconciliationLease, 'id' | 'leaseToken'>,
  query?: QueryExecutor,
): Promise<void> {
  const run = query ?? write
  const { rows } = await run(sql`/* completeRefundReconciliation */
    UPDATE membership_operations
    SET completed_at = clock_timestamp(), failed_at = NULL, failure_message = NULL
    WHERE id = ${lease.id} AND completed_at IS NULL
      AND EXISTS (
        SELECT 1 FROM membership_operation_execution_work_items work
        WHERE work.membership_operation_id = membership_operations.id
          AND work.lease_token = ${lease.leaseToken} AND work.lease_expires_at > clock_timestamp()
      )
    RETURNING id
  `)
  if (rows.length === 0) throw new RefundReconciliationInProgressError(lease.id)
}
