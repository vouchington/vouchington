import { beginTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { DATA_RETENTION_MAX_VALUES, type DataRetentionLimits } from './config.mts'
import { cleanupStripeEventPage } from './cleanup-payment-stripe-events.mts'
import { drainExpiredMembershipOperationChildren } from './cleanup-payment-ledger-children.mts'

export type PaymentLedgerFamily = 'stripe_event' | 'membership_operation'
export type PaymentLedgerCleanupPage = {
  family: PaymentLedgerFamily
  scanned: number
  deleted: number
  hasMore: boolean
}

/** Oldest expired UUIDs are reconsidered on each daily pass; no permanent replay row survives. */
export async function cleanupPaymentLedgers(
  limits: DataRetentionLimits,
  recordIds?: readonly string[],
): Promise<PaymentLedgerCleanupPage[]> {
  if (
    !Number.isSafeInteger(limits.batchSize) ||
    limits.batchSize < 1 ||
    limits.batchSize > DATA_RETENTION_MAX_VALUES.batch_size ||
    !Number.isSafeInteger(limits.maxBatches) ||
    limits.maxBatches < 1 ||
    limits.maxBatches > DATA_RETENTION_MAX_VALUES.max_batches_per_run
  )
    throw new RangeError('Payment ledger retention requires positive limits')
  if (recordIds && recordIds.length > limits.batchSize)
    throw new RangeError('Scoped payment ledger cleanup must fit one page')
  // A UTC fiscal year becomes erasable after the next seven whole years have ended.
  const fiscalCutoff = new Date(Date.UTC(new Date().getUTCFullYear() - 7, 0, 1))
  const results: PaymentLedgerCleanupPage[] = []
  for (const family of ['stripe_event', 'membership_operation'] as const) {
    const result: PaymentLedgerCleanupPage = { family, scanned: 0, deleted: 0, hasMore: false }
    for (let batch = 0; batch < (recordIds ? 1 : limits.maxBatches); batch++) {
      // oxlint-disable-next-line no-await-in-loop -- each bounded transaction commits before the next oldest-id page.
      const page = await cleanupPaymentLedgerPage(family, limits.batchSize, fiscalCutoff, recordIds) // no-mistakes-disable-line query-reached-per-item: two fixed families each commit at most maxBatches transactions; a Stripe page locks at most batchSize + 1 event IDs, a membership page at most two operation IDs, and each deletes at most batchSize physical rows.
      result.scanned += page.scanned
      result.deleted += page.deleted
      result.hasMore = page.hasMore
      if (!page.hasMore) break
    }
    results.push(result)
  }
  return results
}

function cleanupPaymentLedgerPage(
  family: PaymentLedgerFamily,
  pageSize: number,
  fiscalCutoff: Date,
  recordIds?: readonly string[],
) {
  return family === 'stripe_event'
    ? cleanupStripeEventPage(pageSize, fiscalCutoff, recordIds)
    : cleanupMembershipOperationPage(pageSize, fiscalCutoff, recordIds)
}

async function cleanupMembershipOperationPage(
  pageSize: number,
  fiscalCutoff: Date,
  recordIds?: readonly string[],
) {
  await using query = await beginTransaction()
  await query(
    sql`/* permitExpiredMembershipOperationDelete */ SET LOCAL app.billing_retention_delete = 'on'`,
  )
  const statement = sql`/* selectExpiredMembershipOperationLedgerPage */
    SELECT operation.id, fn_membership_operation_fiscal_retention_due(operation.id) AS due
    FROM membership_operations operation
    WHERE operation.completed_at IS NOT NULL
      AND operation.operation_kind IN ('cancel_source', 'administrator_refund')
      AND operation.completed_at < ${fiscalCutoff}`
  if (recordIds) statement.append(sql` AND operation.id = ANY(${[...recordIds]}::uuid[])`)
  // Matches the partial index predicate. Deletion safety lives in the due function, evaluated
  // only for the page's rows, so no ineligible row can sit ahead of a deletable one in the scan.
  statement.append(sql`
    ORDER BY operation.completed_at, operation.id
    LIMIT 2 FOR UPDATE OF operation SKIP LOCKED`)
  const { rows } = await query<{ id: string; due: boolean }>(statement)
  const operationId = rows[0]?.due ? rows[0].id : undefined
  let deleted = 0
  let rootDeleted = 0
  if (operationId) {
    await query(sql`/* recordExpiredMembershipOperationDrain */
      UPDATE membership_operations operation
      SET fiscal_retention_started_at = clock_timestamp()
      WHERE operation.id = ${operationId}
        AND operation.fiscal_retention_started_at IS NULL`)
    deleted = await drainExpiredMembershipOperationChildren(query, operationId, pageSize)
    if (deleted < pageSize) {
      const result = await query(sql`/* deleteExpiredMembershipOperationLedger */
        DELETE FROM membership_operations operation WHERE operation.id = ${operationId}
          AND fn_membership_operation_fiscal_retention_due(operation.id)
          AND NOT EXISTS (SELECT 1 FROM membership_refund_operation_attempts attempt
            WHERE attempt.membership_operation_id = operation.id)
          AND NOT EXISTS (SELECT 1 FROM membership_refunds refund
            WHERE refund.membership_operation_id = operation.id)
          AND NOT EXISTS (SELECT 1 FROM membership_administrator_refund_operation_requests request
            WHERE request.membership_operation_id = operation.id)`)
      rootDeleted = result.rowCount ?? 0
      deleted += rootDeleted
    }
  }
  await query.commit()
  return {
    scanned: operationId ? 1 : 0,
    deleted,
    hasMore: Boolean(operationId) && (rootDeleted === 0 || rows.length > 1),
  }
}
