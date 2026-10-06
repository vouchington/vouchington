import { beginTransaction, read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { claimMembershipOperationExecutionWork } from '../../services/memberships/operation-execution-work.mts'

export async function getRefundOperationLeaseTokenForTest(operationId: string): Promise<string> {
  const { rows } = await read<{ leaseToken: string }>(sql`/* getRefundMetadataScanLease */
    SELECT lease_token AS "leaseToken" FROM membership_operation_execution_work_items WHERE membership_operation_id = ${operationId}`)
  return rows[0]!.leaseToken
}

export async function getRefundOperationRetryStateForTest(operationId: string) {
  const { rows } = await read<{
    due: boolean
    failed: boolean
    leased: boolean
  }>(sql`/* administratorProviderExceptionRetry */
    SELECT work.available_at > CURRENT_TIMESTAMP AS due, operation.failed_at IS NOT NULL AS failed,
      work.lease_token IS NOT NULL AS leased FROM membership_operations operation
      JOIN membership_operation_execution_work_items work ON work.membership_operation_id = operation.id
      WHERE operation.id = ${operationId}`)
  return rows[0]
}

export async function getMembershipRefundEventFixtureForTest(membershipId: string) {
  const { rows } = await read<{
    membershipSourceId: string
    userId: string
  }>(sql`/* getKnownPendingRefundEventFixture */
    SELECT membership.membership_source_id AS "membershipSourceId", membership.user_id AS "userId"
    FROM memberships membership WHERE membership.id = ${membershipId}`)
  return rows[0]!
}

export async function getRefundReceiptCountForTest(operationId: string): Promise<number> {
  const { rows } = await read<{ count: string }>(sql`/* administratorRefundReceiptCount */
    SELECT COUNT(*)::TEXT AS count FROM membership_refunds WHERE membership_operation_id = ${operationId}`)
  return Number(rows[0]?.count)
}

export async function getRefundCancellationConvergenceForTest(
  operationId: string,
  membershipId: string,
) {
  const { rows } = await read<{
    auditCount: string
    completed: boolean
    receiptCount: string
    revokedAccess: boolean
    status: string
  }>(sql`/* administratorRefundCancellationConvergence */
    SELECT operation.completed_at IS NOT NULL AS completed, COALESCE(receipt.has_revoked_access, FALSE) AS "revokedAccess",
      CASE WHEN membership.cancelled_at IS NULL THEN 'active' ELSE 'cancelled' END AS status,
      (SELECT COUNT(*)::TEXT FROM membership_refunds WHERE membership_operation_id = operation.id) AS "receiptCount",
      (SELECT COUNT(*)::TEXT FROM membership_changes WHERE membership_id = ${membershipId} AND change_type = 'refund') AS "auditCount"
    FROM membership_operations operation INNER JOIN memberships membership ON membership.id = ${membershipId}
    LEFT JOIN membership_refunds receipt ON receipt.membership_operation_id = operation.id WHERE operation.id = ${operationId}`)
  return rows[0]
}

export async function makeRefundOperationDueForTest(operationId: string): Promise<void> {
  await write(sql`/* makeAdministratorRefundOperationDue */ UPDATE membership_operation_execution_work_items
    SET available_at = clock_timestamp() WHERE membership_operation_id = ${operationId}`)
}

export async function cleanupRefundReconciliationOperationsForTest(
  operationIds: readonly string[],
): Promise<void> {
  if (operationIds.length === 0) return

  await using transaction = await beginTransaction()
  for (const operationId of operationIds) {
    const token = await claimMembershipOperationExecutionWork(operationId, transaction, true)
    if (!token) continue
    await transaction(sql`/* completeRefundReconciliationDispatcherTestCleanup */
      UPDATE membership_operations operation SET completed_at = clock_timestamp(), failed_at = NULL, failure_message = NULL
      WHERE operation.id = ${operationId} AND operation.completed_at IS NULL
        AND EXISTS (SELECT 1 FROM membership_operation_execution_work_items work
          WHERE work.membership_operation_id = operation.id AND work.lease_token = ${token})`)
  }
  await transaction.commit()
}

export async function withLockedRefundOperationForTest<T>(
  operationId: string,
  run: () => Promise<T>,
): Promise<T> {
  await using transaction = await beginTransaction()
  await transaction(sql`/* lockRefundReconciliationForSkipLockedTest */
    SELECT id FROM membership_operations WHERE id = ${operationId} FOR UPDATE`)
  return await run()
}

export async function ageRefundReconciliationLeaseForTest(operationId: string): Promise<void> {
  await write(sql`/* ageRefundReconciliationLease */ UPDATE membership_operation_execution_work_items
    SET leased_at = clock_timestamp() - INTERVAL '6 minutes', lease_expires_at = clock_timestamp() - INTERVAL '1 minute'
    WHERE membership_operation_id = ${operationId}`)
}
