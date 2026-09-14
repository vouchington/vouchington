import { randomUUID } from 'node:crypto'
import { beginTransaction, write, type QueryExecutor } from '@data-stores/psql'
import sql from 'sql-template-strings'
import {
  mapAttempt,
  mapLease,
  type ReconciliationAttemptRow,
  type ReconciliationLeaseRow,
} from './ledger-mappers.mts'
import type { RefundReconciliationAttempt, RefundReconciliationLease } from './types.mts'

const RECONCILIATION_LEASE_TTL_SECONDS = 300

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
  const leaseToken = randomUUID()
  const { rows } = await query(sql`/* leaseDueRefundReconciliation */
    UPDATE membership_operations
    SET execution_claim_token = ${leaseToken}, execution_claimed_at = CURRENT_TIMESTAMP,
      failed_at = NULL, failure_message = NULL,
      reconciliation_attempt_ordinal = reconciliation_attempt_ordinal + 1
    WHERE id = ${operationId}
      AND completed_at IS NULL
      AND reconciliation_due_at IS NOT NULL
      AND reconciliation_due_at <= CURRENT_TIMESTAMP
      AND (
        execution_claim_token IS NULL
        OR execution_claimed_at < CURRENT_TIMESTAMP - make_interval(secs => ${RECONCILIATION_LEASE_TTL_SECONDS})
      )
    RETURNING id, execution_claim_token AS "leaseToken",
      reconciliation_attempt_ordinal AS "attemptOrdinal",
      provider, environment AS "providerEnvironment", application_id AS "providerApplicationId",
      provider_refund_id AS "providerRefundId",
      remaining_refundable_minor_units::TEXT AS "amountMinorUnits", currency_code AS currency
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
    ) SELECT id, provider, environment, application_id,
      reconciliation_attempt_ordinal, ${providerIdempotencyKey},
      remaining_refundable_minor_units, currency_code
    FROM membership_operations
    WHERE id = ${lease.id} AND execution_claim_token = ${lease.leaseToken}
      AND reconciliation_attempt_ordinal = ${lease.attemptOrdinal}
    ORDER BY id ASC NULLS LAST, reconciliation_attempt_ordinal ASC NULLS LAST
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
    UPDATE membership_operations
    SET failed_at = CURRENT_TIMESTAMP, failure_message = ${failureMessage},
      reconciliation_due_at = ${dueAt}, execution_claim_token = NULL, execution_claimed_at = NULL
    WHERE id = ${lease.id} AND completed_at IS NULL
      AND execution_claim_token = ${lease.leaseToken}
    RETURNING id
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
    SET completed_at = CURRENT_TIMESTAMP, failed_at = NULL, failure_message = NULL,
      reconciliation_due_at = NULL, execution_claim_token = NULL, execution_claimed_at = NULL
    WHERE id = ${lease.id} AND completed_at IS NULL
      AND execution_claim_token = ${lease.leaseToken}
    RETURNING id
  `)
  if (rows.length === 0) throw new RefundReconciliationInProgressError(lease.id)
}
