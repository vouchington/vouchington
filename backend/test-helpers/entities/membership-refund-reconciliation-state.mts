import { beginTransaction, read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function getRefundOperationLeaseTokenForTest(operationId: string): Promise<string> {
  const { rows } = await read<{ executionClaimToken: string }>(sql`/* getRefundMetadataScanLease */
    SELECT execution_claim_token AS "executionClaimToken" FROM membership_operations WHERE id = ${operationId}`)
  return rows[0]!.executionClaimToken
}

export async function getRefundOperationRetryStateForTest(operationId: string) {
  const { rows } = await read<{
    due: boolean
    failed: boolean
    leased: boolean
  }>(sql`/* administratorProviderExceptionRetry */
    SELECT reconciliation_due_at > CURRENT_TIMESTAMP AS due, failed_at IS NOT NULL AS failed,
      execution_claim_token IS NOT NULL AS leased FROM membership_operations WHERE id = ${operationId}`)
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
    SELECT operation.completed_at IS NOT NULL AS completed, COALESCE(receipt.revoked_access, FALSE) AS "revokedAccess",
      CASE WHEN membership.cancelled_at IS NULL THEN 'active' ELSE 'cancelled' END AS status,
      (SELECT COUNT(*)::TEXT FROM membership_refunds WHERE membership_operation_id = operation.id) AS "receiptCount",
      (SELECT COUNT(*)::TEXT FROM membership_changes WHERE membership_id = ${membershipId} AND change_type = 'refund') AS "auditCount"
    FROM membership_operations operation INNER JOIN memberships membership ON membership.id = ${membershipId}
    LEFT JOIN membership_refunds receipt ON receipt.membership_operation_id = operation.id WHERE operation.id = ${operationId}`)
  return rows[0]
}

export async function makeRefundOperationDueForTest(operationId: string): Promise<void> {
  await write(sql`/* makeAdministratorRefundOperationDue */ UPDATE membership_operations
    SET reconciliation_due_at = CURRENT_TIMESTAMP WHERE id = ${operationId}`)
}

export async function cleanupRefundReconciliationOperationsForTest(
  operationIds: readonly string[],
): Promise<void> {
  if (operationIds.length === 0) return

  await using transaction = await beginTransaction()
  await transaction(sql`/* claimRefundReconciliationDispatcherTestCleanup */ UPDATE membership_operations
    SET execution_claim_token = uuidv7(), execution_claimed_at = CURRENT_TIMESTAMP,
      failed_at = NULL, failure_message = NULL,
      reconciliation_attempt_ordinal = reconciliation_attempt_ordinal + 1
    WHERE id = ANY(${operationIds}::uuid[]) AND completed_at IS NULL
      AND execution_claim_token IS NULL`)
  await transaction(sql`/* completeRefundReconciliationDispatcherTestCleanup */ UPDATE membership_operations
    SET completed_at = CURRENT_TIMESTAMP, reconciliation_due_at = NULL, execution_claim_token = NULL,
      execution_claimed_at = NULL, failed_at = NULL, failure_message = NULL
    WHERE id = ANY(${operationIds}::uuid[]) AND completed_at IS NULL
      AND execution_claim_token IS NOT NULL`)
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
  await write(sql`/* ageRefundReconciliationLease */ UPDATE membership_operations
    SET execution_claimed_at = CURRENT_TIMESTAMP - INTERVAL '6 minutes' WHERE id = ${operationId}`)
}
